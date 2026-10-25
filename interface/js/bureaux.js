// Bureaux virtuels : quatre mini-écrans en haut de la barre latérale. Les fenêtres de chaque
// bureau y sont dessinées en petits blocs aux couleurs de leur appli ; le bureau actif brille.
// Un clic change de bureau ; Super + 1…4 aussi (labwc prévient l'interface : « bureau-N »),
// et Super + Maj + 1…4 y envoie la fenêtre active (« envoi-N »).
// labwc ne dit pas sur quel bureau est une fenêtre : l'interface le retient elle-même
// (une fenêtre qui s'ouvre est sur le bureau affiché).
(() => {
    const COUNT = 4;
    const box = document.getElementById('bureaux');
    let current = 1;
    // Applis de chaque bureau (une entrée par fenêtre)
    const desktops = Array.from({ length: COUNT + 1 }, () => []);
    let known = new Map();

    // Couleur des blocs : celle de l'appli dans le dock, sinon une teinte tirée de son nom
    const TINTS = {
        'robbie-fichiers': '80, 170, 255',
        thunar: '80, 170, 255',
        'firefox-esr': '255, 130, 60',
        firefox: '255, 130, 60',
        foot: '190, 205, 230',
        'org.xfce.mousepad': '60, 130, 255',
        'robbie-photos': '160, 90, 255',
        'robbie-logitheque': '80, 220, 255'
    };
    function tint(appId) {
        if (TINTS[appId]) return TINTS[appId];
        let hash = 0;
        for (const c of appId) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
        const hue = hash % 360;
        return `hsl(${hue} 70% 62%)`;
    }
    const color = appId => (TINTS[appId] ? `rgb(${TINTS[appId]})` : tint(appId));

    // Blocs en cascade : la dernière fenêtre ouverte devant, décalée
    const PLACES = [[10, 14, 58, 56], [34, 28, 56, 54], [20, 40, 60, 46]];

    box.innerHTML = Array.from({ length: COUNT }, (_, i) =>
        `<button class="bureau" data-bureau="${i + 1}" aria-label="Bureau ${i + 1}"><span class="bureau-fenetres"></span><b>${i + 1}</b></button>`).join('');

    function render() {
        box.querySelectorAll('[data-bureau]').forEach(screen => {
            const number = Number(screen.dataset.bureau);
            const apps = desktops[number];
            const active = number === current;
            screen.classList.toggle('actif', active);
            screen.setAttribute('aria-current', active ? 'true' : 'false');
            screen.querySelector('.bureau-fenetres').innerHTML = apps.slice(-3).map((appId, i) => {
                const [x, y, w, h] = PLACES[i];
                return `<i style="left:${x}%;top:${y}%;width:${w}%;height:${h}%;background:${color(appId)}"></i>`;
            }).join('');
            const names = [...new Set(apps.map(appId => window.dock?.appName?.(appId) || appId))];
            screen.title = `Bureau ${number}${names.length ? ` · ${names.join(', ')}` : ' · vide'} (Super+${number})`;
        });
    }

    // Fenêtres ouvertes ou fermées : les nouvelles vont au bureau affiché, les fermées sont retirées
    // (d'abord du bureau affiché, où l'on ferme d'habitude)
    function update(list) {
        const counts = new Map();
        for (const w of list) counts.set(w.appId, (counts.get(w.appId) || 0) + 1);
        for (const [appId, count] of counts) {
            for (let n = known.get(appId) || 0; n < count; n++) desktops[current].push(appId);
        }
        for (const [appId, before] of known) {
            for (let n = counts.get(appId) || 0; n < before; n++) {
                const order = [current, ...[1, 2, 3, 4].filter(d => d !== current)];
                const where = order.find(d => desktops[d].includes(appId));
                if (where) desktops[where].splice(desktops[where].lastIndexOf(appId), 1);
            }
        }
        known = counts;
        render();
    }

    function show(number) {
        current = number;
        render();
    }

    // La fenêtre active part sur un autre bureau (on la suit)
    async function send(number) {
        const appId = await window.os.activeWindow();
        const from = desktops[current].lastIndexOf(appId);
        if (appId && from >= 0 && number !== current) {
            desktops[current].splice(from, 1);
            desktops[number].push(appId);
        }
        show(number);
    }

    box.addEventListener('click', event => {
        const screen = event.target.closest('[data-bureau]');
        if (screen && Number(screen.dataset.bureau) !== current) window.os.goToDesktop(Number(screen.dataset.bureau));
    });

    window.os.onShortcut(name => {
        const match = name.match(/^(bureau|envoi)-([1-4])$/);
        if (!match) return;
        if (match[1] === 'bureau') show(Number(match[2]));
        else send(Number(match[2]));
    });

    window.os.windows().then(update);
    window.os.onWindows(update);
    show(1);
    window.bureaux = { current: () => current, go: number => window.os.goToDesktop(number) };
})();
