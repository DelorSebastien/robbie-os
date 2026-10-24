// Thème clair ou sombre de Robbie OS (Réglages › Apparence) : « sombre », « clair », ou « auto » :
// clair du lever au coucher du soleil de la ville des réglages, comme le fond au fil du jour.
// L'interface change avec la classe .clair (styles/theme-clair.css), les fenêtres des applis
// et leurs barres de titre suivent (services/theme.js)
(() => {
    const MODES = ['sombre', 'clair', 'auto'];
    let mode = 'sombre';
    let place = { latitude: 44.0556, longitude: 5.0481 };
    let applied = null;

    function effective() {
        if (mode !== 'auto') return mode;
        const now = new Date();
        const { sunrise, sunset } = window.soleil.sunTimes(now, place.latitude, place.longitude);
        const minutes = now.getHours() * 60 + now.getMinutes();
        return minutes >= sunrise && minutes < sunset ? 'clair' : 'sombre';
    }

    function apply() {
        const theme = effective();
        if (theme === applied) return;
        applied = theme;
        document.documentElement.classList.toggle('clair', theme === 'clair');
        window.os.setTheme(theme);
    }

    function set(newMode, newPlace) {
        mode = MODES.includes(newMode) ? newMode : 'sombre';
        if (newPlace?.latitude != null) place = newPlace;
        apply();
    }

    // (en automatique, on vérifie chaque minute si le soleil s'est levé ou couché)
    setInterval(apply, 60 * 1000);
    window.os.settings().then(settings => set(settings.theme, settings.place));

    window.theme = { set, mode: () => mode, current: () => applied };
})();
