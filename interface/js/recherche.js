// Recherche globale (Super+Espace) : une barre au centre de l'écran qui trouve les applis,
// les réglages, les fichiers du dossier personnel, fait les calculs, et propose sinon de
// demander à Robbie. Flèches pour choisir, Entrée pour ouvrir, Échap pour fermer.
(() => {
    const { escape, score } = window.ui;

    const el = document.createElement('section');
    el.className = 'panneau panneau-recherche';
    el.setAttribute('aria-label', 'Recherche');
    el.innerHTML = `
        <label class="recherche-champ">
            <span data-icon="search"></span>
            <input placeholder="Rechercher une appli, un fichier, un réglage… ou calculer" autocomplete="off" aria-label="Rechercher">
            <kbd>Super + Espace</kbd>
        </label>
        <div class="recherche-resultats" role="listbox"></div>`;
    document.body.append(el);
    window.icons.fill(el);

    const input = el.querySelector('input');
    const box = el.querySelector('.recherche-resultats');

    // Réglages qu'on peut chercher par leur nom ou par un mot proche
    const SETTINGS = [
        { label: 'Apparence', words: 'apparence thème sombre clair fond écran couleur barre latérale yeux costumes accent dock', section: 'apparence', icon: 'sparkles' },
        { label: 'Robbie', words: 'robbie voix micro écoute ville météo', section: 'robbie', icon: 'person' },
        { label: 'Comptes', words: 'comptes utilisateur mot de passe enfant invité administrateur déconnexion', section: 'comptes', icon: 'users' },
        { label: 'Son', words: 'son volume haut-parleur sortie', section: 'son', icon: 'volume' },
        { label: 'Écran', words: 'écran résolution luminosité affichage', section: 'ecran', icon: 'grid' },
        { label: 'Système', words: 'système verrouillage veille éteindre redémarrer informations mémoire processeur', section: 'systeme', icon: 'cpu' },
        { label: 'Wi-Fi et réseau', words: 'wifi réseau internet connexion', panel: 'rapide', icon: 'wifi' }
    ];

    let apps = [];
    let results = [];
    let selected = 0;
    let request = 0;

    // Calcul : seulement des nombres et des opérations (2+2, 12*7, (3,5+1)/2, 2^10, 15%) ;
    // un petit calculateur à nous (la page n'a pas le droit d'évaluer du code)
    function calculate(text) {
        const tokens = text.replace(/\s/g, '').replace(/,/g, '.').match(/\d+(?:\.\d+)?|[+\-*/()%^]/g);
        if (!tokens || tokens.join('') !== text.replace(/\s/g, '').replace(/,/g, '.')) return null;
        if (!tokens.some(t => /[+\-*/^%]/.test(t)) || tokens.length < 2) return null;
        let i = 0;
        const peek = () => tokens[i];
        const number = () => {
            const t = tokens[i++];
            if (t === '(') {
                const value = sum();
                if (tokens[i++] !== ')') throw new Error('parenthèse');
                return value;
            }
            if (t === '-') return -factor();
            if (t === '+') return factor();
            if (!/^\d/.test(t || '')) throw new Error('nombre');
            return Number(t);
        };
        const factor = () => {
            let value = number();
            while (peek() === '%') { i++; value /= 100; }
            if (peek() === '^') { i++; value = value ** factor(); }
            return value;
        };
        const product = () => {
            let value = factor();
            while (peek() === '*' || peek() === '/') value = tokens[i++] === '*' ? value * factor() : value / factor();
            return value;
        };
        const sum = () => {
            let value = product();
            while (peek() === '+' || peek() === '-') value = tokens[i++] === '+' ? value + product() : value - product();
            return value;
        };
        try {
            const value = sum();
            if (i !== tokens.length || !Number.isFinite(value)) return null;
            return Number(value.toPrecision(12)).toLocaleString('fr-FR', { maximumFractionDigits: 10 });
        } catch {
            return null;
        }
    }

    async function update() {
        const query = input.value.trim();
        const id = ++request;
        const list = [];
        if (!query) {
            results = [];
            render();
            return;
        }

        const total = calculate(query);
        if (total !== null) list.push({ group: 'Calcul', icon: 'calculator', label: `= ${total}`, detail: 'Entrée pour copier le résultat', run: () => navigator.clipboard.writeText(total.replace(/\s/g, '')).then(() => window.ui.toast('Résultat copié', 'check')) });

        const appName = app => window.dock?.look(app).name || app.name;
        apps.map(app => ({ app, s: score(query, appName(app), app.name, app.description, app.keywords) }))
            .filter(item => item.s >= 1).sort((a, b) => b.s - a.s).slice(0, 5)
            .forEach(({ app }) => list.push({ group: 'Applis', glyph: window.dock?.look(app).glyph, img: app.icon, label: appName(app), detail: app.description, run: () => window.os.launch(app.id) }));

        SETTINGS.map(item => ({ item, s: score(query, item.label, item.words) })).filter(x => x.s >= 1).sort((a, b) => b.s - a.s).slice(0, 3)
            .forEach(({ item }) => list.push({ group: 'Réglages', icon: item.icon, label: item.label, detail: 'Réglages', run: () => item.panel ? window.panneaux.open(item.panel) : window.reglages.open(item.section) }));

        results = list.concat([{ group: 'Robbie', icon: 'sparkles', label: `Demander à Robbie : « ${query} »`, detail: 'Il répond dans son panneau', run: () => window.robbiePanel.ask(query) }]);
        render();

        // Les fichiers arrivent ensuite (le dossier personnel est parcouru la première fois)
        const files = await window.os.searchFiles(query);
        if (id !== request || !files.length) return;
        const robbie = results.pop();
        results = results.concat(files.map(file => ({
            group: 'Fichiers', icon: file.isDir ? 'folder' : 'file', label: file.name, detail: file.dir, run: () => window.os.openFile(file.path)
        })), [robbie]);
        render();
    }

    function render() {
        selected = Math.min(selected, Math.max(0, results.length - 1));
        let lastGroup = null;
        box.innerHTML = results.map((item, index) => {
            const title = item.group !== lastGroup ? `<p class="recherche-groupe">${escape(item.group)}</p>` : '';
            lastGroup = item.group;
            const icon = item.glyph || (item.img ? `<img src="${item.img}" alt="">` : `<span data-icon="${item.icon}"></span>`);
            return `${title}<button class="recherche-ligne${index === selected ? ' choisie' : ''}" data-index="${index}" role="option" aria-selected="${index === selected}">
                <span class="recherche-icone">${icon}</span>
                <span class="recherche-texte"><b>${escape(item.label)}</b>${item.detail ? `<small>${escape(item.detail)}</small>` : ''}</span>
            </button>`;
        }).join('');
        window.icons.fill(box);
        el.classList.toggle('avec-resultats', results.length > 0);
    }

    function run(index) {
        const item = results[index];
        if (!item) return;
        window.panneaux.close();
        item.run();
    }

    input.addEventListener('input', () => {
        selected = 0;
        update();
    });

    input.addEventListener('keydown', event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            selected = Math.max(0, Math.min(results.length - 1, selected + (event.key === 'ArrowDown' ? 1 : -1)));
            render();
            box.querySelector('.choisie')?.scrollIntoView({ block: 'nearest' });
        } else if (event.key === 'Enter') {
            run(selected);
        }
    });

    box.addEventListener('click', event => {
        const line = event.target.closest('[data-index]');
        if (line) run(Number(line.dataset.index));
    });

    window.panneaux.register('recherche', el, {
        onOpen: async () => {
            input.value = '';
            results = [];
            render();
            setTimeout(() => input.focus(), 50);
            await window.compte.ready;
            apps = (await window.os.apps()).filter(app => window.compte.allowed(app.id));
        }
    });
})();
