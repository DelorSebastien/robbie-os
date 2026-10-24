// Disposition du bureau (Réglages › Apparence) : barre latérale à gauche ou à droite (la classe
// .barre-gauche déplace la barre et ses panneaux), taille du dock, et place laissée au dock par
// les fenêtres agrandies (labwc réserve la place, voir services/disposition.js)
(() => {
    const SIZES = { petit: 0.85, moyen: 1, grand: 1.15 };
    let state = { barre: 'droite', dockTaille: 'moyen', pleinEcran: false };

    function set(changes = {}) {
        state = { ...state, ...changes };
        const left = state.barre === 'gauche';
        document.documentElement.classList.toggle('barre-gauche', left);
        document.documentElement.style.setProperty('--dock-echelle', SIZES[state.dockTaille] || 1);
        window.os.setLayout(left ? 'gauche' : 'droite', state.pleinEcran);
        window.dispatchEvent(new Event('resize'));
    }

    window.os.settings().then(settings => set({ barre: settings.barre, dockTaille: settings.dockTaille, pleinEcran: settings.pleinEcran }));
    window.disposition = { set, scale: () => SIZES[state.dockTaille] || 1 };
})();
