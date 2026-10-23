// Panneaux de verre du bureau (toutes les applis, notifications, notes, agenda, réglages…) :
// un seul ouvert à la fois, fermé par Échap ou par un clic à côté
(() => {
    const panels = new Map();
    let current = null;

    // Déclare un panneau : `el` (élément .panneau), et des fonctions facultatives
    // appelées à l'ouverture et à la fermeture
    function register(id, el, { onOpen, onClose } = {}) {
        panels.set(id, { el, onOpen, onClose });
        el.hidden = true;
        el.querySelector('.panneau-fermer')?.addEventListener('click', close);
    }

    function open(id) {
        if (current === id) return;
        close();
        window.robbiePanel?.close();

        const panel = panels.get(id);
        if (!panel) return;
        current = id;
        panel.el.hidden = false;
        requestAnimationFrame(() => panel.el.classList.add('ouvert'));
        panel.onOpen?.();
        document.dispatchEvent(new CustomEvent('panneau-ouvert', { detail: id }));
    }

    function close() {
        if (!current) return;
        const panel = panels.get(current);
        const id = current;
        current = null;
        panel.el.classList.remove('ouvert');
        setTimeout(() => {
            if (current !== id) panel.el.hidden = true;
        }, 250);
        panel.onClose?.();
        document.dispatchEvent(new CustomEvent('panneau-ferme', { detail: id }));
    }

    const toggle = id => (current === id ? close() : open(id));

    // Fabrique un panneau standard : titre en Orbitron, bouton fermer, zone de contenu
    function create(id, title, { place = 'cote', onOpen, onClose } = {}) {
        const el = document.createElement('section');
        el.className = `panneau panneau-${place}`;
        el.setAttribute('aria-label', title);
        el.innerHTML = `
            <header class="panneau-tete">
                <span class="panneau-titre">${title.toUpperCase()}</span>
                <span class="panneau-actions"></span>
                <button class="panneau-fermer" data-icon="x" aria-label="Fermer"></button>
            </header>
            <div class="panneau-corps"></div>`;
        document.body.append(el);
        window.icons.fill(el);
        register(id, el, { onOpen, onClose });
        return { el, body: el.querySelector('.panneau-corps'), actions: el.querySelector('.panneau-actions') };
    }

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && current) close();
    });

    // Clic en dehors du panneau ouvert (et de ce qui l'a ouvert) : on le ferme
    document.addEventListener('mousedown', event => {
        if (!current) return;
        const panel = panels.get(current);
        if (panel.el.contains(event.target) || event.target.closest('[data-panneau], .tuile, .menu-dock')) return;
        close();
    });

    // Commande par nom (raccourcis clavier, Robbie) : ouvre ou ferme le panneau du même nom
    window.os.onShortcut(name => {
        if (panels.has(name) && !['lanceur', 'notifications'].includes(name)) toggle(name);
    });

    window.panneaux = { register, create, open, close, toggle, current: () => current };
})();
