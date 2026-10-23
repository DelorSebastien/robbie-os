// Réglages de Robbie OS : apparence, Robbie, son, écran, système
(() => {
    const { escape, toast, bytes } = window.ui;
    const face = window.face;

    const SECTIONS = [
        ['apparence', 'Apparence', 'sparkles'],
        ['robbie', 'Robbie', 'person'],
        ['comptes', 'Comptes', 'users'],
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
        const current = settings.wallpaper || 'jour';
        // Vignette du fond au fil du jour : une tranche de chaque moment de la journée
        const slices = window.soleil.PHOTOS.map((name, i, all) =>
            `<img src="${window.fond.photo(name)}" alt="" loading="lazy" style="clip-path: inset(0 ${(100 - (i + 1) * 100 / all.length).toFixed(2)}% 0 ${(i * 100 / all.length).toFixed(2)}%)">`).join('');

        content.innerHTML = block('Fond d\'écran', `
            <div class="fonds">
                <button class="fond-choix jour${current === 'jour' ? ' actif' : ''}" data-fond="jour" title="Au fil du jour">
                    ${slices}<span>Au fil du jour</span>
                </button>${wallpapers.map((w, index) => `
                <button class="fond-choix${w.path === current ? ' actif' : ''}" data-fond="${index}" title="${escape(w.name)}">
                    <img src="${wallpaperUrl(w.path)}" alt="${escape(w.name)}" loading="lazy">
                </button>`).join('')}
            </div>
            ${current === 'jour' ? '<div class="reglage-ligne"><button class="bouton" data-defiler>Voir défiler la journée</button></div>' : ''}
            <p class="reglage-aide">« Au fil du jour » suit le soleil de ta ville (celle de la météo), de l'aurore à la nuit.
                Ajoute tes images dans le dossier Images (ou Images › Fonds d'écran) pour les retrouver ici.</p>`)
            + block('Couleur des yeux de Robbie', `
            <div class="pastilles">${Object.entries(EYE_COLORS).map(([key, rgb]) => `
                <button class="pastille-couleur${key === settings.eyeColor ? ' actif' : ''}" data-couleur="${key}" style="--c: ${rgb}" aria-label="${EYE_NAMES[key]}" title="${EYE_NAMES[key]}"></button>`).join('')}
            </div>`)
            + block('Costumes', `
            <label class="interrupteur"><input type="checkbox" data-costumes ${settings.skin === 'auto' ? 'checked' : ''}>
                <span>Costumes selon les fêtes (citrouille à Halloween…)</span></label>`);

        content.querySelectorAll('[data-fond]').forEach(button => button.addEventListener('click', async () => {
            const wallpaper = button.dataset.fond === 'jour' ? 'jour' : wallpapers[Number(button.dataset.fond)].path;
            await change({ wallpaper });
            applyWallpaper(wallpaper);
            renderAppearance().then(() => window.icons.fill(content));
        }));

        // (le panneau se ferme pour laisser voir tout le fond)
        content.querySelector('[data-defiler]')?.addEventListener('click', () => {
            window.panneaux.close();
            window.fond.preview(40);
        });

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
                applyWallpaper(settings.wallpaper);
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
                <button class="bouton" data-deconnecter>Se déconnecter</button>
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
        content.querySelector('[data-deconnecter]').addEventListener('click', () => window.os.logout());

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

    // ---- Comptes ----
    const ROLES = { admin: 'Administrateur', standard: 'Standard', enfant: 'Enfant', invite: 'Invité' };

    // Mot de passe administrateur : demandé dans le panneau, gardé 2 minutes en mémoire
    let adminPassword = null;
    let adminTimer = null;

    function askAdmin() {
        if (adminPassword) return Promise.resolve(adminPassword);
        return new Promise(resolve => {
            const box = document.createElement('form');
            box.className = 'admin-demande';
            box.innerHTML = `
                <p>Mot de passe d'un administrateur, pour confirmer</p>
                <div class="champ-ajout">
                    <input type="password" placeholder="Mot de passe" aria-label="Mot de passe administrateur">
                    <button aria-label="Valider" data-icon="check"></button>
                </div>
                <button type="button" class="petit-bouton" data-annuler>Annuler</button>`;
            window.icons.fill(box);
            content.prepend(box);
            box.querySelector('input').focus();
            box.addEventListener('submit', event => {
                event.preventDefault();
                box.remove();
                resolve(box.querySelector('input').value);
            });
            box.querySelector('[data-annuler]').addEventListener('click', () => {
                box.remove();
                resolve(null);
            });
        });
    }

    async function adminChange(args, input = '') {
        const password = await askAdmin();
        if (password == null) return false;
        const result = await window.os.changeAccount(args, password, input);
        if (!result.ok) {
            adminPassword = null;
            toast(result.error, 'x');
            return false;
        }
        adminPassword = password;
        clearTimeout(adminTimer);
        adminTimer = setTimeout(() => {
            adminPassword = null;
        }, 2 * 60 * 1000);
        return true;
    }

    // Identifiant tiré du prénom : « Léa Martin » → « leamartin »
    const slug = text => String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^[0-9]+/, '').slice(0, 30);

    async function renderAccounts() {
        const [me, accounts] = await Promise.all([window.os.me(), window.os.accounts()]);
        const admin = me.role === 'admin';
        const guest = accounts.some(a => a.role === 'invite');
        const people = accounts.filter(a => a.role !== 'invite');

        content.innerHTML = block('Ton compte', `
            <div class="compte-ligne">
                <span class="contact-rond">${escape(me.name.charAt(0).toUpperCase())}</span>
                <span class="liste-texte"><b>${escape(me.name)}</b><small>${escape(me.user)}</small></span>
                <span class="rang-badge ${me.role}">${ROLES[me.role]}</span>
                <button class="bouton" data-deconnexion>Se déconnecter</button>
            </div>`)
            + block('Comptes', `
            <div class="comptes-liste">${people.map(a => `
                <div class="compte-ligne" data-user="${escape(a.user)}">
                    <span class="contact-rond">${escape(a.name.charAt(0).toUpperCase())}</span>
                    <span class="liste-texte"><b>${escape(a.name)}</b><small>${escape(a.user)}</small></span>
                    ${admin ? `
                        <select data-rang aria-label="Rang de ${escape(a.name)}">${['admin', 'standard', 'enfant'].map(r => `<option value="${r}" ${r === a.role ? 'selected' : ''}>${ROLES[r]}</option>`).join('')}</select>
                        ${a.role === 'enfant' ? '<button class="petit-bouton" data-regles>Règles</button>' : ''}
                        <button class="petit-bouton" data-motdepasse>Mot de passe</button>
                        ${a.user !== me.user ? '<button class="petit-bouton danger" data-supprimer>Supprimer</button>' : ''}
                    ` : `<span class="rang-badge ${a.role}">${ROLES[a.role]}</span>`}
                </div>`).join('')}
            </div>
            ${admin ? '' : '<p class="reglage-aide">Seul un administrateur peut créer ou modifier des comptes.</p>'}`)
            + (admin ? block('Ajouter un compte', `
            <form class="compte-nouveau" data-nouveau>
                <input placeholder="Prénom ou nom" maxlength="40" required aria-label="Prénom ou nom" data-nom>
                <input placeholder="Identifiant" maxlength="30" required pattern="[a-z][a-z0-9_-]{1,29}" aria-label="Identifiant" data-identifiant>
                <select aria-label="Rang" data-nouveau-rang>${['standard', 'enfant', 'admin'].map(r => `<option value="${r}">${ROLES[r]}</option>`).join('')}</select>
                <input type="password" placeholder="Mot de passe" minlength="4" required aria-label="Mot de passe" data-mdp>
                <button class="bouton">Créer le compte</button>
            </form>`)
            + block('Session invité', `
            <label class="interrupteur"><input type="checkbox" data-invite ${guest ? 'checked' : ''}>
                <span>Permettre une session invité (sans mot de passe, effacée à chaque fois)</span></label>`) : '');

        content.querySelector('[data-deconnexion]').addEventListener('click', () => window.os.logout());
        if (!admin) return;

        const nameInput = content.querySelector('[data-nom]');
        const idInput = content.querySelector('[data-identifiant]');
        nameInput.addEventListener('input', () => {
            if (!idInput.dataset.touche) idInput.value = slug(nameInput.value);
        });
        idInput.addEventListener('input', () => {
            idInput.dataset.touche = '1';
        });

        content.querySelector('[data-nouveau]').addEventListener('submit', async event => {
            event.preventDefault();
            const role = content.querySelector('[data-nouveau-rang]').value;
            const ok = await adminChange(['creer', idInput.value, nameInput.value.trim(), role], `${content.querySelector('[data-mdp]').value}\n`);
            if (ok) {
                toast(`Compte de ${nameInput.value.trim()} créé`, 'check');
                // Un enfant commence avec quelques applis autorisées, sans le terminal
                if (role === 'enfant') await adminChange(['enfant', idInput.value], JSON.stringify({ apps: ['firefox-esr', 'org.xfce.ristretto'], debut: '08:00', fin: '20:00' }));
                show('comptes');
            }
        });

        content.querySelectorAll('.comptes-liste .compte-ligne').forEach(row => {
            const user = row.dataset.user;
            const account = accounts.find(a => a.user === user);

            row.querySelector('[data-rang]').addEventListener('change', async event => {
                const ok = await adminChange(['rang', user, event.target.value]);
                if (ok && event.target.value === 'enfant' && !account.rules) {
                    await adminChange(['enfant', user], JSON.stringify({ apps: ['firefox-esr', 'org.xfce.ristretto'], debut: '08:00', fin: '20:00' }));
                }
                toast(ok ? `${account.name} : ${ROLES[event.target.value]}` : 'Rang inchangé', ok ? 'check' : 'x');
                show('comptes');
            });

            row.querySelector('[data-motdepasse]').addEventListener('click', () => {
                if (row.nextElementSibling?.matches('.compte-edition')) return row.nextElementSibling.remove();
                const form = document.createElement('form');
                form.className = 'compte-edition champ-ajout';
                form.innerHTML = `<input type="password" placeholder="Nouveau mot de passe de ${escape(account.name)}" minlength="4" required aria-label="Nouveau mot de passe">
                    <button aria-label="Valider" data-icon="check"></button>`;
                window.icons.fill(form);
                row.after(form);
                form.querySelector('input').focus();
                form.addEventListener('submit', async event => {
                    event.preventDefault();
                    const ok = await adminChange(['motdepasse', user], `${form.querySelector('input').value}\n`);
                    if (ok) {
                        toast(`Mot de passe de ${account.name} changé`, 'check');
                        form.remove();
                    }
                });
            });

            row.querySelector('[data-supprimer]')?.addEventListener('click', async event => {
                const button = event.currentTarget;
                if (!button.dataset.confirm) {
                    button.dataset.confirm = '1';
                    button.textContent = 'Confirmer ?';
                    return;
                }
                const ok = await adminChange(['supprimer', user]);
                if (ok) {
                    toast(`Compte de ${account.name} supprimé`, 'check');
                    show('comptes');
                }
            });

            row.querySelector('[data-regles]')?.addEventListener('click', async () => {
                if (row.nextElementSibling?.matches('.regles-enfant')) return row.nextElementSibling.remove();
                const apps = await window.os.apps();
                const rules = account.rules || { apps: [], debut: '', fin: '' };
                const box = document.createElement('form');
                box.className = 'regles-enfant';
                box.innerHTML = `
                    <p class="reglage-aide">Applis que ${escape(account.name)} peut utiliser</p>
                    <div class="regles-applis">${apps.map(app => `
                        <label><input type="checkbox" value="${escape(app.id)}" ${rules.apps.includes(app.id) ? 'checked' : ''}> ${escape(app.name)}</label>`).join('')}
                    </div>
                    <div class="reglage-ligne">
                        <span>Utilisable de</span><input type="time" value="${escape(rules.debut || '')}" data-debut aria-label="Heure de début">
                        <span>à</span><input type="time" value="${escape(rules.fin || '')}" data-fin aria-label="Heure de fin">
                        <button class="bouton">Enregistrer</button>
                    </div>`;
                row.after(box);
                box.addEventListener('submit', async event => {
                    event.preventDefault();
                    const next = {
                        apps: [...box.querySelectorAll('.regles-applis input:checked')].map(input => input.value),
                        debut: box.querySelector('[data-debut]').value,
                        fin: box.querySelector('[data-fin]').value
                    };
                    const ok = await adminChange(['enfant', user], JSON.stringify(next));
                    if (ok) {
                        toast(`Règles de ${account.name} enregistrées`, 'check');
                        show('comptes');
                    }
                });
            });
        });

        content.querySelector('[data-invite]').addEventListener('change', async event => {
            const ok = await adminChange(['invite', event.target.checked ? 'on' : 'off']);
            if (!ok) event.target.checked = !event.target.checked;
            else toast(event.target.checked ? 'Session invité activée' : 'Session invité désactivée', 'check');
        });
    }

    const RENDER = { apparence: renderAppearance, robbie: renderRobbie, comptes: renderAccounts, son: renderSound, ecran: renderScreen, systeme: renderSystem };

    // ---- Fond d'écran : une image choisie, ou « jour » (par défaut) qui suit le soleil ----
    function applyWallpaper(file, options = {}) {
        window.fond.set(!file || file === 'jour' ? 'jour' : wallpaperUrl(file), { place: settings?.place, ...options });
    }

    window.os.settings().then(value => {
        settings = settings || value;
        applyWallpaper(value.wallpaper, { instant: true });
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
