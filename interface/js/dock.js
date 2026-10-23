// Dock incurvé : les icônes suivent un arc lumineux, Robbie (son vrai visage animé) au centre,
// et le dock grossit sous la souris comme sur macOS
(() => {
    const { toast } = window.ui;
    const face = window.face;

    // Contenu du dock : applis, Robbie au milieu, puis réglages et corbeille
    const ITEMS = [
        { kind: 'app', id: 'thunar', icon: 'folder-blue', name: 'Fichiers', tint: '80, 170, 255' },
        { kind: 'app', id: 'firefox-esr', name: 'Firefox', tint: '255, 140, 60' },
        { kind: 'app', id: 'foot', icon: 'utilities-terminal', name: 'Terminal', tint: '190, 205, 230' },
        { kind: 'app', id: 'org.xfce.mousepad', icon: 'accessories-text-editor', name: 'Éditeur de texte', tint: '90, 200, 255' },
        { kind: 'robbie', name: 'Robbie' },
        { kind: 'app', id: 'org.xfce.ristretto', name: 'Images', tint: '170, 110, 255' },
        { kind: 'settings', icon: 'org.gnome.Settings', name: 'Réglages', tint: '190, 205, 230' },
        { kind: 'trash', icon: 'user-trash', name: 'Corbeille', tint: '190, 205, 230' }
    ];

    const dock = document.getElementById('dock');
    const zone = document.querySelector('.dock-zone');
    const label = document.createElement('div');
    label.className = 'etiquette';
    document.body.append(label);

    // Forme de l'arc : les icônes du bord sont plus hautes que celles du centre
    const SPACING = 74;
    const ROBBIE_GAP = 16;
    const BASE = 118;
    const CURVE = 0.00027;

    const arcY = (x, cx) => BASE - CURVE * (x - cx) ** 2;

    let tiles = [];

    async function build() {
        const apps = await window.os.apps();

        tiles = await Promise.all(ITEMS.map(async item => {
            const el = document.createElement('button');
            el.className = `tuile${item.kind === 'robbie' ? ' robbie' : ''}`;
            el.setAttribute('aria-label', item.name);
            if (item.tint) el.style.setProperty('--teinte', item.tint);

            if (item.kind === 'robbie') {
                const visage = document.createElement('span');
                visage.className = 'visage';
                visage.append(document.getElementById('face'));
                el.append(visage);
            } else {
                const app = item.kind === 'app' ? apps.find(a => a.id === item.id) : null;
                // Icône choisie pour le dock en priorité, sinon celle de l'appli
                const src = (item.icon && await window.os.icon(item.icon)) || app?.icon;
                if (src) {
                    const img = document.createElement('img');
                    img.src = src;
                    img.alt = '';
                    el.append(img);
                } else {
                    el.dataset.icon = 'grid';
                }
                if (item.kind === 'app' && !app) el.style.opacity = '0.4';
            }

            el.addEventListener('click', () => activate(item));
            el.addEventListener('mouseenter', () => showLabel(el, item.name));
            el.addEventListener('mouseleave', () => label.classList.remove('visible'));
            dock.append(el);
            return { el, item, x: 0, y: 0, size: item.kind === 'robbie' ? 78 : 56 };
        }));

        window.icons.fill(dock);
        layout();
    }

    function layout() {
        const width = window.innerWidth;
        const cx = width / 2;
        const middle = ITEMS.findIndex(item => item.kind === 'robbie');

        // Position de chaque tuile le long de l'arc
        tiles.forEach((tile, index) => {
            const offset = index - middle;
            const extra = Math.sign(offset) * ROBBIE_GAP;
            tile.x = cx + offset * SPACING + extra;
            tile.y = tile.item.kind === 'robbie' ? arcY(cx, cx) - 14 : arcY(tile.x, cx);
            tile.el.style.left = `${tile.x}px`;
            tile.el.style.top = `${tile.y}px`;
        });

        // L'arc passe juste sous les icônes et se prolonge de chaque côté
        const half = (tiles.length / 2) * SPACING + 230;
        const below = 40;
        const y0 = arcY(cx - half, cx) + below;
        const control = 2 * (arcY(cx, cx) + below) - y0;
        const d = `M${cx - half} ${y0} Q${cx} ${control} ${cx + half} ${y0}`;
        document.querySelectorAll('#dock-arc path').forEach(path => path.setAttribute('d', d));

        // Points qui prolongent l'arc, de plus en plus petits et pâles
        const outer = Math.max(...tiles.map(tile => Math.abs(tile.x - cx))) + 52;
        const dots = [];
        for (let i = 0; i < 7; i++) {
            const dx = outer + i * 30;
            const size = 6.5 - i * 0.55;
            const opacity = 0.95 - i * 0.11;
            for (const side of [-1, 1]) {
                const x = cx + side * dx;
                dots.push(`<span style="left:${x}px; top:${arcY(x, cx) + below - 10}px; width:${size}px; height:${size}px; opacity:${opacity}"></span>`);
            }
        }
        document.getElementById('dock-points').innerHTML = dots.join('');

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
            const scale = 1 + 0.32 * Math.max(0, 1 - distance / 160);
            tile.el.style.transform = scale === 1 ? '' : `translateY(${-(scale - 1) * tile.size * 0.45}px) scale(${scale})`;
        });
    }

    document.addEventListener('mousemove', event => {
        const inDock = event.clientY > window.innerHeight - 190 && Math.abs(event.clientX - window.innerWidth / 2) < 420;
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
            const opened = await window.os.launch(item.id);
            if (!opened) toast(`${item.name} n'est pas installé`, 'x');
        } else if (item.kind === 'trash') {
            window.os.openLocation('trash:///');
        } else if (item.kind === 'robbie') {
            face.setExpression('happy', 1400);
            face.blink();
        } else {
            toast('Les réglages arrivent bientôt', 'gear');
        }
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

    window.os.settings().then(settings => {
        face.setEyeColor(settings.eyeColor);
        face.setSkin(settings.skin);
    });

    window.addEventListener('resize', layout);
    build();
})();
