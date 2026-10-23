// Assemblage du bureau : barre de gauche, dock, bouton « Demander à Robbie », éteindre
(() => {
    const { $, escape, overlays } = window.ui;

    // Barre de gauche
    document.querySelectorAll('.rail [data-action]').forEach(button => {
        button.addEventListener('click', () => {
            const action = button.dataset.action;

            if (action.startsWith('app:')) {
                const app = window.launcher.all().find(item => item.id === action.slice(4));
                if (app) window.launcher.launch(app);
                else window.ui.toast('Cette appli n\'est pas installée', 'x');
            } else if (action === 'accueil') {
                overlays.close();
            } else if (action === 'robbie') {
                overlays.open('palette');
            } else {
                overlays.toggle(action);
            }
        });
    });

    // Le bouton actif de la barre suit la fenêtre ouverte
    const markRail = id => {
        document.querySelectorAll('.rail-item').forEach(item => {
            item.classList.toggle('active', id ? item.dataset.action === id : item.dataset.action === 'accueil');
        });
    };
    document.addEventListener('overlay-open', event => markRail(event.detail));
    document.addEventListener('overlay-close', () => markRail(null));

    // Dock : les applis épinglées, puis le bouton de toutes les applis
    function renderDock() {
        const pinned = window.settings.get()?.pinned || [];
        const apps = pinned.map(id => window.launcher.all().find(app => app.id === id)).filter(Boolean);

        $('#dock').innerHTML = apps.map(app => `
            <button class="dock-app" data-id="${escape(app.id)}" title="${escape(app.name)}">
                <span class="app-icon">${window.launcher.appIcon(app)}</span>
                <span class="dock-label">${escape(app.name)}</span>
            </button>`).join('') + `
            <span class="dock-sep"></span>
            <button class="dock-app all" data-all title="Toutes les applis">${window.icons.icon('grid')}<span class="dock-label">Toutes les applis</span></button>`;
    }

    $('#dock').addEventListener('click', event => {
        const button = event.target.closest('.dock-app');
        if (!button) return;
        if (button.hasAttribute('data-all')) return overlays.open('lanceur');
        window.launcher.launch(window.launcher.all().find(app => app.id === button.dataset.id));
    });

    Promise.all([window.launcher.ready, new Promise(resolve => {
        if (window.settings.get()) resolve();
        else document.addEventListener('settings-ready', resolve, { once: true });
    })]).then(renderDock);
    document.addEventListener('settings-changed', renderDock);

    $('#ask').addEventListener('click', () => overlays.open('palette'));

    // Éteindre
    document.querySelectorAll('[data-power]').forEach(button => {
        button.addEventListener('click', () => {
            overlays.close();
            const action = button.dataset.power;
            window.robbie.say(action === 'suspend' ? 'Bonne pause ! 😴' : 'À bientôt ! 👋', action === 'suspend' ? 'tired' : 'happy', 2000);
            setTimeout(() => window.os.power(action), 1200);
        });
    });

    // Touche Super (envoyée par labwc) : la palette
    window.os.onShortcut(name => {
        if (name === 'palette') overlays.toggle('palette');
    });

    // Bonjour au démarrage
    setTimeout(() => {
        const h = new Date().getHours();
        const hello = h < 6 ? 'Encore debout ? Je suis là.' : h < 12 ? 'Bonjour ! Prêt pour la journée ?' : h < 18 ? 'Re-bonjour ! On s\'y remet ?' : 'Bonsoir ! Content de te revoir.';
        window.robbie.say(hello, 'happy', 4500);
    }, 1800);
})();
