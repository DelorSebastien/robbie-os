// Dock hologramme : un fil de lumière posé sur le lac projette les applis en hologrammes,
// à intervalles réguliers, Robbie (son vrai visage animé) à la place du milieu. Il montre les
// applis épinglées et les applis ouvertes (nœud et cône plus vifs) ; un clic ramène leur
// fenêtre, même réduite. Au survol, un affichage tête haute donne le nom et l'état.
(() => {
    const { toast, escape } = window.ui;
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
        gear: line('argent', 'M10.11 4.95L10.5 2.52A9.6 9.6 0 0 1 13.5 2.52L13.89 4.95A7.3 7.3 0 0 1 15.65 5.68L17.64 4.23A9.6 9.6 0 0 1 19.77 6.36L18.32 8.35A7.3 7.3 0 0 1 19.05 10.11L21.48 10.5A9.6 9.6 0 0 1 21.48 13.5L19.05 13.89A7.3 7.3 0 0 1 18.32 15.65L19.77 17.64A9.6 9.6 0 0 1 17.64 19.77L15.65 18.32A7.3 7.3 0 0 1 13.89 19.05L13.5 21.48A9.6 9.6 0 0 1 10.5 21.48L10.11 19.05A7.3 7.3 0 0 1 8.35 18.32L6.36 19.77A9.6 9.6 0 0 1 4.23 17.64L5.68 15.65A7.3 7.3 0 0 1 4.95 13.89L2.52 13.5A9.6 9.6 0 0 1 2.52 10.5L4.95 10.11A7.3 7.3 0 0 1 5.68 8.35L4.23 6.36A9.6 9.6 0 0 1 6.36 4.23L8.35 5.68A7.3 7.3 0 0 1 10.11 4.95zM12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z'),
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

    // Le fil émetteur (hauteur dans la zone du dock) et l'écart régulier entre les hologrammes
    const SPACING = 72;
    const LINE = 158;
    const TILE_Y = LINE - 52;
    // Place gardée de chaque côté (le coin de l'heure, en bas à droite) et taille minimale
    const MARGIN = 215;
    const MIN_FIT = 0.5;

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
            el.addEventListener('mouseenter', () => {
                showLabel(el, item);
                tiles.find(tile => tile.el === el)?.cone?.classList.add('survol');
            });
            el.addEventListener('mouseleave', () => {
                label.classList.remove('visible');
                tiles.find(tile => tile.el === el)?.cone?.classList.remove('survol');
            });
            return { el, item, x: 0, y: 0 };
        }));

        tiles.forEach(tile => dock.append(tile.el));
        window.icons.fill(dock);
        markOpen();
        layout();
    }

    // Nœud et cône plus vifs sous les applis qui ont une fenêtre ouverte
    function markOpen() {
        tiles.forEach(tile => {
            const open = tile.item.kind === 'app' && isOpen(tile.item.app);
            tile.el.classList.toggle('ouverte', open);
            tile.noeud?.classList.toggle('ouverte', open);
            tile.cone?.classList.toggle('ouverte', open);
        });
    }

    function layout() {
        if (!tiles.length) return;
        const width = window.innerWidth;
        const cx = width / 2;
        const middle = items.findIndex(item => item.kind === 'robbie');

        // Taille automatique : avec beaucoup d'applis, tous les hologrammes rétrécissent ensemble
        // (écarts compris) pour tenir sur la ligne, sans toucher au coin de l'heure ni aux bords
        // (taille du dock choisie dans les Réglages prise en compte)
        const userScale = window.disposition?.scale() || 1;
        const available = (width - 2 * MARGIN) / userScale;
        const fit = Math.max(MIN_FIT, Math.min(1, available / (tiles.length * SPACING)));
        zone.style.setProperty('--holo', fit);
        const spacing = SPACING * fit;

        // Un hologramme par place, toutes à la même distance ; Robbie au milieu
        tiles.forEach((tile, index) => {
            tile.x = cx + (index - middle) * spacing;
            tile.y = LINE - (LINE - TILE_Y) * fit;
            tile.el.style.left = `${tile.x}px`;
            tile.el.style.top = `${tile.y}px`;
        });

        // Le fil émetteur dépasse de chaque côté (un soupçon de courbe : sans hauteur, son
        // dégradé ne s'afficherait pas)
        const outerTile = Math.max(...tiles.map(tile => Math.abs(tile.x - cx)));
        const half = outerTile + 150 * fit;
        const d = `M${cx - half} ${LINE} Q${cx} ${LINE + 1} ${cx + half} ${LINE}`;
        document.querySelectorAll('#dock-arc path').forEach(path => path.setAttribute('d', d));

        // Points qui prolongent le fil, de plus en plus petits et pâles
        const dots = [];
        for (let i = 0; i < 5; i++) {
            const dx = half + 14 + i * 22;
            const size = 3.6 - i * 0.5;
            for (const side of [-1, 1]) {
                const delay = 1.6 + i * 0.12;
                dots.push(`<span style="left:${cx + side * dx}px; top:${LINE}px; width:${size}px; height:${size}px; opacity:${0.8 - i * 0.14}; animation-delay:${delay}s, ${delay}s"></span>`);
            }
        }
        document.getElementById('dock-points').innerHTML = dots.join('');

        // Lueur du fil dans le lac
        let reflet = zone.querySelector('.fil-reflet');
        if (!reflet) {
            reflet = document.createElement('span');
            reflet.className = 'fil-reflet';
            zone.append(reflet);
        }
        Object.assign(reflet.style, { left: `${cx - half}px`, width: `${half * 2}px`, top: `${LINE + 1}px` });

        // Sous chaque appli : son nœud sur le fil et son cône de lumière (derrière l'hologramme)
        zone.querySelectorAll('.noeud, .cone').forEach(el => el.remove());
        tiles.filter(tile => tile.item.kind !== 'robbie').forEach(tile => {
            tile.cone = document.createElement('span');
            tile.cone.className = 'cone';
            tile.cone.style.left = `${tile.x}px`;
            tile.cone.style.top = `${LINE - 88 * fit}px`;
            tile.noeud = document.createElement('span');
            tile.noeud.className = 'noeud';
            tile.noeud.style.left = `${tile.x}px`;
            tile.noeud.style.top = `${LINE}px`;
            dock.before(tile.cone);
            zone.append(tile.noeud);
        });
        markOpen();

        // Lumière du fil sous Robbie, et son faisceau dans l'eau
        const robbie = tiles[middle];
        let glow = zone.querySelector('.robbie-lueur');
        if (!glow) {
            glow = document.createElement('span');
            glow.className = 'robbie-lueur';
            const beam = document.createElement('span');
            beam.className = 'robbie-faisceau';
            zone.append(glow, beam);
        }
        glow.style.left = `${robbie.x}px`;
        glow.style.top = `${LINE}px`;
        Object.assign(zone.querySelector('.robbie-faisceau').style, { left: `${robbie.x}px`, top: `${LINE}px` });
    }

    // État affiché sous le nom : fenêtres ouvertes d'une appli, rôle des autres hologrammes
    function stateOf(item) {
        if (item.kind === 'app') {
            const count = windows.filter(w => w.appId.toLowerCase() === item.app.windowId || w.appId.toLowerCase() === item.app.id.toLowerCase()).length;
            return count ? `${count} fenêtre${count > 1 ? 's' : ''} ouverte${count > 1 ? 's' : ''}` : 'prête';
        }
        return { robbie: 'ton assistant', settings: 'système', trash: 'fichiers supprimés', launcher: 'toutes tes applis' }[item.kind] || '';
    }

    // Affichage tête haute : [ NOM ] et son état
    function showLabel(el, item) {
        const box = el.getBoundingClientRect();
        const state = stateOf(item);
        label.innerHTML = `[ ${escape(item.name)} ]${state ? `<small>${escape(state)}</small>` : ''}`;
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
    // (taille du dock changée dans les Réglages : la place disponible change aussi)
    document.addEventListener('settings-changed', () => setTimeout(layout, 50));

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

    // (nom lisible d'une appli d'après l'identifiant de ses fenêtres, pour les bureaux)
    const appName = windowId => Object.entries(KNOWN).find(([id]) => id === windowId)?.[1].name
        || apps.find(app => app.windowId === windowId || app.id === windowId)?.name || windowId;

    window.dock = { pinned: () => pinned, setPinned, look, setAccent, appName };
})();
