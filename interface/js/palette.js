// Palette « Demander à Robbie » : un seul champ pour lancer une appli, calculer,
// noter une idée, agir sur la machine… ou parler à Robbie
(() => {
    const { $, escape, score, overlays, toast } = window.ui;

    // Calculatrice : + - × ÷ ^ %, parenthèses, virgule ou point (sans eval)
    function calculate(text) {
        const source = text.replace(/\s+/g, '').replace(/,/g, '.').replace(/[x×]/g, '*').replace(/÷/g, '/');
        if (!/^[\d.+\-*/^%()]+$/.test(source) || !/\d/.test(source) || !/[+\-*/^%]/.test(source)) return null;

        let i = 0;
        const peek = () => source[i];
        const next = () => source[i++];

        function number() {
            if (peek() === '(') {
                next();
                const value = sum();
                if (next() !== ')') throw new Error('parenthèse');
                return value;
            }
            if (peek() === '-') {
                next();
                return -number();
            }
            const start = i;
            while (/[\d.]/.test(peek() || '')) next();
            const value = Number(source.slice(start, i));
            if (start === i || Number.isNaN(value)) throw new Error('nombre');
            if (peek() === '%') {
                next();
                return value / 100;
            }
            return value;
        }

        function power() {
            const base = number();
            if (peek() === '^') {
                next();
                return base ** power();
            }
            return base;
        }

        function product() {
            let value = power();
            while (peek() === '*' || peek() === '/') value = next() === '*' ? value * power() : value / power();
            return value;
        }

        function sum() {
            let value = product();
            while (peek() === '+' || peek() === '-') value = next() === '+' ? value + product() : value - product();
            return value;
        }

        try {
            const value = sum();
            if (i !== source.length || !Number.isFinite(value)) return null;
            return Math.round(value * 1e10) / 1e10;
        } catch {
            return null;
        }
    }

    const format = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 10 });

    const ACTIONS = [
        { title: 'Réglages rapides', detail: 'Son, couleur de Robbie, météo', icon: 'sliders', words: 'reglages parametres son volume couleur', run: () => overlays.open('reglages') },
        { title: 'Toutes les applis', detail: 'Ouvrir le lanceur', icon: 'grid', words: 'applis applications lanceur programmes', run: () => overlays.open('lanceur') },
        { title: 'Mettre en veille', detail: 'L\'ordinateur s\'endort', icon: 'moon', words: 'veille dormir suspendre', run: () => window.os.power('suspend') },
        { title: 'Redémarrer', detail: 'Relancer l\'ordinateur', icon: 'restart', words: 'redemarrer relancer reboot', run: () => window.os.power('reboot') },
        { title: 'Éteindre', detail: 'Arrêter l\'ordinateur', icon: 'power', words: 'eteindre arreter shutdown', run: () => window.os.power('poweroff') },
        { title: 'Couper ou remettre le son', detail: 'Muet', icon: 'volume-x', words: 'muet couper son silence', run: async () => {
            const volume = await window.os.toggleMute();
            toast(volume?.muted ? 'Son coupé' : 'Son rétabli', volume?.muted ? 'volume-x' : 'volume');
        } }
    ];

    let results = [];
    let selected = 0;

    function build(query) {
        const q = query.trim();
        const list = [];

        // Calcul
        const value = calculate(q);
        if (value !== null) {
            list.push({ group: 'Calcul', title: `= ${format.format(value)}`, detail: 'Entrée pour copier le résultat', icon: 'calculator', run: async () => {
                try {
                    await navigator.clipboard.writeText(String(value));
                    toast('Résultat copié', 'check');
                } catch {
                    toast(`Résultat : ${format.format(value)}`, 'calculator');
                }
            } });
        }

        // Note rapide : « note : acheter du pain »
        const note = q.match(/^(?:note|noter|rappel)\s*:?\s+(.+)/i);
        if (note) {
            list.push({ group: 'Notes', title: `Ajouter « ${note[1]} »`, detail: 'Dans les notes rapides', icon: 'note', run: () => {
                window.widgets.addNote(note[1]);
                toast('Note ajoutée', 'note');
            } });
        }

        // Applis
        const apps = window.launcher.all()
            .map(app => ({ app, score: score(q, app.name, app.description, app.keywords) }))
            .filter(item => item.score > (q ? 0.5 : 99))
            .sort((a, b) => b.score - a.score)
            .slice(0, 5);
        apps.forEach(({ app }) => list.push({ group: 'Applis', title: app.name, detail: app.description, image: window.launcher.appIcon(app), run: () => window.launcher.launch(app) }));

        // Actions
        ACTIONS
            .map(action => ({ action, score: q ? score(q, action.title, action.words) : 1 }))
            .filter(item => item.score > 0.5)
            .sort((a, b) => b.score - a.score)
            .slice(0, q ? 3 : 6)
            .forEach(({ action }) => list.push({ group: 'Actions', ...action }));

        // Toujours possible : demander à Robbie
        if (q) {
            const ask = { group: 'Robbie', title: `Demander à Robbie : « ${q} »`, detail: 'Il répondra dans sa bulle', icon: 'sparkles', ask: true, run: () => askRobbie(q) };
            // Une vraie question passe avant les résultats approximatifs
            if (/\?$|^(qui|quoi|quel|quelle|comment|pourquoi|combien|est-ce|peux|dis|raconte|explique)/i.test(q) && value === null) list.unshift(ask);
            else list.push(ask);
        }

        return list;
    }

    // Réponses que Robbie sait déjà donner, en attendant que son cerveau soit branché
    function askRobbie(question) {
        overlays.close();
        window.robbie.think(true);

        setTimeout(() => {
            window.robbie.think(false);
            const q = window.ui.normalize(question);

            if (/heure/.test(q)) {
                window.robbie.say(`Il est ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}.`, 'happy');
            } else if (/date|quel jour|on est le/.test(q)) {
                window.robbie.say(`Nous sommes le ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}.`, 'happy');
            } else if (/meteo|temps qu.il fait|pleu|temperature/.test(q)) {
                document.getElementById('meteo').click();
            } else if (/bonjour|salut|coucou|hello/.test(q)) {
                window.robbie.say('Salut ! Content de te voir 😊', 'love');
            } else {
                window.robbie.say('Mon cerveau n\'est pas encore branché à Robbie OS… mais ça arrive très bientôt !', 'curious', 6000);
            }
        }, 900);
    }

    function render() {
        let group = '';
        $('#palette-resultats').innerHTML = results.map((item, index) => {
            const header = item.group !== group ? `<h4>${escape((group = item.group))}</h4>` : '';
            const visual = item.image || window.icons.icon(item.icon);
            return `${header}<button class="result${index === selected ? ' selected' : ''}${item.ask ? ' ask-result' : ''}" data-index="${index}">
                <span class="result-icon">${visual}</span>
                <span class="result-text"><b>${escape(item.title)}</b><small>${escape(item.detail || '')}</small></span>
                ${index === selected ? '<kbd>Entrée</kbd>' : ''}
            </button>`;
        }).join('');
        $('#palette-resultats .selected')?.scrollIntoView({ block: 'nearest' });
    }

    function update() {
        results = build($('#palette-recherche').value);
        selected = 0;
        render();
    }

    function run(index) {
        const item = results[index];
        if (!item) return;
        if (!item.ask) overlays.close();
        item.run();
    }

    $('#palette-recherche').addEventListener('input', update);

    $('#palette').addEventListener('keydown', event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            selected = (selected + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % Math.max(1, results.length);
            render();
        } else if (event.key === 'Enter') {
            event.preventDefault();
            run(selected);
        }
    });

    $('#palette-resultats').addEventListener('click', event => {
        const button = event.target.closest('[data-index]');
        if (button) run(Number(button.dataset.index));
    });

    $('#palette-resultats').addEventListener('mousemove', event => {
        const button = event.target.closest('[data-index]');
        if (!button || Number(button.dataset.index) === selected) return;
        selected = Number(button.dataset.index);
        render();
    });

    document.addEventListener('overlay-open', async event => {
        if (event.detail !== 'palette') return;
        await window.launcher.ready;
        $('#palette-recherche').value = '';
        update();
        $('#palette-recherche').focus();
        window.face.setExpression('curious', 1500);
    });
})();
