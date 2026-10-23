// Lanceur : toutes les applis installées, rangées par famille, avec recherche
(() => {
    const { $, escape, score, overlays, toast } = window.ui;

    const FAMILIES = {
        tout: 'Tout',
        internet: 'Internet',
        bureautique: 'Bureautique',
        multimedia: 'Multimédia',
        developpement: 'Développement',
        jeux: 'Jeux',
        systeme: 'Système',
        autres: 'Autres'
    };

    let apps = [];
    let family = 'tout';
    let selected = 0;
    let shown = [];

    const ready = window.os.apps().then(list => {
        apps = list;
        document.dispatchEvent(new CustomEvent('apps-ready', { detail: apps }));
        return apps;
    });

    function appIcon(app) {
        return app.icon
            ? `<img src="${app.icon}" alt="">`
            : `<span class="app-letter">${escape(app.name.charAt(0))}</span>`;
    }

    async function launch(app) {
        if (!app) return;
        overlays.close();
        await window.os.launch(app.id);
        toast(`Ouverture de ${app.name}`, 'sparkles');
        window.face.setExpression('happy', 1200);
    }

    function render() {
        const query = $('#lanceur-recherche').value;
        shown = apps
            .filter(app => family === 'tout' || app.family === family)
            .map(app => ({ app, score: score(query, app.name, app.description, app.keywords) }))
            .filter(item => item.score > 0)
            .sort((a, b) => b.score - a.score || a.app.name.localeCompare(b.app.name, 'fr'))
            .map(item => item.app);

        selected = Math.min(selected, Math.max(0, shown.length - 1));

        $('#lanceur-grille').innerHTML = shown.map((app, index) => `
            <button class="app${index === selected ? ' selected' : ''}" data-index="${index}" title="${escape(app.description)}">
                <span class="app-icon">${appIcon(app)}</span>
                <span class="app-name">${escape(app.name)}</span>
            </button>`).join('') || '<p class="nothing">Aucune appli trouvée</p>';

        const present = new Set(apps.map(app => app.family));
        $('#lanceur-familles').innerHTML = Object.entries(FAMILIES)
            .filter(([key]) => key === 'tout' || present.has(key))
            .map(([key, label]) => `<button class="chip${key === family ? ' active' : ''}" data-family="${key}">${label}</button>`)
            .join('');
    }

    $('#lanceur-recherche').addEventListener('input', () => {
        selected = 0;
        render();
    });

    $('#lanceur-familles').addEventListener('click', event => {
        const chip = event.target.closest('[data-family]');
        if (!chip) return;
        family = chip.dataset.family;
        selected = 0;
        render();
    });

    $('#lanceur-grille').addEventListener('click', event => {
        const button = event.target.closest('[data-index]');
        if (button) launch(shown[Number(button.dataset.index)]);
    });

    // Flèches pour se déplacer dans la grille, Entrée pour lancer
    $('#lanceur').addEventListener('keydown', event => {
        const columns = Math.max(1, Math.round($('#lanceur-grille').clientWidth / 120));
        const moves = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns };

        if (moves[event.key] !== undefined) {
            event.preventDefault();
            selected = Math.max(0, Math.min(shown.length - 1, selected + moves[event.key]));
            render();
            $('#lanceur-grille .selected')?.scrollIntoView({ block: 'nearest' });
        } else if (event.key === 'Enter') {
            launch(shown[selected]);
        }
    });

    document.addEventListener('overlay-open', async event => {
        if (event.detail !== 'lanceur') return;
        await ready;
        $('#lanceur-recherche').value = '';
        family = 'tout';
        selected = 0;
        render();
        $('#lanceur-recherche').focus();
    });

    window.launcher = { ready, launch, appIcon, all: () => apps };
})();
