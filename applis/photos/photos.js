// Photos : photothèque groupée par date (années, mois, jours, tout), collections automatiques,
// albums et favoris, sélection, glisser-déposer vers un album, importation, thème de Robbie OS
(() => {
    const api = window.photos;
    const $ = selector => document.querySelector(selector);
    const escape = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // Adresse d'un fichier pour <img> et <video> (les # et ? des noms sont encodés)
    const fileUrl = file => 'file://' + file.split('/').map(encodeURIComponent).join('/');

    // ---- Retouches : appliquées à l'affichage (vignettes, visionneuse), l'original ne change pas ----
    const FILTERS = {
        aucun: { label: 'Original', css: '' },
        vif: { label: 'Vif', css: 'saturate(1.35) contrast(1.08)' },
        chaud: { label: 'Chaud', css: 'sepia(0.22) saturate(1.25) hue-rotate(-8deg)' },
        froid: { label: 'Froid', css: 'saturate(1.05) hue-rotate(14deg) brightness(1.03)' },
        nb: { label: 'Noir et blanc', css: 'grayscale(1) contrast(1.12)' },
        retro: { label: 'Rétro', css: 'sepia(0.45) contrast(0.92) brightness(1.05) saturate(0.85)' }
    };

    function editStyle(edits = {}) {
        const { lumiere = 0, contraste = 0, saturation = 0, filtre = 'aucun', rotation = 0, recadrage } = edits;
        return {
            filter: `brightness(${1 + lumiere / 200}) contrast(${1 + contraste / 200}) saturate(${1 + saturation / 100}) ${FILTERS[filtre]?.css || ''}`.trim(),
            transform: rotation ? `rotate(${rotation}deg)` : '',
            objectViewBox: recadrage ? `inset(${recadrage.haut}% ${100 - recadrage.gauche - recadrage.largeur}% ${100 - recadrage.haut - recadrage.hauteur}% ${recadrage.gauche}%)` : ''
        };
    }

    function applyEdits(img, file) {
        const style = editStyle(data.retouches[file]);
        img.style.filter = style.filter;
        img.style.transform = style.transform;
        img.style.objectViewBox = style.objectViewBox;
    }

    // Photo tournée d'un quart de tour : sa largeur devient sa hauteur à l'écran,
    // on inverse donc les limites de taille (sinon elle déborde de la zone)
    function fitRotation(img, rotation, maxWidth, maxHeight) {
        const turned = (rotation || 0) % 180 !== 0;
        img.style.maxWidth = turned ? maxHeight : '';
        img.style.maxHeight = turned ? maxWidth : '';
    }

    // ---- État ----
    let library = [];
    let data = { favoris: [], albums: [], retouches: {} };
    let view = { type: 'bibliotheque' };
    let scale = 'jours';
    let list = [];
    // (position de chaque élément dans la liste affichée)
    let positions = new Map();
    const selection = new Set();
    let lastClicked = -1;

    const isFavorite = file => data.favoris.includes(file);
    const album = id => data.albums.find(a => a.id === id);

    // ---- Dates en français ----
    const dayFormat = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const monthFormat = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
    const capital = text => text.charAt(0).toUpperCase() + text.slice(1);
    const dayKey = time => { const d = new Date(time); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    const monthKey = time => dayKey(time).slice(0, 7);
    const yearKey = time => dayKey(time).slice(0, 4);
    const count = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;

    // ---- Collections ----
    const VIEWS = {
        bibliotheque: { title: 'Photothèque', items: () => library },
        favoris: { title: 'Favoris', items: () => library.filter(p => isFavorite(p.path)), empty: ['heart', 'Aucun favori', 'Clique sur le cœur d\'une photo pour la retrouver ici.'] },
        recentes: { title: 'Importées récemment', items: () => library.filter(p => p.imported).sort((a, b) => b.imported.localeCompare(a.imported) || b.date - a.date), empty: ['download', 'Rien d\'importé pour l\'instant', 'Le bouton Importer copie des photos depuis une clé USB, un appareil photo ou un téléphone.'] },
        captures: { title: 'Captures d\'écran', items: () => library.filter(p => p.capture), empty: ['capture', 'Aucune capture d\'écran', 'Le bouton capture de la barre latérale les range dans Images.'] },
        videos: { title: 'Vidéos', items: () => library.filter(p => p.kind === 'video'), empty: ['video', 'Aucune vidéo', 'Les vidéos de ton dossier personnel apparaîtront ici.'] },
        album: {
            title: () => album(view.id)?.nom || 'Album',
            items: () => { const a = album(view.id); return a ? library.filter(p => a.photos.includes(p.path)) : []; },
            empty: ['album', 'Album vide', 'Glisse des photos sur le nom de l\'album, ou clic droit › Ajouter à un album.']
        }
    };

    function show(type, id) {
        view = { type, id };
        selection.clear();
        render();
        document.querySelectorAll('.vues button').forEach(b => b.classList.toggle('actif', b.dataset.vue === type));
        document.querySelectorAll('.albums button').forEach(b => b.classList.toggle('actif', type === 'album' && b.dataset.album === id));
    }

    // ---- Affichage de la grille ----
    const zone = $('#zone');

    function render() {
        const current = VIEWS[view.type];
        list = current.items();
        positions = new Map(list.map((item, i) => [item, i]));
        const title = typeof current.title === 'function' ? current.title() : current.title;
        $('#titre').textContent = title;
        const photos = list.filter(p => p.kind === 'photo').length;
        const videos = list.length - photos;
        $('#sous-titre').textContent = [photos && count(photos, 'photo'), videos && count(videos, 'vidéo')].filter(Boolean).join(' · ') || ' ';

        const library_ = view.type === 'bibliotheque';
        $('#echelles').hidden = !library_ || !list.length || selection.size > 0;
        document.querySelectorAll('#echelles button').forEach(b => b.classList.toggle('actif', b.dataset.echelle === scale));
        $('#zoom').hidden = library_ && (scale === 'annees' || scale === 'mois');

        thumbObserver.disconnect();
        if (!list.length) {
            const [icon, heading, text] = current.empty || ['image', 'Aucune photo', 'Les photos de ton dossier personnel apparaîtront ici. Tu peux aussi en importer.'];
            zone.innerHTML = `<div class="vide-grand"><span data-icon="${icon}"></span><b>${heading}</b><span>${text}</span></div>`;
            window.icons.fill(zone);
            updateSelectionBar();
            return;
        }

        if (library_ && scale === 'annees') renderCards(group(list, yearKey), 'annees');
        else if (library_ && scale === 'mois') renderCards(group(list, monthKey), 'mois');
        else if (library_ && scale === 'jours') renderDays();
        else zone.innerHTML = `<div class="grille">${list.map(tile).join('')}</div>`;

        zone.querySelectorAll('[data-i]').forEach(el => thumbObserver.observe(el));
        window.icons.fill(zone);
        updateSelectionBar();
    }

    function group(items, keyOf) {
        const groups = new Map();
        for (const item of items) {
            const key = keyOf(item.date);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(item);
        }
        return groups;
    }

    function tile(item) {
        const i = positions.get(item);
        const marks = [isFavorite(item.path) && '<span class="coeur" data-icon="heart"></span>', data.retouches[item.path] && '<span data-icon="edit"></span>'].filter(Boolean).join('');
        return `<div class="vignette${selection.has(item.path) ? ' choisie' : ''}" data-i="${i}" draggable="true">
            ${marks ? `<span class="marques">${marks}</span>` : ''}${item.kind === 'video' ? '<span class="duree"></span>' : ''}</div>`;
    }

    function renderDays() {
        const days = group(list, dayKey);
        zone.innerHTML = [...days].map(([key, items]) => `
            <section class="groupe" data-jour="${key}">
                <h3>${capital(dayFormat.format(items[0].date))}<small>${count(items.length, 'élément')}</small></h3>
                <div class="grille">${items.map(tile).join('')}</div>
            </section>`).join('');
    }

    // Années et mois : une carte par période, avec la plus belle photo (un favori s'il y en a)
    function renderCards(groups, kind) {
        zone.innerHTML = `<div class="cartes ${kind}">${[...groups].map(([key, items]) => {
            const cover = items.find(p => isFavorite(p.path) && p.kind === 'photo') || items.find(p => p.kind === 'photo') || items[0];
            const label = kind === 'annees' ? key : capital(monthFormat.format(items[0].date));
            return `<button class="carte" data-periode="${key}" data-i="${positions.get(cover)}" data-carte>
                <span><b>${label}</b>${count(items.length, 'élément')}</span></button>`;
        }).join('')}</div>`;
        zone.querySelectorAll('[data-periode]').forEach(card => card.addEventListener('click', () => {
            scale = kind === 'annees' ? 'mois' : 'jours';
            render();
            const target = zone.querySelector(kind === 'annees' ? `[data-periode^="${card.dataset.periode}"]` : `[data-jour^="${card.dataset.periode}"]`);
            target?.scrollIntoView({ block: 'start' });
        }));
    }

    // Miniatures chargées quand elles arrivent à l'écran
    const thumbObserver = new IntersectionObserver(entries => {
        for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            thumbObserver.unobserve(entry.target);
            loadThumb(entry.target);
        }
    }, { root: zone, rootMargin: '400px' });

    async function loadThumb(el) {
        const item = list[Number(el.dataset.i)];
        if (!item || el.querySelector('img, video')) return;
        if (item.kind === 'video') {
            const video = document.createElement('video');
            video.muted = true;
            video.preload = 'metadata';
            video.src = `${fileUrl(item.path)}#t=1`;
            video.addEventListener('loadeddata', () => {
                video.classList.add('chargee');
                const duration = el.querySelector('.duree');
                if (duration && isFinite(video.duration)) duration.textContent = `${Math.floor(video.duration / 60)}:${String(Math.round(video.duration % 60)).padStart(2, '0')}`;
            });
            el.prepend(video);
            return;
        }
        const thumb = await api.thumbnail(item.path);
        const img = document.createElement('img');
        img.alt = '';
        img.decoding = 'async';
        img.src = fileUrl(thumb || item.path);
        img.addEventListener('load', () => img.classList.add('chargee'));
        if (!el.hasAttribute('data-carte')) applyEdits(img, item.path);
        el.prepend(img);
    }

    // ---- Clics : ouvrir, sélectionner (Ctrl, Maj), menu (clic droit) ----
    zone.addEventListener('click', event => {
        const el = event.target.closest('.vignette');
        if (!el) return;
        const i = Number(el.dataset.i);
        const file = list[i].path;
        if (event.shiftKey && lastClicked >= 0) {
            const [from, to] = [Math.min(lastClicked, i), Math.max(lastClicked, i)];
            list.slice(from, to + 1).forEach(p => selection.add(p.path));
        } else if (event.ctrlKey || event.metaKey || selection.size) {
            selection.has(file) ? selection.delete(file) : selection.add(file);
        } else {
            window.visionneuse.open(list, i);
            return;
        }
        lastClicked = i;
        refreshSelection();
    });

    function refreshSelection() {
        zone.querySelectorAll('.vignette').forEach(el => el.classList.toggle('choisie', selection.has(list[Number(el.dataset.i)].path)));
        updateSelectionBar();
    }

    function updateSelectionBar() {
        $('#selection').hidden = !selection.size;
        $('#selection-nombre').textContent = count(selection.size, 'sélectionnée');
        $('#echelles').hidden = view.type !== 'bibliotheque' || !list.length || selection.size > 0;
    }

    document.querySelectorAll('[data-sel]').forEach(button => button.addEventListener('click', event => {
        const files = [...selection];
        const action = button.dataset.sel;
        if (action === 'annuler') {
            selection.clear();
            refreshSelection();
        } else if (action === 'favori') {
            setFavorite(files, !files.every(isFavorite));
        } else if (action === 'album') {
            const box = button.getBoundingClientRect();
            openMenu(box.left, box.top - 8, albumMenu(files), true);
        } else if (action === 'corbeille') {
            trash(files);
        }
        event.stopPropagation();
    }));

    // Glisser des photos sur un album de la barre latérale
    zone.addEventListener('dragstart', event => {
        const el = event.target.closest('.vignette');
        if (!el) return;
        const file = list[Number(el.dataset.i)].path;
        const files = selection.has(file) ? [...selection] : [file];
        event.dataTransfer.setData('application/x-robbie-photos', JSON.stringify(files));
        event.dataTransfer.effectAllowed = 'copy';
    });

    zone.addEventListener('contextmenu', event => {
        const el = event.target.closest('.vignette');
        if (!el) return;
        event.preventDefault();
        const item = list[Number(el.dataset.i)];
        const files = selection.has(item.path) ? [...selection] : [item.path];
        const fav = files.every(isFavorite);
        const entries = [
            files.length === 1 && { label: 'Ouvrir', icon: 'image', run: () => window.visionneuse.open(list, Number(el.dataset.i)) },
            { label: fav ? 'Retirer des favoris' : 'Ajouter aux favoris', icon: 'heart', run: () => setFavorite(files, !fav) },
            '-',
            ...albumMenu(files),
            view.type === 'album' && { label: 'Retirer de cet album', icon: 'x', run: () => removeFromAlbum(view.id, files) },
            '-',
            files.length === 1 && { label: 'Afficher dans le dossier', icon: 'folder-open', run: () => api.showInFolder(item.path) },
            { label: files.length > 1 ? `Mettre ${files.length} éléments à la corbeille` : 'Mettre à la corbeille', icon: 'trash', danger: true, run: () => trash(files) }
        ];
        openMenu(event.clientX, event.clientY, entries);
    });

    function albumMenu(files) {
        return [
            { title: 'Ajouter à un album' },
            ...data.albums.map(a => ({ label: a.nom, icon: 'album', run: () => addToAlbum(a.id, files) })),
            { label: 'Nouvel album…', icon: 'plus', run: async () => { const a = await newAlbum(); if (a) addToAlbum(a.id, files); } }
        ];
    }

    // ---- Actions ----
    async function setFavorite(files, on) {
        data = await api.favorite(files, on);
        message(on ? (files.length > 1 ? `${files.length} favoris ajoutés` : 'Ajoutée aux favoris') : 'Retirée des favoris');
        render();
    }

    async function addToAlbum(id, files) {
        data = await api.addToAlbum(id, files);
        renderAlbums();
        message(`${count(files.length, 'élément')} ajouté${files.length > 1 ? 's' : ''} à « ${album(id)?.nom} »`);
        selection.clear();
        render();
    }

    async function removeFromAlbum(id, files) {
        data = await api.removeFromAlbum(id, files);
        renderAlbums();
        selection.clear();
        render();
    }

    async function trash(files) {
        const ok = await confirmDialog(files.length > 1 ? `Mettre ${files.length} éléments à la corbeille ?` : 'Mettre à la corbeille ?',
            'Tu pourras les récupérer depuis la corbeille du dock.', 'Mettre à la corbeille');
        if (!ok) return false;
        library = await api.trash(files);
        selection.clear();
        render();
        renderAlbums();
        message(files.length > 1 ? `${files.length} éléments mis à la corbeille` : 'Mise à la corbeille');
        return true;
    }

    async function newAlbum() {
        const name = await promptDialog('Nouvel album', 'Nom de l\'album', '');
        if (!name) return null;
        const created = await api.createAlbum(name);
        data = await api.data();
        renderAlbums();
        return created;
    }

    // ---- Albums dans la barre latérale ----
    function renderAlbums() {
        const box = $('#albums');
        box.innerHTML = data.albums.length
            ? data.albums.map(a => `<button data-album="${a.id}" data-icon="album" class="${view.type === 'album' && view.id === a.id ? 'actif' : ''}">${escape(a.nom)}</button>`).join('')
            : '<p class="vide">Aucun album</p>';
        window.icons.fill(box);
        box.querySelectorAll('[data-album]').forEach(button => {
            button.addEventListener('click', () => show('album', button.dataset.album));
            button.addEventListener('dragover', event => { event.preventDefault(); button.classList.add('cible'); });
            button.addEventListener('dragleave', () => button.classList.remove('cible'));
            button.addEventListener('drop', event => {
                event.preventDefault();
                button.classList.remove('cible');
                try { addToAlbum(button.dataset.album, JSON.parse(event.dataTransfer.getData('application/x-robbie-photos'))); } catch {}
            });
            button.addEventListener('contextmenu', event => {
                event.preventDefault();
                const id = button.dataset.album;
                openMenu(event.clientX, event.clientY, [
                    { label: 'Renommer…', icon: 'edit', run: async () => {
                        const name = await promptDialog('Renommer l\'album', 'Nom de l\'album', album(id).nom);
                        if (name) { data = await api.renameAlbum(id, name); renderAlbums(); render(); }
                    } },
                    { label: 'Supprimer l\'album', icon: 'trash', danger: true, run: async () => {
                        if (!await confirmDialog(`Supprimer « ${album(id).nom} » ?`, 'Les photos restent dans la photothèque.', 'Supprimer')) return;
                        data = await api.deleteAlbum(id);
                        renderAlbums();
                        if (view.id === id) show('bibliotheque');
                    } }
                ]);
            });
        });
    }

    // ---- Menus, dialogues, messages ----
    const menu = $('#menu');

    function openMenu(x, y, entries, above = false) {
        menu.innerHTML = entries.filter(Boolean).map((entry, i) => entry === '-' ? '<hr>'
            : entry.title ? `<div class="sous-titre">${escape(entry.title)}</div>`
            : `<button data-m="${i}" data-icon="${entry.icon || 'sparkles'}" class="${entry.danger ? 'danger' : ''}">${escape(entry.label)}</button>`).join('');
        window.icons.fill(menu);
        const items = entries.filter(Boolean);
        menu.querySelectorAll('[data-m]').forEach(button => button.addEventListener('click', () => {
            closeMenu();
            items[Number(button.dataset.m)].run();
        }));
        menu.hidden = false;
        const box = menu.getBoundingClientRect();
        menu.style.left = `${Math.min(x, innerWidth - box.width - 8)}px`;
        menu.style.top = `${Math.max(8, Math.min(above ? y - box.height : y, innerHeight - box.height - 8))}px`;
    }

    const closeMenu = () => { menu.hidden = true; };
    document.addEventListener('mousedown', event => { if (!menu.contains(event.target)) closeMenu(); });

    const dialogBox = $('#dialogue');
    function dialog(html, setup) {
        return new Promise(resolve => {
            dialogBox.innerHTML = `<form class="dialogue">${html}</form>`;
            dialogBox.hidden = false;
            const form = dialogBox.querySelector('form');
            const done = value => { dialogBox.hidden = true; resolve(value); };
            form.querySelector('[data-annuler]').addEventListener('click', () => done(null));
            form.addEventListener('submit', event => { event.preventDefault(); done(setup(form)); });
            form.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); done(null); } });
            (form.querySelector('input') || form.querySelector('[type=submit]')).focus();
        });
    }

    const promptDialog = (title, placeholder, value) => dialog(`
        <h4>${escape(title.toUpperCase())}</h4>
        <input maxlength="60" placeholder="${escape(placeholder)}" value="${escape(value)}">
        <div class="ligne"><button type="button" class="bouton" data-annuler>Annuler</button><button type="submit" class="bouton principal">OK</button></div>`,
        form => form.querySelector('input').value.trim() || null);

    const confirmDialog = (title, text, label) => dialog(`
        <h4>${escape(title.toUpperCase())}</h4><p>${escape(text)}</p>
        <div class="ligne"><button type="button" class="bouton" data-annuler>Annuler</button><button type="submit" class="bouton danger">${escape(label)}</button></div>`,
        () => true);

    let messageTimer = null;
    function message(text) {
        const box = $('#message');
        box.textContent = text;
        box.hidden = false;
        clearTimeout(messageTimer);
        messageTimer = setTimeout(() => { box.hidden = true; }, 2600);
    }

    // ---- Barre latérale, échelles, zoom, importer, diaporama ----
    document.querySelectorAll('.vues button').forEach(button => button.addEventListener('click', () => show(button.dataset.vue)));
    $('#nouvel-album').addEventListener('click', newAlbum);

    document.querySelectorAll('#echelles button').forEach(button => button.addEventListener('click', () => {
        scale = button.dataset.echelle;
        render();
        zone.scrollTop = 0;
    }));

    const setZoom = size => {
        size = Math.max(90, Math.min(320, size));
        $('#zoom').value = size;
        document.documentElement.style.setProperty('--vignette', `${size}px`);
    };
    $('#zoom').addEventListener('input', event => setZoom(Number(event.target.value)));
    zone.addEventListener('wheel', event => {
        if (!event.ctrlKey) return;
        event.preventDefault();
        setZoom(Number($('#zoom').value) - Math.sign(event.deltaY) * 20);
    }, { passive: false });

    $('#importer').addEventListener('click', event => {
        const box = event.currentTarget.getBoundingClientRect();
        openMenu(box.left, box.top - 8, [
            { label: 'Des photos…', icon: 'image', run: () => importPhotos(false) },
            { label: 'Un dossier entier…', icon: 'folder-open', run: () => importPhotos(true) }
        ], true);
    });

    async function importPhotos(folders) {
        const result = await api.importPhotos(folders);
        if (!result) return;
        library = await api.library();
        message(result.count ? `${count(result.count, 'élément')} importé${result.count > 1 ? 's' : ''}` : 'Aucune photo trouvée');
        show('recentes');
    }

    $('#diaporama').addEventListener('click', () => window.diaporama.start(list, 0));

    // Échap : on quitte la sélection
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && selection.size && $('#visionneuse').hidden) {
            selection.clear();
            refreshSelection();
        }
        if ((event.ctrlKey || event.metaKey) && event.key === 'a' && $('#visionneuse').hidden && dialogBox.hidden) {
            event.preventDefault();
            list.forEach(p => selection.add(p.path));
            refreshSelection();
        }
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
    }
    api.theme().then(applyTheme);
    api.onTheme(applyTheme);
    setInterval(() => applyTheme(), 60 * 1000);

    // ---- Démarrage ----
    let ready = null;
    async function load() {
        [library, data] = await Promise.all([api.library(), api.data()]);
        renderAlbums();
        show(view.type, view.id);
    }
    ready = load();

    api.onLibrary(async newLibrary => {
        library = newLibrary;
        data = await api.data();
        render();
    });

    // Image ouverte depuis l'explorateur : directement dans la visionneuse
    api.onOpen(async file => {
        await ready;
        const i = library.findIndex(p => p.path === file);
        if (i >= 0) window.visionneuse.open(library, i);
        else window.visionneuse.open([{ path: file, name: file.split('/').pop(), kind: /\.(mp4|webm|m4v|mov|ogv)$/i.test(file) ? 'video' : 'photo', date: Date.now(), size: 0, horsBibliotheque: true }], 0);
    });

    // Partagé avec la visionneuse et la retouche
    window.app = {
        fileUrl, editStyle, applyEdits, fitRotation, FILTERS, message, confirmDialog, trash,
        isFavorite, setFavorite, dayFormat, capital,
        data: () => data,
        setData: newData => { data = newData; render(); },
        refresh: render
    };
})();
