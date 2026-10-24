// Logithèque : vitrine (à la une, rangées), catégories, recherche dans Flathub et Debian,
// fiche d'une appli, installation en un clic avec sa progression, applis installées
(() => {
    const api = window.logitheque;
    const $ = selector => document.querySelector(selector);
    const escape = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const content = $('#contenu');
    const sheet = $('#fiche');

    const TITLES = {
        decouvrir: ['Découvrir', ''],
        jeux: ['Jeux', 'Aventure, stratégie, course, et les lanceurs comme Steam'],
        creer: ['Créer', 'Dessin, retouche photo, 3D et mise en page'],
        travail: ['Travail', 'Documents, tableurs, notes et organisation'],
        multimedia: ['Musique et vidéo', 'Lecteurs, montage, streaming et enregistrement'],
        internet: ['Internet', 'Navigateurs, messageries, courrier et téléchargement'],
        developpement: ['Développement', 'Éditeurs de code, outils et environnements'],
        education: ['Éducation', 'Apprendre, explorer les sciences et les langues'],
        outils: ['Outils', 'Utilitaires et outils du système']
    };

    // ---- État ----
    let view = 'decouvrir';
    let admin = false;
    // Applis installées (clé : source/id) et installations en cours (leur progression)
    let installed = new Map();
    const busy = new Map();
    // Toutes les applis affichées, retrouvées par les boutons
    const known = new Map();
    const keyOf = app => `${app.source}/${app.id}`;
    const remember = app => {
        known.set(keyOf(app), { ...known.get(keyOf(app)), ...app });
        return keyOf(app);
    };

    async function loadInstalled() {
        const list = await api.installed();
        installed = new Map(list.map(app => [keyOf(app), app]));
        list.forEach(remember);
        return list;
    }

    // ---- Petits morceaux ----
    function iconHtml(app) {
        const src = app.icon || app.iconData;
        return `<span class="pastille">${src ? `<img src="${escape(src)}" alt="" loading="lazy" draggable="false">` : '<span data-icon="bag"></span>'}</span>`;
    }

    // Le bouton d'une appli : Installer, sa progression, ou Ouvrir quand elle est là
    function actionHtml(app, { small = false, wide = false } = {}) {
        const key = keyOf(app);
        const size = small ? ' petit' : '';
        const progress = busy.get(key);
        if (progress) {
            return `<button class="bouton progres${size}" data-key="${escape(key)}" style="--p:${progress.percent}">${progress.percent}%</button>`;
        }
        if (installed.has(key)) return `<button class="bouton${size}" data-ouvrir="${escape(key)}">Ouvrir</button>`;
        return `<button class="bouton principal${size}" data-installer="${escape(key)}">${wide ? 'Installer' : 'Obtenir'}</button>`;
    }

    // Une installation avance : tous les boutons de cette appli suivent
    function refreshButtons(key) {
        const app = known.get(key);
        if (!app) return;
        document.querySelectorAll(`[data-key="${CSS.escape(key)}"], [data-ouvrir="${CSS.escape(key)}"], [data-installer="${CSS.escape(key)}"]`).forEach(button => {
            const wide = button.closest('.fiche-actions, .une');
            button.outerHTML = actionHtml(app, { small: button.classList.contains('petit'), wide: Boolean(wide) });
        });
    }

    const sourceHtml = app => app.source === 'debian' ? '<span class="source debian">Debian</span>' : '';

    function tileHtml(app) {
        const key = remember(app);
        return `<div class="tuile" data-fiche="${escape(key)}" role="button" tabindex="0">
            ${iconHtml(app)}
            <b>${escape(app.name)}</b>
            <span class="resume">${escape(app.summary)}</span>
            ${actionHtml(app, { small: true })}
        </div>`;
    }

    function cardHtml(app) {
        const key = remember(app);
        return `<div class="carte" data-fiche="${escape(key)}" role="button" tabindex="0">
            ${iconHtml(app)}
            <div class="carte-texte"><b>${escape(app.name)}</b><span>${escape(app.summary)}</span>${sourceHtml(app)}</div>
            ${actionHtml(app, { small: true })}
        </div>`;
    }

    const emptyHtml = (icon, title, text) => `<div class="vide"><span data-icon="${icon}"></span><b>${escape(title)}</b><span>${escape(text)}</span></div>`;

    function message(text) {
        const box = $('#message');
        box.textContent = text;
        box.hidden = false;
        clearTimeout(message.timer);
        message.timer = setTimeout(() => {
            box.hidden = true;
        }, 3200);
    }

    // Une question (et, pour Debian, le mot de passe de l'administrateur) : renvoie null si annulée
    function ask({ title, text, confirm, password = false, danger = false }) {
        return new Promise(resolve => {
            const back = $('#dialogue');
            back.innerHTML = `<form class="dialogue">
                <h4>${escape(title)}</h4>
                <p>${escape(text)}</p>
                ${password ? '<input type="password" placeholder="Mot de passe administrateur" autocomplete="off" required>' : ''}
                <span class="erreur" hidden></span>
                <div class="ligne">
                    <button type="button" class="bouton" data-annuler>Annuler</button>
                    <button type="submit" class="bouton ${danger ? 'danger' : 'principal'}">${escape(confirm)}</button>
                </div>
            </form>`;
            back.hidden = false;
            const form = back.querySelector('form');
            const input = form.querySelector('input');
            (input || form.querySelector('[type=submit]')).focus();
            const close = value => {
                back.hidden = true;
                back.innerHTML = '';
                resolve(value);
            };
            form.addEventListener('submit', event => {
                event.preventDefault();
                close(input ? input.value : '');
            });
            form.querySelector('[data-annuler]').addEventListener('click', () => close(null));
            back.addEventListener('mousedown', event => event.target === back && close(null));
            form.addEventListener('keydown', event => event.key === 'Escape' && close(null));
        });
    }

    // ---- Installer, désinstaller, ouvrir ----
    async function install(key) {
        const app = known.get(key);
        if (!app || busy.has(key)) return;
        let password = '';
        if (app.source === 'debian') {
            if (!admin) return message('Seul un administrateur peut installer un logiciel de Debian');
            password = await ask({ title: 'INSTALLER', text: `${app.name} vient de Debian : le mot de passe de l'administrateur est demandé.`, confirm: 'Installer', password: true });
            if (password === null) return;
        }

        busy.set(key, { percent: 0, text: 'Préparation…' });
        refreshButtons(key);
        const result = await api.install(app, password);
        busy.delete(key);
        if (result.ok) {
            await loadInstalled();
            message(`${app.name} est installée`);
        } else {
            message(result.error);
        }
        refreshButtons(key);
        if (view === 'installees') render();
    }

    async function uninstall(key) {
        const app = known.get(key);
        if (!app || busy.has(key)) return;
        const password = await ask({
            title: 'DÉSINSTALLER',
            text: app.source === 'debian'
                ? `${app.name} sera retirée de l'ordinateur. Le mot de passe de l'administrateur est demandé.`
                : `${app.name} sera retirée de l'ordinateur. Tes documents ne sont pas touchés.`,
            confirm: 'Désinstaller',
            password: app.source === 'debian',
            danger: true
        });
        if (password === null) return;

        busy.set(key, { percent: 0, text: 'Désinstallation…' });
        refreshButtons(key);
        const result = await api.uninstall(app, password);
        busy.delete(key);
        if (result.ok) {
            await loadInstalled();
            message(`${app.name} est désinstallée`);
        } else {
            message(result.error);
        }
        refreshButtons(key);
        if (view === 'installees') render();
        if (!sheet.hidden && sheet.dataset.key === key) openSheet(key);
    }

    api.onProgress(({ key, percent, text }) => {
        if (!busy.has(key)) return;
        busy.set(key, { percent, text });
        document.querySelectorAll(`[data-key="${CSS.escape(key)}"]`).forEach(button => {
            button.style.setProperty('--p', percent);
            button.textContent = `${percent}%`;
            button.title = text;
        });
        const status = sheet.querySelector('[data-etat]');
        if (status && sheet.dataset.key === key) status.textContent = text;
    });

    // ---- Vues ----
    async function renderDiscover() {
        content.innerHTML = `<div class="attente une-vide"></div>
            <div class="section-titre"><h3>&nbsp;</h3></div>
            <div class="rangee">${'<div class="attente tuile-vide"></div>'.repeat(7)}</div>`;
        let data;
        try {
            data = await api.showcase();
        } catch {
            data = null;
        }
        if (view !== 'decouvrir') return;
        if (!data || (!data.featured && !data.rows.length)) {
            content.innerHTML = emptyHtml('wifi-off', 'Pas de connexion', 'La vitrine de Flathub a besoin d’internet. Les applis de Debian restent dans la recherche.');
            return window.icons.fill(content);
        }

        const featured = data.featured;
        let html = '';
        if (featured) {
            const key = remember(featured);
            const tint = hexToRgb(featured.color);
            html += `<div class="une" data-fiche="${escape(key)}" style="${tint ? `--teinte:${tint};` : ''}${featured.screenshots[0] ? `--capture:url('${escape(featured.screenshots[0])}')` : ''}">
                <div class="une-texte">
                    <span class="une-etiquette">À LA UNE AUJOURD’HUI</span>
                    <div class="une-nom">${featured.icon ? `<img src="${escape(featured.icon)}" alt="">` : ''}<h2>${escape(featured.name)}</h2></div>
                    <p>${escape(featured.summary)}</p>
                    ${actionHtml(featured, { wide: true })}
                </div>
                ${featured.screenshots[0] ? `<img class="une-capture" src="${escape(featured.screenshots[0])}" alt="">` : ''}
            </div>`;
        }
        for (const row of data.rows) {
            html += `<div class="section-titre"><h3>${escape(row.title.toUpperCase())}</h3>${row.category ? `<button class="lien" data-aller="${row.category}">Tout voir</button>` : ''}</div>
                <div class="rangee-zone">
                    <button class="defiler gauche" data-defiler="-1" data-icon="chevron-left" aria-label="Précédentes"></button>
                    <div class="rangee">${row.apps.map(tileHtml).join('')}</div>
                    <button class="defiler droite" data-defiler="1" data-icon="chevron-right" aria-label="Suivantes"></button>
                </div>`;
        }
        content.innerHTML = html;
        window.icons.fill(content);
    }

    // (couleur de la marque d'une appli, « #3584e4 » → « 53, 132, 228 », assombrie pour le texte blanc)
    function hexToRgb(hex) {
        const match = /^#?([0-9a-f]{6})$/i.exec(hex || '');
        if (!match) return null;
        const value = parseInt(match[1], 16);
        const rgb = [value >> 16, (value >> 8) & 255, value & 255];
        const light = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000;
        const factor = light > 140 ? 0.55 : 1;
        return rgb.map(v => Math.round(v * factor)).join(', ');
    }

    async function renderCategory(id) {
        const [title, subtitle] = TITLES[id];
        content.innerHTML = `<header class="entete"><div><h2>${escape(title)}</h2><p>${escape(subtitle)}</p></div></header>
            <div class="grille">${'<div class="attente" style="height:84px"></div>'.repeat(12)}</div>`;
        let page = 1;
        let result;
        try {
            result = await api.category(id, page);
        } catch {
            result = null;
        }
        if (view !== id) return;
        if (!result?.apps.length) {
            content.querySelector('.grille').outerHTML = emptyHtml('wifi-off', 'Pas de connexion', 'Les catégories viennent de Flathub, qui a besoin d’internet.');
            return window.icons.fill(content);
        }

        const grid = content.querySelector('.grille');
        grid.innerHTML = result.apps.map(cardHtml).join('');
        const more = () => {
            content.querySelector('.plus')?.remove();
            if (!result.more) return;
            grid.insertAdjacentHTML('afterend', '<div class="plus"><button class="bouton" data-plus>Voir plus d’applis</button></div>');
            content.querySelector('[data-plus]').addEventListener('click', async event => {
                event.target.disabled = true;
                page += 1;
                result = await api.category(id, page).catch(() => ({ apps: [], more: false }));
                if (view !== id) return;
                const shown = new Set([...grid.querySelectorAll('[data-fiche]')].map(el => el.dataset.fiche));
                grid.insertAdjacentHTML('beforeend', result.apps.filter(app => !shown.has(keyOf(app))).map(cardHtml).join(''));
                more();
            });
        };
        more();
        window.icons.fill(content);
    }

    let searchTimer = null;
    let searchRun = 0;
    async function renderSearch(query) {
        const run = ++searchRun;
        content.innerHTML = `<header class="entete"><div><h2>Recherche</h2><p>« ${escape(query)} »</p></div></header>
            <div class="grille">${'<div class="attente" style="height:84px"></div>'.repeat(6)}</div>`;
        const results = await api.search(query);
        if (run !== searchRun || view !== 'recherche') return;

        let html = `<header class="entete"><div><h2>Recherche</h2><p>« ${escape(query)} »</p></div></header>`;
        if (!results.flathub.length && !results.debian.length) {
            html += emptyHtml('search', 'Aucune appli trouvée', 'Essaie avec un autre mot, en anglais par exemple (« photo editor »).');
        }
        if (results.flathub.length) html += `<div class="grille">${results.flathub.map(cardHtml).join('')}</div>`;
        if (results.debian.length) {
            html += `<div class="section-titre"><h3>${results.flathub.length ? 'AUSSI DANS DEBIAN' : 'DANS DEBIAN'}</h3></div><div class="grille">${results.debian.map(cardHtml).join('')}</div>`;
        }
        content.innerHTML = html;
        window.icons.fill(content);
    }

    let installedFilter = 'tout';
    async function renderInstalled() {
        content.innerHTML = '<header class="entete"><div><h2>Installées</h2><p>Chargement…</p></div></header>';
        const list = await loadInstalled();
        if (view !== 'installees') return;
        const shown = list.filter(app => installedFilter === 'tout' || app.source === installedFilter);
        const count = source => list.filter(app => app.source === source).length;
        content.innerHTML = `<header class="entete">
                <div><h2>Installées</h2><p>${list.length} appli${list.length > 1 ? 's' : ''} sur cet ordinateur</p></div>
                <div class="filtres">${[['tout', 'Toutes', list.length], ['flathub', 'Flathub', count('flathub')], ['debian', 'Debian', count('debian')]]
                    .map(([id, label, n]) => `<button data-filtre="${id}" class="${installedFilter === id ? 'actif' : ''}">${label} · ${n}</button>`).join('')}</div>
            </header>
            ${shown.length ? `<div class="liste">${shown.map(app => {
                const key = remember(app);
                return `<div class="ligne-appli">
                    ${iconHtml(app)}
                    <div class="carte-texte"><b>${escape(app.name)}</b><span>${escape(app.version || app.summary || '')}${app.size ? ` · ${escape(app.size)}` : ''}</span></div>
                    ${sourceHtml(app)}
                    <div class="actions">
                        ${busy.has(key) ? actionHtml(app, { small: true }) : `<button class="bouton petit" data-ouvrir="${escape(key)}">Ouvrir</button>`}
                        ${app.removable ? `<button class="bouton petit danger" data-desinstaller="${escape(key)}" data-icon="trash" title="Désinstaller"></button>` : ''}
                    </div>
                </div>`;
            }).join('')}</div>` : emptyHtml('bag', 'Rien ici pour l’instant', 'Les applis que tu installes depuis Flathub apparaissent ici.')}`;
        content.querySelectorAll('[data-filtre]').forEach(button => button.addEventListener('click', () => {
            installedFilter = button.dataset.filtre;
            renderInstalled();
        }));
        window.icons.fill(content);
    }

    function render() {
        content.scrollTop = 0;
        if (view === 'decouvrir') return renderDiscover();
        if (TITLES[view]) return renderCategory(view);
        if (view === 'installees') return renderInstalled();
        if (view === 'mises-a-jour') return window.majVue.render(content);
        if (view === 'recherche') return renderSearch($('#chercher').value.trim());
    }

    function go(id) {
        view = id;
        closeSheet();
        if (id !== 'recherche') $('#chercher').value = '';
        document.querySelectorAll('[data-vue]').forEach(button => button.classList.toggle('actif', button.dataset.vue === id));
        render();
    }

    // ---- Fiche ----
    async function openSheet(key) {
        const base = known.get(key);
        if (!base) return;
        sheet.dataset.key = key;
        sheet.hidden = false;
        sheet.scrollTop = 0;
        const head = app => `<button class="retour" data-retour data-icon="chevron-left">Retour</button>
            <div class="fiche-tete">
                ${iconHtml(app)}
                <div class="fiche-titre">
                    <h2>${escape(app.name)}</h2>
                    <p>${escape(app.summary)}</p>
                    ${app.developer ? `<span class="auteur">${app.verified ? '<span data-icon="check" title="Développeur vérifié"></span>' : ''}${escape(app.developer)}</span>` : ''}
                </div>
                <div class="fiche-actions">
                    ${actionHtml(app, { wide: true })}
                    ${installed.has(key) && installed.get(key).removable ? `<button class="bouton danger" data-desinstaller="${escape(key)}">Désinstaller</button>` : ''}
                    <small data-etat>${app.source === 'debian' ? 'Depuis Debian' : 'Depuis Flathub'}</small>
                </div>
            </div>`;
        sheet.innerHTML = head(base) + '<div class="captures"><div class="attente" style="aspect-ratio:16/10"></div><div class="attente" style="aspect-ratio:16/10"></div></div>';
        window.icons.fill(sheet);

        let app;
        try {
            app = await api.details(base.source, base.id);
        } catch {
            app = null;
        }
        if (sheet.dataset.key !== key || sheet.hidden) return;
        if (!app) {
            sheet.innerHTML = head(base) + emptyHtml('wifi-off', 'Fiche indisponible', 'Elle n’a pas pu être chargée. Vérifie la connexion.');
            return window.icons.fill(sheet);
        }
        remember({ ...app, icon: app.icon || base.icon, iconData: app.iconData || base.iconData });
        app = known.get(key);

        const date = app.released ? new Date(app.released).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
        const infos = [
            ['Version', app.version ? `${escape(app.version)}${date ? ` · ${date}` : ''}` : ''],
            ['Licence', app.license ? `${app.free === false ? 'Propriétaire' : 'Libre'} · ${escape(app.license.replace(/^LicenseRef-proprietary.*/, 'propriétaire'))}` : ''],
            ['Source', app.source === 'debian' ? `Debian (paquet ${escape(app.id)})` : 'Flathub'],
            ['Site', app.website ? `<button data-site="${escape(app.website)}" data-icon="external">${escape(app.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))}</button>` : '']
        ].filter(([, value]) => value);

        sheet.innerHTML = head(app) +
            (app.screenshots.length ? `<div class="captures">${app.screenshots.map(src => `<img src="${escape(src)}" alt="" loading="lazy" data-agrandir>`).join('')}</div>` : '') +
            `<div class="fiche-corps">
                <div class="description">${app.description || `<p>${escape(app.summary)}</p>`}</div>
                <dl class="infos">${infos.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>
            </div>`;
        window.icons.fill(sheet);
    }

    function closeSheet() {
        sheet.hidden = true;
        sheet.dataset.key = '';
        sheet.innerHTML = '';
    }

    // ---- Clics (un seul écouteur pour toute la page) ----
    document.addEventListener('click', event => {
        const target = event.target.closest('button, [data-fiche], [data-agrandir]');
        if (!target) return;
        const data = target.dataset;
        if (data.vue) return go(data.vue);
        if (data.aller) return go(data.aller);
        if (data.installer) return install(data.installer);
        if (data.ouvrir) {
            const app = known.get(data.ouvrir);
            return app && api.open(app).then(ok => ok || message('Cette appli ne s’ouvre pas d’ici'));
        }
        if (data.desinstaller) return uninstall(data.desinstaller);
        if (data.retour !== undefined) return closeSheet();
        if (data.site) return api.website(data.site);
        if (data.defiler) {
            const row = target.parentElement.querySelector('.rangee');
            return row.scrollBy({ left: Number(data.defiler) * row.clientWidth * 0.85 });
        }
        if (data.agrandir !== undefined) {
            const big = $('#capture-grande');
            big.querySelector('img').src = target.src;
            big.hidden = false;
            return;
        }
        if (data.fiche && !target.matches('button')) openSheet(data.fiche);
    });

    $('#capture-grande').addEventListener('click', () => {
        $('#capture-grande').hidden = true;
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Enter' && event.target.dataset?.fiche) openSheet(event.target.dataset.fiche);
        if (event.key !== 'Escape') return;
        if (!$('#capture-grande').hidden) $('#capture-grande').hidden = true;
        else if (!sheet.hidden) closeSheet();
    });

    // Ctrl + F : la recherche
    document.addEventListener('keydown', event => {
        if (event.ctrlKey && event.key.toLowerCase() === 'f') {
            event.preventDefault();
            $('#chercher').focus();
        }
    });

    $('#chercher').addEventListener('input', event => {
        clearTimeout(searchTimer);
        const query = event.target.value.trim();
        searchTimer = setTimeout(() => {
            if (!query) return go('decouvrir');
            view = 'recherche';
            closeSheet();
            document.querySelectorAll('[data-vue]').forEach(button => button.classList.remove('actif'));
            render();
        }, 350);
    });

    // ---- Thème de Robbie OS (sombre, clair, automatique selon le soleil) ----
    let themeSettings = { theme: 'sombre' };
    function applyTheme(settings = themeSettings) {
        themeSettings = settings;
        let theme = settings.theme;
        if (theme === 'auto') {
            const place = settings.place || { latitude: 44.0556, longitude: 5.0481 };
            const now = new Date();
            const { sunrise, sunset } = window.soleil.sunTimes(now, place.latitude, place.longitude);
            const minutes = now.getHours() * 60 + now.getMinutes();
            theme = minutes >= sunrise && minutes < sunset ? 'clair' : 'sombre';
        }
        document.documentElement.classList.toggle('clair', theme === 'clair');
        // (la couleur d'accent choisie dans les Réglages de Robbie OS)
        const ACCENTS = { cyan: [94, 231, 255], green: [94, 240, 168], pink: [255, 110, 200], gold: [255, 196, 80], purple: [185, 140, 255], white: [225, 240, 255] };
        const rgb = ACCENTS[settings.accent] || ACCENTS.cyan;
        document.documentElement.style.setProperty('--accent', rgb.join(', '));
        document.documentElement.style.setProperty('--accent-texte', theme === 'clair' ? `rgb(${rgb.map(v => Math.round(v * 0.55)).join(', ')})` : `rgb(${rgb.join(', ')})`);
    }
    api.theme().then(applyTheme);
    api.onTheme(applyTheme);
    setInterval(() => applyTheme(), 60 * 1000);

    // Ouverte sur ses mises à jour (notification, Réglages)
    api.onOpen(id => go(id));

    // Pour la vue des mises à jour
    window.logi = { escape, iconHtml, emptyHtml, message, isAdmin: () => admin, current: () => view };

    // La vitrine s'affiche tout de suite ; les boutons passent à « Ouvrir » une fois les applis installées connues
    go('decouvrir');
    (async () => {
        admin = await api.isAdmin();
        await loadInstalled().catch(() => {});
        installed.forEach((_app, key) => refreshButtons(key));
    })();
})();
