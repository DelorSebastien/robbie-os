// Dock incurvé : les icônes suivent un arc lumineux, Robbie (son vrai visage animé) au centre,
// et le dock grossit sous la souris comme sur macOS. Il montre les applis épinglées et les
// applis ouvertes (un point dessous) ; un clic ramène leur fenêtre, même réduite.
(() => {
    const { toast } = window.ui;
    const face = window.face;

    // Pictogrammes lumineux du dock (dégradés et traits, pas d'aplats de couleur)
    const gradient = (id, from, to) =>
        `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>`;
    const svg = body => `<svg class="picto" viewBox="0 0 32 32" aria-hidden="true">${body}</svg>`;

    const GLYPHS = {
        folder: svg(`${gradient('g-dossier', '#8fd8ff', '#2f86f6')}
            <path d="M4 9.5A2.5 2.5 0 0 1 6.5 7h6l2.6 2.8h10.4A2.5 2.5 0 0 1 28 12.3V24a2.5 2.5 0 0 1-2.5 2.5h-19A2.5 2.5 0 0 1 4 24z" fill="url(#g-dossier)"/>
            <path d="M4 13h24" stroke="rgba(255,255,255,0.55)" stroke-width="1.2"/>`),
        globe: svg(`${gradient('g-globe', '#9be4ff', '#3f8cff')}
            <g fill="none" stroke="url(#g-globe)" stroke-width="2.1" stroke-linecap="round">
            <circle cx="16" cy="16" r="11"/><path d="M5 16h22M16 5c4 3.5 4 18.5 0 22M16 5c-4 3.5-4 18.5 0 22M7.5 9.5h17M7.5 22.5h17"/></g>`),
        terminal: svg(`<g fill="none" stroke="#f2f6ff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="M7 10l6 6-6 6M16 23h9"/></g>`),
        code: svg(`${gradient('g-code', '#7fd0ff', '#2a6bff')}
            <g fill="none" stroke="url(#g-code)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 9l-7 7 7 7M21 9l7 7-7 7M18 7l-4 18"/></g>`),
        image: svg(`${gradient('g-image', '#d79bff', '#7b3cff')}
            <rect x="4.5" y="6.5" width="23" height="19" rx="4" fill="none" stroke="url(#g-image)" stroke-width="2.2"/>
            <path d="M6 23l7-7 5 5 3-3 6 6" fill="none" stroke="url(#g-image)" stroke-width="2.2" stroke-linejoin="round"/>
            <circle cx="21.5" cy="12" r="2.4" fill="url(#g-image)"/>`),
        gear: svg(`<g fill="none" stroke="#e8eef9" stroke-width="2.1" stroke-linejoin="round">
            <path d="M16 4.5l2.2 2.6 3.3-.6.9 3.2 3.1 1.4-.9 3.2 1.9 2.7-2.6 2.1.3 3.4-3.3.6-1.5 3-3.1-1.2-2.9 1.8-2-2.7-3.4-.2-.2-3.4-2.7-2 1.8-2.9-1.2-3.1 3-1.5.6-3.3 3.4.3z"/>
            <circle cx="16" cy="16" r="4.2"/></g>`),
        trash: svg(`<g fill="none" stroke="#e8eef9" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 9h20M12.5 9V6h7v3M8.5 9l1.3 17h12.4l1.3-17M13.5 13.5v8M18.5 13.5v8"/></g>`),
        grid: svg(`${gradient('g-grille', '#bfefff', '#5ec8ff')}
            <g fill="url(#g-grille)"><rect x="6" y="6" width="8" height="8" rx="2.5"/><rect x="18" y="6" width="8" height="8" rx="2.5"/>
            <rect x="6" y="18" width="8" height="8" rx="2.5"/><rect x="18" y="18" width="8" height="8" rx="2.5"/></g>`)
    };

    // Apparence soignée pour les applis connues ; les autres prennent l'icône de leur thème
    const KNOWN = {
        thunar: { icon: 'folder', glyph: 'folder', name: 'Fichiers', tint: '80, 170, 255' },
        'firefox-esr': { icon: 'firefox-esr', glyph: 'globe', name: 'Navigateur', tint: '255, 130, 60' },
        foot: { icon: 'utilities-terminal', glyph: 'terminal', name: 'Terminal', tint: '190, 205, 230' },
        'org.xfce.mousepad': { icon: 'accessories-text-editor', glyph: 'code', name: 'Éditeur de texte', tint: '60, 130, 255' },
        'robbie-photos': { icon: 'image-viewer', glyph: 'image', name: 'Photos', tint: '160, 90, 255' }
    };

    const SYSTEM_ITEMS = [
        { kind: 'settings', icon: 'preferences-system', glyph: 'gear', name: 'Réglages', tint: '190, 205, 230' },
        { kind: 'trash', icon: 'user-trash', glyph: 'trash', name: 'Corbeille', tint: '190, 205, 230' },
        { kind: 'launcher', glyph: 'grid', name: 'Toutes les applis', tint: '120, 210, 255' }
    ];

    const dock = document.getElementById('dock');
    const zone = document.querySelector('.dock-zone');
    const label = document.createElement('div');
    label.className = 'etiquette';
    document.body.append(label);

    // Forme de l'arc : les icônes du bord sont plus hautes que celles du centre
    const SPACING = 66;
    const ROBBIE_GAP = 12;
    const BASE = 106;
    const CURVE = 0.00024;

    const arcY = (x, cx) => BASE - CURVE * (x - cx) ** 2;

    let apps = [];
    let pinned = [];
    let windows = [];
    let tiles = [];
    let items = [];

    const appById = id => apps.find(app => app.id === id);
    const isOpen = app => app && windows.some(w => w.appId.toLowerCase() === app.windowId || w.appId.toLowerCase() === app.id.toLowerCase());

    // Appli correspondant à une fenêtre ouverte (pour les applis non épinglées)
    const appForWindow = w => apps.find(app => app.windowId === w.appId.toLowerCase() || app.id.toLowerCase() === w.appId.toLowerCase());

    // Liste du dock : épinglées, puis ouvertes non épinglées, puis réglages, corbeille, toutes les applis ;
    // Robbie au milieu
    function computeItems() {
        const appItem = (app, pinnedApp) => ({ kind: 'app', id: app.id, app, pinned: pinnedApp, ...(KNOWN[app.id] || { name: app.name, tint: '190, 205, 230' }) });

        // (un compte enfant ne voit que ses applis autorisées)
        const pinnedItems = pinned.map(appById).filter(app => app && window.compte.allowed(app.id)).map(app => appItem(app, true));
        const extras = [];
        for (const w of windows) {
            const app = appForWindow(w);
            if (app && !pinned.includes(app.id) && !extras.some(item => item.id === app.id)) extras.push(appItem(app, false));
        }

        const others = [...pinnedItems, ...extras, ...SYSTEM_ITEMS];
        const half = Math.floor(others.length / 2);
        return [...others.slice(0, half), { kind: 'robbie', name: 'Robbie' }, ...others.slice(half)];
    }

    const signature = list => list.map(item => item.id || item.kind).join('|');

    async function tileVisual(el, item) {
        if (item.kind === 'robbie') {
            const visage = document.createElement('span');
            visage.className = 'visage';
            visage.append(document.getElementById('face'));
            el.append(visage);
            return;
        }

        const src = (item.icon && await window.os.icon(item.icon)) || item.app?.icon;
        if (src) {
            const img = document.createElement('img');
            img.className = 'icone-theme';
            img.src = src;
            img.alt = '';
            el.append(img);
        } else {
            el.innerHTML = GLYPHS[item.glyph] || GLYPHS.grid;
        }
    }

    async function build() {
        const next = computeItems();
        if (signature(next) === signature(items) && tiles.length) return markOpen();
        items = next;

        // Le visage de Robbie est gardé (son canvas est déplacé, pas recréé)
        const faceCanvas = document.getElementById('face');
        document.body.append(faceCanvas);
        dock.innerHTML = '';

        const middle = items.findIndex(item => item.kind === 'robbie');

        tiles = await Promise.all(items.map(async (item, index) => {
            const el = document.createElement('button');
            el.className = `tuile${item.kind === 'robbie' ? ' robbie' : ''}`;
            // Ordre d'apparition au démarrage : du centre vers les bords
            el.style.setProperty('--i', Math.abs(index - middle));
            el.setAttribute('aria-label', item.name);
            if (item.tint) el.style.setProperty('--teinte', item.tint);
            await tileVisual(el, item);

            el.addEventListener('click', () => {
                el.classList.remove('rebond');
                void el.offsetWidth;
                if (item.kind !== 'robbie') el.classList.add('rebond');
                activate(item);
            });
            el.addEventListener('contextmenu', event => {
                event.preventDefault();
                if (item.kind === 'app') showMenu(item, el);
            });
            el.addEventListener('animationend', event => {
                if (event.animationName === 'rebond') el.classList.remove('rebond');
            });
            el.addEventListener('mouseenter', () => showLabel(el, item.name));
            el.addEventListener('mouseleave', () => label.classList.remove('visible'));
            return { el, item, x: 0, y: 0, size: item.kind === 'robbie' ? 66 : 56 };
        }));

        tiles.forEach(tile => dock.append(tile.el));
        window.icons.fill(dock);
        markOpen();
        layout();
    }

    // Point sous les applis qui ont une fenêtre ouverte
    function markOpen() {
        tiles.forEach(tile => tile.el.classList.toggle('ouverte', tile.item.kind === 'app' && isOpen(tile.item.app)));
    }

    function layout() {
        if (!tiles.length) return;
        const width = window.innerWidth;
        const cx = width / 2;
        const middle = items.findIndex(item => item.kind === 'robbie');

        // Position de chaque tuile le long de l'arc
        tiles.forEach((tile, index) => {
            const offset = index - middle;
            const extra = Math.sign(offset) * ROBBIE_GAP;
            tile.x = cx + offset * SPACING + extra;
            tile.y = tile.item.kind === 'robbie' ? arcY(cx, cx) - 8 : arcY(tile.x, cx);
            tile.el.style.left = `${tile.x}px`;
            tile.el.style.top = `${tile.y}px`;
        });

        // L'arc passe juste sous les icônes et se prolonge de chaque côté
        const outerTile = Math.max(...tiles.map(tile => Math.abs(tile.x - cx)));
        const half = outerTile + 260;
        const below = 34;
        const y0 = arcY(cx - half, cx) + below;
        const control = 2 * (arcY(cx, cx) + below) - y0;
        const d = `M${cx - half} ${y0} Q${cx} ${control} ${cx + half} ${y0}`;
        document.querySelectorAll('#dock-arc path').forEach(path => path.setAttribute('d', d));

        // Points qui prolongent l'arc, de plus en plus petits et pâles
        const outer = outerTile + 52;
        const dots = [];
        for (let i = 0; i < 7; i++) {
            const dx = outer + i * 30;
            const size = 4.4 - i * 0.4;
            const opacity = 0.9 - i * 0.11;
            for (const side of [-1, 1]) {
                const x = cx + side * dx;
                const delay = 1.6 + i * 0.12;
                dots.push(`<span style="left:${x}px; top:${arcY(x, cx) + below - 10}px; width:${size}px; height:${size}px; opacity:${opacity}; animation-delay:${delay}s, ${delay}s"></span>`);
            }
        }
        document.getElementById('dock-points').innerHTML = dots.join('');

        // Sous chaque icône, un point de lumière sur l'arc : elles ont l'air posées dessus
        zone.querySelectorAll('.appui').forEach(spot => spot.remove());
        tiles.filter(tile => tile.item.kind !== 'robbie').forEach(tile => {
            const spot = document.createElement('span');
            spot.className = 'appui';
            spot.style.left = `${tile.x}px`;
            spot.style.top = `${arcY(tile.x, cx) + below}px`;
            zone.append(spot);
        });

        // Lumière posée sur l'arc sous Robbie, et son faisceau dans l'eau
        const robbie = tiles[middle];
        let glow = zone.querySelector('.robbie-lueur');
        if (!glow) {
            glow = document.createElement('span');
            glow.className = 'robbie-lueur';
            const beam = document.createElement('span');
            beam.className = 'robbie-faisceau';
            zone.append(glow, beam);
        }
        const glowY = arcY(cx, cx) + below;
        glow.style.left = `${robbie.x}px`;
        glow.style.top = `${glowY}px`;
        Object.assign(zone.querySelector('.robbie-faisceau').style, { left: `${robbie.x}px`, top: `${glowY}px` });
    }

    // Agrandissement sous la souris (comme le dock de macOS)
    function magnify(mouseX) {
        tiles.forEach(tile => {
            const distance = mouseX == null ? Infinity : Math.abs(mouseX - tile.x);
            const scale = 1 + 0.18 * Math.max(0, 1 - distance / 130);
            tile.el.style.transform = scale === 1 ? '' : `translateY(${-(scale - 1) * tile.size * 0.45}px) scale(${scale})`;
        });
    }

    document.addEventListener('mousemove', event => {
        const span = tiles.length ? Math.max(...tiles.map(tile => Math.abs(tile.x - window.innerWidth / 2))) + 60 : 420;
        const inDock = event.clientY > window.innerHeight - 190 && Math.abs(event.clientX - window.innerWidth / 2) < span;
        magnify(inDock ? event.clientX : null);
    });

    function showLabel(el, text) {
        const box = el.getBoundingClientRect();
        label.textContent = text;
        label.style.left = `${box.left + box.width / 2}px`;
        label.style.top = `${box.top - 12}px`;
        label.classList.add('visible');
    }

    async function activate(item) {
        if (item.kind === 'app') {
            // Appli déjà ouverte : on ramène sa fenêtre (même réduite) au lieu d'en ouvrir une autre
            if (isOpen(item.app) && await window.os.focusWindow(windowOf(item.app))) return;
            const opened = await window.os.launch(item.id);
            if (!opened) toast(`${item.name} n'est pas installé`, 'x');
        } else if (item.kind === 'trash') {
            window.os.openLocation('trash:///');
        } else if (item.kind === 'robbie') {
            face.blink();
            window.robbiePanel.toggle();
        } else if (item.kind === 'launcher') {
            window.launcher.toggle();
        } else if (item.kind === 'settings') {
            if (window.reglages) window.reglages.open();
            else toast('Les réglages arrivent bientôt', 'gear');
        }
    }

    const windowOf = app => (windows.find(w => w.appId.toLowerCase() === app.windowId || w.appId.toLowerCase() === app.id.toLowerCase()) || {}).appId;

    // ---- Menu du clic droit : épingler, retirer, nouvelle fenêtre ----
    const menu = document.createElement('div');
    menu.className = 'menu-dock';
    menu.hidden = true;
    document.body.append(menu);

    function showMenu(item, el) {
        const entries = [
            { label: 'Nouvelle fenêtre', run: () => window.os.launch(item.id) },
            item.pinned
                ? { label: 'Retirer du dock', run: () => setPinned(pinned.filter(id => id !== item.id)) }
                : { label: 'Épingler au dock', run: () => setPinned([...pinned, item.id]) }
        ];

        menu.innerHTML = '';
        for (const entry of entries) {
            const button = document.createElement('button');
            button.textContent = entry.label;
            button.addEventListener('click', () => {
                menu.hidden = true;
                entry.run();
            });
            menu.append(button);
        }

        const box = el.getBoundingClientRect();
        menu.hidden = false;
        menu.style.left = `${box.left + box.width / 2}px`;
        menu.style.top = `${box.top - 14}px`;
        label.classList.remove('visible');
    }

    document.addEventListener('mousedown', event => {
        if (!menu.hidden && !menu.contains(event.target)) menu.hidden = true;
    });

    async function setPinned(list) {
        pinned = [...new Set(list)];
        await window.os.setSettings({ pinned });
        document.dispatchEvent(new CustomEvent('settings-changed'));
        build();
    }

    // Robbie suit la souris des yeux
    document.addEventListener('mousemove', event => {
        const robbie = tiles.find(tile => tile.item.kind === 'robbie');
        if (!robbie) return;
        const box = robbie.el.getBoundingClientRect();
        face.setGaze(
            (event.clientX - (box.left + box.width / 2)) / (window.innerWidth / 2) * 1.3,
            (event.clientY - (box.top + box.height / 2)) / (window.innerHeight / 2) * 1.3
        );
    });

    // La couleur de son émotion devient la couleur d'accent de l'interface
    let lastColor = '';
    setInterval(() => {
        const color = face.color().join(', ');
        if (color === lastColor) return;
        lastColor = color;
        document.documentElement.style.setProperty('--accent', color);
    }, 150);

    // Sans carte graphique, chaque image coûte du processeur : visage à 30 images par seconde
    // (le son de la voix de Robbie ne saccade plus quand la machine est chargée)
    if (window.ui.light) face.setMaxFps(30);

    window.addEventListener('resize', layout);

    (async () => {
        await window.compte.ready;
        const settings = await window.os.settings();
        face.setEyeColor(settings.eyeColor);
        face.setSkin(settings.skin);
        pinned = settings.pinned || [];
        apps = await window.os.apps();
        windows = await window.os.windows();
        await build();
    })();

    // Fenêtres ouvertes ou fermées : le dock suit
    window.os.onWindows(list => {
        windows = list;
        build();
    });

    // Épinglage depuis le lanceur
    document.addEventListener('pinned-changed', event => setPinned(event.detail));

    // Fin de la séquence de démarrage : les animations habituelles prennent le relais
    setTimeout(() => {
        document.body.classList.remove('demarrage');
        face.setExpression('happy', 1800);
    }, 3500);

    window.dock = { pinned: () => pinned, setPinned };
})();
