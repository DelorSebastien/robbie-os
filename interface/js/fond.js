// Fond d'écran : une image fixe, ou « au fil du jour » (voir soleil.js).
// Les images sont des calques superposés : la nouvelle apparaît en fondu par-dessus l'ancienne,
// qui reste opaque en dessous (l'écran ne s'assombrit jamais pendant le passage).
(() => {
    const box = document.getElementById('fond');
    const base = box.dataset.racine || '..';
    const layers = new Map();
    const TICK = 30;
    const SWITCH = 1.6;
    let current = new Set();
    let mode = null;
    let place = { latitude: 44.0556, longitude: 5.0481 };
    let timer = null;

    function layer(src) {
        let img = layers.get(src);
        if (!img) {
            img = new Image();
            img.className = 'fond-calque';
            img.alt = '';
            img.decoding = 'async';
            img.src = src;
            img.style.opacity = '0';
            // (seule l'image de référence provisoire a un dock et une barre dessinés à cacher)
            img.classList.toggle('recadre', /reference-temporaire/.test(src));
            box.append(img);
            layers.set(src, img);
        }
        return img;
    }

    // `wanted` : [[image, opacité], …] du bas vers le haut ; `seconds` : durée du fondu
    function show(wanted, seconds) {
        const keep = new Set(wanted.map(([src]) => src));
        for (const [src, img] of layers) {
            if (keep.has(src)) continue;
            // Les images qui partent restent sous les nouvelles le temps du fondu, puis disparaissent
            img.style.zIndex = '0';
            setTimeout(() => {
                if (layers.get(src) === img && !current.has(src)) {
                    img.remove();
                    layers.delete(src);
                }
            }, seconds * 1000 + 500);
        }
        current = keep;
        wanted.forEach(([src, opacity], index) => {
            const img = layer(src);
            img.style.zIndex = String(index + 1);
            // (fondu continu de l'heure qui passe : linéaire ; changement de fond choisi : adouci)
            img.style.transition = seconds ? `opacity ${seconds}s ${seconds === SWITCH ? 'ease' : 'linear'}` : 'none';
            // (une image qui vient d'être créée part de 0 : on attend une image pour que le fondu se voie)
            requestAnimationFrame(() => { img.style.opacity = String(opacity); });
        });
    }

    const photo = name => `${base}/${window.soleil.DOSSIER}/${name}.png`;

    function dayTick(seconds) {
        // On vise l'état de dans 30 s : le fondu CSS de 30 s y arrive pile au prochain calcul
        const { from, to, amount } = window.soleil.mix(new Date(Date.now() + seconds * 1000), place.latitude, place.longitude);
        show(amount > 0.001 ? [[photo(from), 1], [photo(to), amount]] : [[photo(from), 1]], seconds);
    }

    // `wallpaper` : adresse d'une image, ou « jour » (ou rien) pour le fond au fil du jour
    function set(wallpaper, options = {}) {
        if (options.place?.latitude != null) place = options.place;
        const seconds = options.instant ? 0 : SWITCH;
        clearInterval(timer);
        mode = !wallpaper || wallpaper === 'jour' ? 'jour' : wallpaper;
        if (mode === 'jour') {
            dayTick(seconds);
            timer = setInterval(() => dayTick(TICK), TICK * 1000);
        } else {
            show([[mode, 1]], seconds);
        }
    }

    // Aperçu : une journée entière en `duration` secondes, puis retour à l'heure réelle
    function preview(duration = 40) {
        if (mode !== 'jour') return;
        clearInterval(timer);
        const start = Date.now();
        const STEP = 0.2;
        timer = setInterval(() => {
            const elapsed = (Date.now() - start) / 1000;
            if (elapsed >= duration) return set('jour', { place });
            const fake = new Date(start + (elapsed + STEP) / duration * 86400000);
            const { from, to, amount } = window.soleil.mix(fake, place.latitude, place.longitude);
            show(amount > 0.001 ? [[photo(from), 1], [photo(to), amount]] : [[photo(from), 1]], STEP);
        }, STEP * 1000);
    }

    // Le temps d'une veille, les minuteries s'arrêtent : au réveil on se recale tout de suite
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && mode === 'jour') dayTick(SWITCH);
    });

    // (commande « fond-defiler », comme les autres raccourcis)
    window.os?.onShortcut(name => {
        if (name === 'fond-defiler') preview();
    });

    window.fond = { set, photo, preview };
})();
