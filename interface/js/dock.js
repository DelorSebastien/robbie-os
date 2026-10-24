// Dock incurvé : les icônes suivent un arc lumineux, Robbie (son vrai visage animé) au centre,
// et le dock grossit sous la souris comme sur macOS. Il montre les applis épinglées et les
// applis ouvertes (un point dessous) ; un clic ramène leur fenêtre, même réduite.
(() => {
    const { toast } = window.ui;
    const face = window.face;

    // Icônes du dock : le même trait que celles de la barre latérale et du coin, teinté d'un
    // dégradé par appli (les dégradés sont dans la page : #d-bleu, #d-orange…)
    const line = (gradient, d) => `<svg class="picto" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}" stroke="url(#d-${gradient})"/></svg>`;

    const GLYPHS = {
        folder: line('bleu', 'M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z'),
        globe: line('orange', 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM3 12h18M12 3c3 2.8 3 15.2 0 18M12 3c-3 2.8-3 15.2 0 18'),
        terminal: line('argent', 'M4 5h16v14H4zM8 10l3 2.5L8 15M13 15h4'),
        code: line('bleu', 'M9 7l-5 5 5 5M15 7l5 5-5 5M13.5 5l-3 14'),
        image: line('violet', 'M4 5h16v14H4zM4 16l4.5-4.5 3.5 3.5 2.5-2.5L20 18M15.5 9.5h.01'),
        gear: line('argent', 'M10.4 2.5h3.2l.5 2.6a7.5 7.5 0 0 1 1.9 1.1l2.5-.9 1.6 2.8-2 1.7a7.6 7.6 0 0 1 0 2.2l2 1.7-1.6 2.8-2.5-.9a7.5 7.5 0 0 1-1.9 1.1l-.5 2.6h-3.2l-.5-2.6a7.5 7.5 0 0 1-1.9-1.1l-2.5.9-1.6-2.8 2-1.7a7.6 7.6 0 0 1 0-2.2l-2-1.7 1.6-2.8 2.5.9a7.5 7.5 0 0 1 1.9-1.1zM12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z'),
        trash: line('argent', 'M5 7h14M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6'),
        grid: line('cyan', 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z'),
        bag: line('cyan', 'M5 8h14l-1.2 12H6.2zM9 8V6.5a3 3 0 0 1 6 0V8M9.5 12.5v2M14.5 12.5v2')
    };

    // Apparence soignée pour les applis connues ; les autres prennent l'icône de leur thème
    const KNOWN = {
        thunar: { icon: 'folder', glyph: 'folder', name: 'Fichiers', tint: '80, 170, 255' },
        'firefox-esr': { icon: 'firefox-esr', glyph: 'globe', name: 'Navigateur', tint: '255, 130, 60' },
        foot: { icon: 'utilities-terminal', glyph: 'terminal', name: 'Terminal', tint: '190, 205, 230' },
        'org.xfce.mousepad': { icon: 'accessories-text-editor', glyph: 'code', name: 'Éditeur de texte', tint: '60, 130, 255' },
        'robbie-photos': { icon: 'image-viewer', glyph: 'image', name: 'Photos', tint: '160, 90, 255' },
        'robbie-logitheque': { icon: 'system-software-install', glyph: 'bag', name: 'Logithèque', tint: '80, 220, 255' }
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

        // Applis connues et éléments du système : l'icône au trait ; les autres : leur icône
        // (dans la même pastille de verre)
        if (GLYPHS[item.glyph]) {
            el.innerHTML = GLYPHS[item.glyph];
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
            el.innerHTML = GLYPHS.grid;
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
            return { el, item, x: 0, y: 0, size: item.kind === 'robbie' ? 68 : 54 };
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
        // (dock agrandi ou réduit dans les Réglages : la souris est ramenée à sa taille d'origine)
        const scale = window.disposition?.scale() || 1;
        const cx = window.innerWidth / 2;
        const x = cx + (event.clientX - cx) / scale;
        const span = tiles.length ? Math.max(...tiles.map(tile => Math.abs(tile.x - cx))) + 60 : 420;
        const inDock = event.clientY > window.innerHeight - 190 * scale && Math.abs(x - cx) < span;
        magnify(inDock ? x : null);
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

    // Couleur d'accent de l'interface : celle choisie dans les Réglages (les yeux de Robbie la
    // prennent aussi, puis changent avec ses émotions sans faire clignoter l'interface) ;
    // une version plus foncée sert au texte et aux traits sur le verre blanc du thème clair
    const ACCENTS = { cyan: [94, 231, 255], green: [94, 240, 168], pink: [255, 110, 200], gold: [255, 196, 80], purple: [185, 140, 255], white: [225, 240, 255] };
    function setAccent(key) {
        const rgb = ACCENTS[key] || ACCENTS.cyan;
        const dark = rgb.map(v => Math.round(v * 0.55));
        document.documentElement.style.setProperty('--accent', rgb.join(', '));
        document.documentElement.style.setProperty('--accent-fonce', dark.join(', '));
    }

    // Sans carte graphique, chaque image coûte du processeur : visage à 30 images par seconde
    // (le son de la voix de Robbie ne saccade plus quand la machine est chargée)
    if (window.ui.light) face.setMaxFps(30);

    window.addEventListener('resize', layout);

    (async () => {
        await window.compte.ready;
        const settings = await window.os.settings();
        face.setEyeColor(settings.eyeColor);
        setAccent(settings.eyeColor);
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

    // Apparence d'une appli, partagée avec Toutes les applis : son nom, et son icône au trait
    // (null : l'appli prend l'icône de son thème)
    const look = app => {
        const known = KNOWN[app.id];
        return { name: known?.name || app.name, glyph: known ? GLYPHS[known.glyph] : null };
    };

    window.dock = { pinned: () => pinned, setPinned, look, setAccent };
})();
