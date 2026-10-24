// Logithèque › Mises à jour : ce qui attend (applis de Flathub, paquets du système), tout installer
// en un clic, la progression (aussi quand l'installation vient de la notification), redémarrer
(() => {
    const api = window.logitheque;
    const { escape, iconHtml, emptyHtml, message, isAdmin, current } = window.logi;
    const counter = document.querySelector('#compteur');

    let state = null;
    let checking = false;
    let icons = new Map();

    // « il y a 2 heures », « hier »…
    function ago(time) {
        if (!time) return 'jamais';
        const minutes = Math.round((Date.now() - time) / 60000);
        if (minutes < 2) return 'à l’instant';
        if (minutes < 60) return `il y a ${minutes} minutes`;
        const hours = Math.round(minutes / 60);
        if (hours < 24) return `il y a ${hours} heure${hours > 1 ? 's' : ''}`;
        const days = Math.round(hours / 24);
        return days === 1 ? 'hier' : `il y a ${days} jours`;
    }

    function updateCounter() {
        const count = state?.count || 0;
        counter.hidden = !count;
        counter.textContent = count;
    }

    function summaryHtml() {
        const admin = isAdmin();
        if (state.running) {
            return `<div class="maj-resume">
                <span class="pastille"><span data-icon="refresh"></span></span>
                <div class="maj-resume-texte">
                    <b>Installation des mises à jour</b>
                    <span>${escape(state.running.texte)} · ${state.running.progression}%</span>
                    <div class="barre-progres" style="--p:${state.running.progression}"><i></i></div>
                </div>
            </div>`;
        }
        if (state.count) {
            const security = state.security ? ` · dont ${state.security} correctif${state.security > 1 ? 's' : ''} de sécurité` : '';
            return `<div class="maj-resume">
                <span class="pastille"><span data-icon="download"></span></span>
                <div class="maj-resume-texte">
                    <b>${state.count} mise${state.count > 1 ? 's' : ''} à jour disponible${state.count > 1 ? 's' : ''}</b>
                    <span>${admin ? `Vérifié ${ago(state.checked)}${security}` : 'Seul un administrateur peut les installer'}</span>
                </div>
                <div class="actions">
                    <button class="bouton" data-maj-verifier ${checking || !admin ? 'disabled' : ''}>${checking ? 'Vérification…' : 'Vérifier'}</button>
                    <button class="bouton principal" data-maj-installer ${admin ? '' : 'disabled'}>Tout mettre à jour</button>
                </div>
            </div>`;
        }
        return `<div class="maj-resume">
            <span class="pastille"><span data-icon="shield"></span></span>
            <div class="maj-resume-texte">
                <b>Robbie OS est à jour</b>
                <span>Vérifié ${ago(state.checked)} · les correctifs de sécurité s’installent tout seuls</span>
            </div>
            <div class="actions"><button class="bouton" data-maj-verifier ${checking || !admin ? 'disabled' : ''}>${checking ? 'Vérification…' : 'Vérifier maintenant'}</button></div>
        </div>`;
    }

    async function render(container) {
        if (!state) state = await api.updates();
        if (!icons.size) icons = new Map((await api.installed().catch(() => [])).map(app => [app.id, app.iconData]));
        if (current() !== 'mises-a-jour') return;

        let html = '<header class="entete"><div><h2>Mises à jour</h2><p>Le système et les applis de Flathub</p></div></header>';
        if (state.reboot && !state.running) {
            html += `<div class="maj-resume">
                <span class="pastille"><span data-icon="restart"></span></span>
                <div class="maj-resume-texte"><b>Redémarrage nécessaire</b><span>Une partie des mises à jour (le noyau, par exemple) prendra effet au prochain démarrage.</span></div>
                <div class="actions"><button class="bouton principal" data-maj-redemarrer>Redémarrer</button></div>
            </div>`;
        }
        html += summaryHtml();
        if (state.last && !state.last.ok && !state.running) {
            html += '<p class="securite">La dernière installation ne s’est pas terminée correctement : relance « Tout mettre à jour ».</p>';
        }

        const apps = state.apps.filter(item => item.appli);
        const parts = state.apps.length - apps.length;
        if (apps.length || state.system.length) {
            html += '<div class="liste">';
            html += apps.map(item => `<div class="ligne-appli">
                ${iconHtml({ iconData: icons.get(item.id) })}
                <div class="carte-texte"><b>${escape(item.nom)}</b><span>${item.version ? `Version ${escape(item.version)}` : 'Nouvelle version'}</span></div>
                <span class="source">Flathub</span>
            </div>`).join('');
            if (state.system.length) {
                html += `<details class="paquets ligne-appli" style="display:block;padding:0">
                    <summary>
                        <span class="icon chevron" data-icon="chevron-right"></span>
                        <span class="pastille" style="width:46px;height:46px"><span data-icon="cpu"></span></span>
                        <span class="carte-texte"><b>Système Robbie OS</b><span>${state.system.length} paquet${state.system.length > 1 ? 's' : ''} de Debian${state.security ? ` · <span class="securite">${state.security} de sécurité</span>` : ''}</span></span>
                    </summary>
                    <ul>${state.system.map(item => `<li title="${escape(item.actuelle)} → ${escape(item.nouvelle)}">${item.securite ? '<span class="securite">●</span> ' : ''}${escape(item.nom)} <small>${escape(item.nouvelle)}</small></li>`).join('')}</ul>
                </details>`;
            }
            if (parts) {
                html += `<div class="ligne-appli"><span class="pastille" style="width:46px;height:46px"><span data-icon="grid"></span></span>
                    <div class="carte-texte"><b>Composants des applis</b><span>${parts} élément${parts > 1 ? 's' : ''} partagé${parts > 1 ? 's' : ''} par les applis de Flathub</span></div></div>`;
            }
            html += '</div>';
        } else if (!state.running) {
            html += emptyHtml('check', 'Rien à installer', 'Robbie OS vérifie chaque jour. Une notification te prévient quand il y a du nouveau.');
        }

        container.innerHTML = html;
        window.icons.fill(container);
    }

    async function refresh() {
        updateCounter();
        if (current() === 'mises-a-jour') await render(document.querySelector('#contenu'));
    }

    document.addEventListener('click', async event => {
        const target = event.target.closest('button');
        if (!target) return;
        if (target.matches('[data-maj-installer]')) {
            target.disabled = true;
            const result = await api.installUpdates();
            if (!result.ok) message(result.error);
            else message('Mises à jour installées');
            icons = new Map();
            state = await api.updates();
            refresh();
        } else if (target.matches('[data-maj-verifier]')) {
            checking = true;
            refresh();
            const result = await api.checkUpdates();
            checking = false;
            if (!result.ok) message(result.error);
            state = await api.updates();
            refresh();
        } else if (target.matches('[data-maj-redemarrer]')) {
            api.restart();
        }
    });

    // L'état change (vérification du minuteur, progression, installation lancée par la notification)
    api.onUpdates(newState => {
        state = newState;
        refresh();
    });
    api.updates().then(newState => {
        state = newState;
        updateCounter();
    });

    window.majVue = { render };
})();
