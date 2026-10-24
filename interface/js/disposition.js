// Barre latérale à gauche ou à droite de l'écran (Réglages › Apparence) : la classe .barre-gauche
// déplace la barre et ses panneaux (styles/panneaux.css), labwc réserve la place du bon côté
(() => {
    function set(side) {
        const left = side === 'gauche';
        document.documentElement.classList.toggle('barre-gauche', left);
        window.os.setSidebarSide(left ? 'gauche' : 'droite');
    }

    window.os.settings().then(settings => set(settings.barre));
    window.disposition = { set };
})();
