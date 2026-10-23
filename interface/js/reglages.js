// Réglages de Robbie OS : apparence, Robbie, son, écran, système
(() => {
    const { escape, toast, bytes } = window.ui;
    const face = window.face;

    const SECTIONS = [
        ['apparence', 'Apparence', 'sparkles'],
        ['robbie', 'Robbie', 'person'],
        ['son', 'Son', 'volume'],
        ['ecran', 'Écran', 'grid'],
        ['systeme', 'Système', 'cpu']
    ];

    const EYE_COLORS = { cyan: '56, 232, 255', green: '80, 255, 140', pink: '255, 110, 200', gold: '255, 200, 70', purple: '170, 120, 255', white: '225, 240, 255' };
    const EYE_NAMES = { cyan: 'Cyan', green: 'Vert', pink: 'Rose', gold: 'Or', purple: 'Violet', white: 'Blanc' };

    const panel = window.panneaux.create('reglages', 'Réglages', { place: 'reglages', onOpen: () => show(section) });
    let section = 'apparence';
    let settings = null;

    panel.body.innerHTML = `
        <nav class="reglages-menu">${SECTIONS.map(([id, label, icon]) => `
            <button data-section="${id}" data-icon="${icon}"><span>${label}</span></button>`).join('')}
        </nav>
        <div class="reglages-contenu"></div>`;
    window.icons.fill(panel.body);
    const content = panel.body.querySelector('.reglages-contenu');

    panel.body.querySelectorAll('[data-section]').forEach(button => {
        button.addEventListener('click', () => show(button.dataset.section));
    });

    async function change(changes) {
        settings = await window.os.setSettings(changes);
        document.dispatchEvent(new CustomEvent('settings-changed', { detail: settings }));
        return settings;
    }

    async function show(id) {
        section = id;
        settings = await window.os.settings();
        panel.body.querySelectorAll('[data-section]').forEach(button => button.classList.toggle('actif', button.dataset.section === id));
        content.innerHTML = '';
        await RENDER[id]();
        window.icons.fill(content);
        content.scrollTop = 0;
    }

    const block = (title, html) => `<section class="reglage"><h3>${title}</h3>${html}</section>`;

    // ---- Apparence ----
    const wallpaperUrl = file => `fond://image?chemin=${encodeURIComponent(file)}`;

    async function renderAppearance() {
        const wallpapers = await window.os.wallpapers();
        const current = settings.wallpaper || wallpapers[0]?.path;

        content.innerHTML = block('Fond d\'écran', `
            <div class="fonds">${wallpapers.map((w, index) => `
                <button class="fond-choix${w.path === current ? ' actif' : ''}" data-fond="${index}" title="${escape(w.name)}">
                    <img src="${wallpaperUrl(w.path)}" alt="${escape(w.name)}" loading="lazy">
                </button>`).join('')}
            </div>
            <p class="reglage-aide">Ajoute tes images dans le dossier Images (ou Images › Fonds d'écran) pour les retrouver ici.</p>`)
            + block('Couleur des yeux de Robbie', `
            <div class="pastilles">${Object.entries(EYE_COLORS).map(([key, rgb]) => `
                <button class="pastille-couleur${key === settings.eyeColor ? ' actif' : ''}" data-couleur="${key}" style="--c: ${rgb}" aria-label="${EYE_NAMES[key]}" title="${EYE_NAMES[key]}"></button>`).join('')}
            </div>`)
            + block('Costumes', `
            <label class="interrupteur"><input type="checkbox" data-costumes ${settings.skin === 'auto' ? 'checked' : ''}>
                <span>Costumes selon les fêtes (citrouille à Halloween…)</span></label>`);

        content.querySelectorAll('[data-fond]').forEach(button => button.addEventListener('click', async () => {
            const wallpaper = wallpapers[Number(button.dataset.fond)];
            await change({ wallpaper: wallpaper.path });
            applyWallpaper(wallpaper.path);
            renderAppearance().then(() => window.icons.fill(content));
        }));

        content.querySelectorAll('[data-couleur]').forEach(button => button.addEventListener('click', async () => {
            await change({ eyeColor: button.dataset.couleur });
            face.setEyeColor(button.dataset.couleur);
            face.setExpression('happy', 1200);
            renderAppearance();
        }));

        content.querySelector('[data-costumes]').addEventListener('change', async event => {
            const skin = event.target.checked ? 'auto' : 'none';
            await change({ skin });
            face.setSkin(skin);
        });
    }

    // ---- Robbie ----
    const voiceName = id => {
        const [, speaker, quality] = id.match(/^fr_FR-([^-]+)-(\w+)$/) || [];
        if (!speaker) return id;
        const names = { siwis: 'Siwis (femme)', tom: 'Tom (homme)', gilles: 'Gilles (homme)', upmc: 'UPMC', mls: 'MLS', mls_1840: 'MLS 1840' };
        return `${names[speaker] || speaker}${quality === 'low' ? ' · qualité basse' : ''}`;
    };

    async function renderRobbie() {
        const voices = await window.os.voices();

        content.innerHTML = block('Voix', `
            <div class="reglage-ligne">
                <select data-voix aria-label="Voix de Robbie">${voices.map(v => `<option value="${v}" ${v === settings.voice ? 'selected' : ''}>${escape(voiceName(v))}</option>`).join('')}</select>
                <button class="bouton" data-ecouter>Écouter</button>
            </div>
            <label class="interrupteur"><input type="checkbox" data-robot ${settings.robotVoice !== false ? 'checked' : ''}><span>Effet robot</span></label>`)
            + block('Sensibilité du micro', `
            <div class="reglage-ligne">
                <span class="reglage-mini">Plus sensible</span>
                <input type="range" min="60" max="400" step="10" value="${settings.voiceThreshold || 150}" data-seuil aria-label="Seuil de détection de la voix">
                <span class="reglage-mini">Moins sensible</span>
            </div>
            <p class="reglage-aide">Plus sensible : Robbie t'entend de plus loin, mais réagit aussi aux bruits. Seuil actuel : <b data-seuil-valeur>${settings.voiceThreshold || 150}</b></p>`)
            + block('Ville de la météo', `
            <form class="champ-ajout" data-ville>
                <input placeholder="${escape(settings.place.name)}" autocomplete="off" aria-label="Ville de la météo">
                <button aria-label="Chercher" data-icon="search"></button>
            </form>
            <p class="reglage-aide" data-ville-info>Ville actuelle : ${escape(settings.place.name)}</p>`);

        content.querySelector('[data-voix]').addEventListener('change', async event => {
            await change({ voice: event.target.value });
            window.os.reloadVoice();
        });
        content.querySelector('[data-robot]').addEventListener('change', async event => {
            await change({ robotVoice: event.target.checked });
            window.os.reloadVoice();
        });
        content.querySelector('[data-ecouter]').addEventListener('click', () => window.os.reloadVoice());

        const slider = content.querySelector('[data-seuil]');
        let timer = null;
        slider.addEventListener('input', () => {
            content.querySelector('[data-seuil-valeur]').textContent = slider.value;
            clearTimeout(timer);
            timer = setTimeout(async () => {
                await change({ voiceThreshold: Number(slider.value) });
                window.os.reloadEars();
            }, 600);
        });

        content.querySelector('[data-ville]').addEventListener('submit', async event => {
            event.preventDefault();
            const input = event.target.querySelector('input');
            const info = content.querySelector('[data-ville-info]');
            if (!input.value.trim()) return;
            info.textContent = 'Recherche…';
            try {
                const place = await window.os.searchCity(input.value.trim());
                if (!place) throw new Error('introuvable');
                await change({ place: { name: place.name, latitude: place.latitude, longitude: place.longitude } });
                info.textContent = `Ville actuelle : ${place.name}${place.region ? `, ${place.region}` : ''}`;
                input.value = '';
                input.placeholder = place.name;
            } catch {
                info.textContent = 'Ville introuvable (ou pas d\'internet)';
            }
        });
    }

    // ---- Son ----
    async function renderSound() {
        const volume = await window.os.volume();
        content.innerHTML = block('Volume', `
            <div class="rapide-ligne">
                <button class="rapide-icone" data-mute data-icon="${volume?.muted ? 'volume-x' : 'volume'}" aria-label="Couper le son"></button>
                <input type="range" min="0" max="100" value="${volume?.level ?? 0}" data-volume aria-label="Volume" ${volume ? '' : 'disabled'}>
                <b data-volume-valeur>${volume ? (volume.muted ? 'muet' : `${volume.level}%`) : '—'}</b>
            </div>`);

        const slider = content.querySelector('[data-volume]');
        slider.addEventListener('input', () => {
            content.querySelector('[data-volume-valeur]').textContent = `${slider.value}%`;
            window.os.setVolume(Number(slider.value));
        });
        content.querySelector('[data-mute]').addEventListener('click', async () => {
            await window.os.toggleMute();
            renderSound().then(() => window.icons.fill(content));
        });
    }

    // ---- Écran ----
    async function renderScreen() {
        const screens = await window.os.displays();
        content.innerHTML = screens.length ? screens.map((screen, index) => block(escape(screen.description), `
            <div class="reglage-ligne">
                <span>Résolution</span>
                <select data-ecran="${index}" aria-label="Résolution">${screen.modes.map(m => `
                    <option value="${m.width}x${m.height}" ${m.current ? 'selected' : ''}>${m.width} × ${m.height}</option>`).join('')}</select>
            </div>`)).join('') : block('Écran', '<p class="reglage-aide">Aucun écran réglable trouvé.</p>');

        content.querySelectorAll('[data-ecran]').forEach(select => select.addEventListener('change', async () => {
            const screen = screens[Number(select.dataset.ecran)];
            const [width, height] = select.value.split('x').map(Number);
            const ok = await window.os.setResolution(screen.name, width, height);
            toast(ok ? `Résolution : ${width} × ${height}` : 'Résolution impossible', ok ? 'check' : 'x');
        }));
    }

    // ---- Système ----
    async function renderSystem() {
        const info = await window.os.systemInfo();
        const hours = Math.floor(info.uptime / 3600);
        const minutes = Math.floor((info.uptime % 3600) / 60);

        content.innerHTML = block('À propos', `
            <dl class="infos">
                <dt>Robbie OS</dt><dd>version ${escape(info.version)}</dd>
                <dt>Basé sur</dt><dd>${escape(info.base)}</dd>
                <dt>Noyau</dt><dd>Linux ${escape(info.kernel)}</dd>
                <dt>Processeur</dt><dd>${escape(info.cpu)} · ${info.cores} cœurs</dd>
                <dt>Mémoire</dt><dd>${bytes(info.memory)}</dd>
                ${info.disk ? `<dt>Disque</dt><dd>${bytes(info.disk.free)} libres sur ${bytes(info.disk.total)}</dd>` : ''}
                <dt>Allumé depuis</dt><dd>${hours ? `${hours} h ` : ''}${minutes} min</dd>
            </dl>`)
            + block('Verrouillage automatique', `
            <div class="reglage-ligne">
                <span>Verrouiller après</span>
                <select data-verrou aria-label="Verrouillage automatique">${[[0, 'Jamais'], [5, '5 minutes'], [10, '10 minutes'], [15, '15 minutes'], [30, '30 minutes']]
                    .map(([value, label]) => `<option value="${value}" ${Number(settings.lockMinutes) === value ? 'selected' : ''}>${label}</option>`).join('')}</select>
            </div>
            <p class="reglage-aide">Super+L verrouille tout de suite.</p>`)
            + block('Alimentation', `
            <div class="reglage-ligne boutons">
                <button class="bouton" data-verrouiller>Verrouiller</button>
                <button class="bouton" data-power="suspend">Mettre en veille</button>
                <button class="bouton" data-power="reboot">Redémarrer</button>
                <button class="bouton danger" data-power="poweroff">Éteindre</button>
            </div>`);

        content.querySelector('[data-verrou]').addEventListener('change', async event => {
            await change({ lockMinutes: Number(event.target.value) });
            window.os.reloadIdle();
        });

        content.querySelector('[data-verrouiller]').addEventListener('click', () => {
            window.panneaux.close();
            window.os.lock();
        });

        content.querySelectorAll('[data-power]').forEach(button => button.addEventListener('click', () => {
            if (button.dataset.confirm) return window.os.power(button.dataset.power);
            // Deuxième clic pour confirmer
            button.dataset.confirm = '1';
            button.textContent = 'Confirmer ?';
            setTimeout(() => {
                delete button.dataset.confirm;
                button.textContent = { suspend: 'Mettre en veille', reboot: 'Redémarrer', poweroff: 'Éteindre' }[button.dataset.power];
            }, 4000);
        }));
    }

    const RENDER = { apparence: renderAppearance, robbie: renderRobbie, son: renderSound, ecran: renderScreen, systeme: renderSystem };

    // ---- Fond d'écran ----
    const wallpaperImg = document.getElementById('fond');

    function applyWallpaper(file) {
        if (!file) return;
        wallpaperImg.src = wallpaperUrl(file);
        // (seule l'image de référence provisoire a un dock et une barre dessinés à cacher)
        wallpaperImg.classList.toggle('recadre', /reference-temporaire/.test(file));
    }

    window.os.settings().then(value => {
        if (value.wallpaper) applyWallpaper(value.wallpaper);
    });

    const open = (id = section) => {
        section = RENDER[id] ? id : section;
        if (window.panneaux.current() === 'reglages') show(section);
        else window.panneaux.open('reglages');
    };

    // « reglages-robbie », « reglages-systeme »… : ouvre directement une section
    window.os.onShortcut(name => {
        if (name.startsWith('reglages-')) open(name.slice('reglages-'.length));
    });

    window.reglages = { open };
})();
