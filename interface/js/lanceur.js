// Toutes les applis : grille de toutes les applis installées, avec recherche.
// Entrée lance la première, clic droit pour épingler au dock ou retirer.
(() => {
    const { escape, score } = window.ui;
    const panel = document.getElementById('lanceur');
    const search = document.getElementById('lanceur-recherche');
    const grid = document.getElementById('lanceur-grille');

    let apps = [];
    let shown = [];
    let selected = 0;

    const appIcon = app => (app.icon
        ? `<img src="${app.icon}" alt="">`
        : `<span class="app-lettre">${escape(app.name.charAt(0))}</span>`);

    function render() {
        const query = search.value;
        shown = apps
            .map(app => ({ app, score: score(query, app.name, app.description, app.keywords) }))
            .filter(item => item.score > 0)
            .sort((a, b) => b.score - a.score || a.app.name.localeCompare(b.app.name, 'fr'))
            .map(item => item.app);

        selected = Math.min(selected, Math.max(0, shown.length - 1));
        const pinned = window.dock?.pinned() || [];

        grid.innerHTML = shown.map((app, index) => `
            <button class="lanceur-appli${index === selected ? ' choisie' : ''}" data-index="${index}" title="${escape(app.description)}">
                <span class="lanceur-icone">${appIcon(app)}</span>
                <span class="lanceur-nom">${escape(app.name)}</span>
                ${pinned.includes(app.id) ? '<span class="lanceur-epingle" aria-label="Épinglée au dock"></span>' : ''}
            </button>`).join('') || '<p class="lanceur-vide">Aucune appli trouvée</p>';
    }

    function launch(app) {
        if (!app) return;
        window.panneaux.close();
        window.os.launch(app.id);
    }

    search.addEventListener('input', () => {
        selected = 0;
        render();
    });

    grid.addEventListener('click', event => {
        const button = event.target.closest('[data-index]');
        if (button) launch(shown[Number(button.dataset.index)]);
    });

    // Clic droit : épingler au dock ou retirer
    grid.addEventListener('contextmenu', event => {
        const button = event.target.closest('[data-index]');
        if (!button) return;
        event.preventDefault();
        const app = shown[Number(button.dataset.index)];
        const pinned = window.dock.pinned();
        const next = pinned.includes(app.id) ? pinned.filter(id => id !== app.id) : [...pinned, app.id];
        document.dispatchEvent(new CustomEvent('pinned-changed', { detail: next }));
        window.ui.toast(pinned.includes(app.id) ? `${app.name} retiré du dock` : `${app.name} épinglé au dock`, 'check');
        setTimeout(render, 50);
    });

    // Flèches pour se déplacer, Entrée pour lancer
    panel.addEventListener('keydown', event => {
        const columns = Math.max(1, Math.round(grid.clientWidth / 112));
        const moves = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns };

        if (moves[event.key] !== undefined) {
            event.preventDefault();
            selected = Math.max(0, Math.min(shown.length - 1, selected + moves[event.key]));
            render();
            grid.querySelector('.choisie')?.scrollIntoView({ block: 'nearest' });
        } else if (event.key === 'Enter') {
            launch(shown[selected]);
        }
    });

    window.panneaux.register('lanceur', panel, {
        onOpen: async () => {
            await window.compte.ready;
            apps = (await window.os.apps()).filter(app => window.compte.allowed(app.id));
            search.value = '';
            selected = 0;
            render();
            setTimeout(() => search.focus(), 50);
        }
    });

    window.os.onShortcut(name => {
        if (name === 'lanceur') window.panneaux.toggle('lanceur');
    });

    window.launcher = { toggle: () => window.panneaux.toggle('lanceur') };
})();
