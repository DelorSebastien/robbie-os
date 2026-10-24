// Robbie veille discrètement : une bulle au-dessus du dock quand un rendez-vous approche ou quand
// les téléchargements débordent, et ses expressions suivent l'état de l'ordinateur
// (batterie faible : fatigué ; processeur débordé : il a le tournis). Jamais en concentration.
(() => {
    const { escape } = window.ui;
    const face = window.face;
    const shown = new Set();
    let bubble = null;

    // ---- La bulle : un message, un ou deux boutons, se ferme seule après 20 s ----
    function suggest(id, text, actions = []) {
        if (shown.has(id) || window.concentration?.active()) return;
        shown.add(id);
        bubble?.remove();
        bubble = document.createElement('div');
        bubble.className = 'suggestion';
        bubble.setAttribute('role', 'status');
        bubble.innerHTML = `<span class="suggestion-robbie" aria-hidden="true"><i></i><i></i></span>
            <span class="suggestion-texte">${escape(text)}</span>
            ${actions.map((action, index) => `<button class="bouton${index === 0 ? ' principal' : ''}" data-suggestion="${index}">${escape(action.label)}</button>`).join('')}
            <button class="suggestion-fermer" data-icon="x" aria-label="Fermer"></button>`;
        document.body.append(bubble);
        window.icons.fill(bubble);
        const el = bubble;
        const close = () => {
            el.classList.remove('visible');
            setTimeout(() => el.remove(), 300);
        };
        el.querySelectorAll('[data-suggestion]').forEach(button => button.addEventListener('click', () => {
            close();
            actions[Number(button.dataset.suggestion)].run();
        }));
        el.querySelector('.suggestion-fermer').addEventListener('click', close);
        requestAnimationFrame(() => el.classList.add('visible'));
        face?.setExpression('curious', 2500);
        setTimeout(close, 20000);
    }

    // ---- Rendez-vous dans moins de 15 minutes ----
    async function checkAgenda() {
        const agenda = await window.os.agenda().catch(() => ({}));
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        for (const event of agenda[today] || []) {
            if (!event.heure) continue;
            const [h, m] = event.heure.split(':').map(Number);
            const minutes = Math.round((new Date(now).setHours(h, m, 0, 0) - now) / 60000);
            if (minutes >= 0 && minutes <= 15) {
                suggest(`agenda-${today}-${event.heure}-${event.texte}`,
                    minutes <= 1 ? `C'est l'heure : ${event.texte}` : `Dans ${minutes} minutes : ${event.texte}`,
                    [{ label: 'Voir l\'agenda', run: () => window.panneaux.open('agenda') }]);
            }
        }
    }

    // ---- Téléchargements en vrac (une fois par session, à partir de 15 fichiers) ----
    async function checkDownloads() {
        const count = await window.os.looseDownloads().catch(() => 0);
        if (count < 15) return;
        suggest('telechargements', `Il y a ${count} fichiers en vrac dans Téléchargements. Je les range par type ?`, [
            {
                label: 'Ranger',
                run: async () => {
                    const result = await window.os.organizeDownloads();
                    window.ui.toast(result?.say || 'Téléchargements rangés', 'check');
                }
            },
            { label: 'Plus tard', run: () => {} }
        ]);
    }

    // ---- Expressions selon l'état de l'ordinateur ----
    let busySince = 0;
    let tiredShown = false;
    async function checkMood() {
        const system = await window.os.system().catch(() => null);
        if (!system || !face) return;
        if (system.battery && !system.battery.charging && system.battery.level <= 15) {
            if (!tiredShown) {
                tiredShown = true;
                face.setExpression('tired', 6000);
                suggest('batterie', `Batterie à ${system.battery.level} %. Pense à me brancher !`);
            }
        } else {
            tiredShown = false;
        }
        // (processeur à plus de 90 % pendant plus de 20 secondes)
        if (system.cpu > 90) {
            busySince ||= Date.now();
            if (Date.now() - busySince > 20000) {
                face.setExpression('dizzy', 3000);
                busySince = Date.now();
            }
        } else {
            busySince = 0;
        }
    }

    setTimeout(checkDownloads, 60000);
    setInterval(checkAgenda, 60000);
    setInterval(checkMood, 10000);
    checkAgenda();

    window.suggestions = { suggest };
})();
