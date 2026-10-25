// Fichiers : navigation (historique, chemin en pastilles, recherche), grille ou liste, sélection
// (clic, Ctrl, Maj, lasso, clavier), menus, copier / couper / coller, glisser-déposer, corbeille,
// clés USB, signets, et Photos dans la même fenêtre (photothèque, albums, galerie d'un dossier,
// visionneuse) grâce au cadre de l'appli Photos
(() => {
    const api = window.fichiers;
    const $ = selector => document.querySelector(selector);
    const escape = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const fileUrl = file => 'file://' + file.split('/').map(encodeURIComponent).join('/');
    const zone = $('#zone');
    const photosFrame = $('#photos');

    // ---- État ----
    let dirs = {};
    let place = null;              // { kind: 'dossier', chemin } | { kind: 'corbeille' } | { kind: 'photos', vue, id }
    const back = [];
    const forward = [];
    let items = [];
    let shown = [];
    const selection = new Set();
    let anchor = -1;
    let mode = 'grille';           // grille, liste, galerie
    let hidden = false;
    let clip = null;               // { op: 'copier' | 'couper', fichiers }
    let sort = { key: 'nom', up: true };
    let photosState = { total: 0, favoris: 0, albums: [] };
    let devices = [];
    let bookmarks = [];
    // (la visionneuse a été ouverte depuis un dossier : on y revient quand elle se ferme)
    let viewerFromFolder = false;

    try {
        mode = localStorage.getItem('fichiers-vue') === 'liste' ? 'liste' : 'grille';
        hidden = localStorage.getItem('fichiers-caches') === '1';
    } catch {}

    const PHOTO_VIEWS = { bibliotheque: 'Photothèque', favoris: 'Favoris', recentes: 'Importées', captures: 'Captures d’écran', videos: 'Vidéos' };

    // ---- Petits outils ----
    const size = bytes => {
        if (bytes == null) return '';
        if (bytes < 1024) return `${bytes} o`;
        const units = ['Ko', 'Mo', 'Go', 'To'];
        let value = bytes / 1024, i = 0;
        while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
        return `${value.toFixed(value < 10 ? 1 : 0).replace('.', ',')} ${units[i]}`;
    };
    const dateFormat = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const date = time => (time ? dateFormat.format(new Date(time)) : '');
    const normalize = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const parentOf = file => file.slice(0, file.lastIndexOf('/')) || '/';
    const nameOf = file => file.slice(file.lastIndexOf('/') + 1) || '/';

    function message(text) {
        const box = $('#message');
        box.textContent = text;
        box.hidden = false;
        clearTimeout(message.timer);
        message.timer = setTimeout(() => { box.hidden = true; }, 3000);
    }

    // Une question avec un champ (renommer…) : renvoie le texte, ou null si annulée
    function ask({ title, text = '', value = '', confirm = 'Valider', select }) {
        return new Promise(resolve => {
            const back_ = $('#dialogue');
            back_.innerHTML = `<form class="dialogue"><h4>${escape(title)}</h4>${text ? `<p>${escape(text)}</p>` : ''}
                <input value="${escape(value)}" spellcheck="false">
                <div class="ligne-boutons"><button type="button" class="bouton" data-annuler>Annuler</button><button type="submit" class="bouton principal">${escape(confirm)}</button></div></form>`;
            back_.hidden = false;
            const form = back_.querySelector('form'), input = form.querySelector('input');
            input.focus();
            if (select) input.setSelectionRange(0, select); else input.select();
            const close = result => { back_.hidden = true; back_.innerHTML = ''; zone.focus(); resolve(result); };
            form.addEventListener('submit', event => { event.preventDefault(); close(input.value); });
            form.querySelector('[data-annuler]').addEventListener('click', () => close(null));
            form.addEventListener('keydown', event => { if (event.key === 'Escape') close(null); });
        });
    }

    // ---- Barre latérale ----
    function entry({ id, label, icon, img, active, drop, extra = '', small = '' }) {
        return `<button class="entree${active ? ' actif' : ''}" data-aller="${escape(id)}"${drop ? ` data-depot="${escape(drop)}"` : ''}>
            ${img ? `<img src="${img}" alt="">` : `<span class="icon" data-icon="${icon}"></span>`}<span>${escape(label)}</span>${small ? `<small>${small}</small>` : ''}${extra}</button>`;
    }

    let placeIcons = {};
    async function loadPlaceIcons() {
        const get = names => api.icon(names);
        placeIcons = {
            ordinateur: await get(['computer', 'drive-harddisk']), maison: await get(['user-home', 'folder']), bureau: await get(['user-desktop', 'folder']),
            corbeille: await get(['user-trash', 'trash-empty']), usb: await get(['drive-removable-media-usb', 'drive-removable-media', 'media-removable'])
        };
    }

    function renderSidebar() {
        const here = place?.kind === 'dossier' ? place.chemin : null;
        const activeId = place?.kind === 'corbeille' ? 'corbeille' : place?.kind === 'photos' ? `photos:${place.vue}:${place.id || ''}` : `d:${here}`;
        const userName = nameOf(dirs.HOME || '');
        let html = '<div class="groupe">EMPLACEMENTS</div>';
        html += entry({ id: 'd:/', label: 'Ordinateur', img: placeIcons.ordinateur, icon: 'ordinateur', active: activeId === 'd:/', drop: '/' });
        html += entry({ id: `d:${dirs.HOME}`, label: userName, img: placeIcons.maison, icon: 'home', active: activeId === `d:${dirs.HOME}`, drop: dirs.HOME });
        if (dirs.DESKTOP && dirs.DESKTOP !== dirs.HOME) html += entry({ id: `d:${dirs.DESKTOP}`, label: 'Bureau', img: placeIcons.bureau, icon: 'bureau', active: activeId === `d:${dirs.DESKTOP}`, drop: dirs.DESKTOP });
        html += entry({ id: 'corbeille', label: 'Corbeille', img: placeIcons.corbeille, icon: 'trash', active: activeId === 'corbeille', drop: 'corbeille' });

        if (bookmarks.length) {
            html += '<div class="groupe">SIGNETS</div>';
            html += bookmarks.map(b => entry({ id: `d:${b.chemin}`, label: b.nom, img: b.icone, icon: 'folder', active: activeId === `d:${b.chemin}`, drop: b.chemin })).join('');
        }

        html += '<div class="groupe">PHOTOS <button class="petit" data-nouvel-album data-icon="plus" title="Nouvel album"></button></div>';
        html += entry({ id: 'photos:bibliotheque:', label: 'Photothèque', icon: 'image', active: activeId === 'photos:bibliotheque:', small: photosState.total || '' });
        html += entry({ id: 'photos:favoris:', label: 'Favoris', icon: 'heart', active: activeId === 'photos:favoris:', small: photosState.favoris || '' });
        html += entry({ id: 'photos:recentes:', label: 'Importées', icon: 'download', active: activeId === 'photos:recentes:' });
        html += entry({ id: 'photos:captures:', label: 'Captures d’écran', icon: 'capture', active: activeId === 'photos:captures:' });
        html += entry({ id: 'photos:videos:', label: 'Vidéos', icon: 'video', active: activeId === 'photos:videos:' });
        html += photosState.albums.map(a => entry({ id: `photos:album:${a.id}`, label: a.nom, icon: 'album', active: activeId === `photos:album:${a.id}`, small: a.nombre || '' })).join('');

        if (devices.length) {
            html += '<div class="groupe">PÉRIPHÉRIQUES</div>';
            html += devices.map(d => entry({
                id: d.monte ? `d:${d.monte}` : `monter:${d.device}`, label: d.nom, img: placeIcons.usb, icon: 'usb',
                active: d.monte && here?.startsWith(d.monte), drop: d.monte || null,
                extra: d.monte ? `<span class="ejecter" data-ejecter="${escape(d.device)}" role="button" title="Éjecter"><span class="icon" data-icon="ejecter"></span></span>` : ''
            })).join('');
        }
        html += '<div class="espace" id="espace"></div>';
        $('#barre').innerHTML = html;
        window.icons.fill($('#barre'));
        updateSpace();
    }

    async function updateSpace() {
        const box = $('#espace');
        if (!box) return;
        const space = await api.diskSpace(place?.kind === 'dossier' ? place.chemin : dirs.HOME);
        if (!space) { box.innerHTML = ''; return; }
        const used = 1 - space.libre / space.total;
        box.innerHTML = `${size(space.libre)} libres sur ${size(space.total)}<div class="jauge"><i style="width:${(used * 100).toFixed(1)}%"></i></div>`;
    }

    // ---- Navigation ----
    function samePlace(a, b) {
        return a && b && a.kind === b.kind && a.chemin === b.chemin && a.vue === b.vue && a.id === b.id;
    }

    // (la galerie vaut pour le dossier où on l'ouvre : ailleurs, on revient aux icônes ou à la liste)
    const usualMode = () => (localStorage.getItem('fichiers-vue') === 'liste' ? 'liste' : 'grille');
    async function go(target, { history = true, gallery = false } = {}) {
        if (history && place && !samePlace(place, target)) { back.push(place); forward.length = 0; }
        if (gallery) mode = 'galerie';
        else if (mode === 'galerie' && !samePlace(place, target)) mode = usualMode();
        place = target;
        selection.clear();
        anchor = -1;
        $('#cherche').value = '';
        await show();
    }

    async function show() {
        const isPhotos = place.kind === 'photos' || (place.kind === 'dossier' && mode === 'galerie');
        photosFrame.hidden = !isPhotos;
        zone.hidden = isPhotos;
        $('#etat').hidden = isPhotos;
        $('#precedent').disabled = !back.length;
        $('#suivant').disabled = !forward.length;
        $('#parent').disabled = place.kind !== 'dossier' || place.chemin === '/';
        document.querySelectorAll('#vues button').forEach(b => {
            b.classList.toggle('actif', b.dataset.vue === mode);
            b.disabled = place.kind !== 'dossier';
        });
        renderPath();
        renderSidebar();
        document.title = place.kind === 'photos' ? `Photos · ${placeName()}` : placeName();

        if (place.kind === 'photos') {
            viewerFromFolder = false;
            photosFrame.contentWindow?.postMessage({ type: 'vue', vue: place.vue, id: place.id }, '*');
            return;
        }
        if (place.kind === 'dossier') {
            api.watch(place.chemin);
            if (mode === 'galerie') {
                viewerFromFolder = false;
                photosFrame.contentWindow?.postMessage({ type: 'dossier', dossier: place.chemin }, '*');
                return;
            }
        }
        await load();
    }

    async function load() {
        const result = place.kind === 'corbeille' ? await api.trashList() : await api.list(place.chemin, hidden);
        if (!result.ok) {
            items = [];
            zone.innerHTML = `<div class="vide"><span class="icon" data-icon="lock"></span><b>Impossible d’ouvrir ce dossier</b><span>${escape(result.erreur)}</span></div>`;
            window.icons.fill(zone);
            $('#etat').textContent = '';
            return;
        }
        items = result.valeur;
        render();
    }

    function placeName() {
        if (place.kind === 'corbeille') return 'Corbeille';
        if (place.kind === 'photos') return place.vue === 'album' ? (photosState.albums.find(a => a.id === place.id)?.nom || 'Album') : PHOTO_VIEWS[place.vue];
        if (place.chemin === '/') return 'Ordinateur';
        if (place.chemin === dirs.HOME) return nameOf(dirs.HOME);
        return nameOf(place.chemin);
    }

    // Le chemin en pastilles : depuis le dossier personnel, ou depuis l'ordinateur
    function renderPath() {
        const box = $('#chemin');
        let parts;
        if (place.kind === 'corbeille') parts = [['Corbeille', null]];
        else if (place.kind === 'photos') parts = [['Photos', 'photos:bibliotheque:'], [placeName(), null]];
        else {
            const file = place.chemin;
            const home = dirs.HOME;
            if (file === home || file.startsWith(home + '/')) {
                parts = [[nameOf(home), `d:${home}`]];
                let current = home;
                for (const piece of file.slice(home.length).split('/').filter(Boolean)) { current += '/' + piece; parts.push([piece, `d:${current}`]); }
            } else {
                parts = [['Ordinateur', 'd:/']];
                let current = '';
                for (const piece of file.split('/').filter(Boolean)) { current += '/' + piece; parts.push([piece, `d:${current}`]); }
            }
        }
        box.innerHTML = parts.map(([label, id], i) => `${i ? '<span class="sep">›</span>' : ''}<button class="${i === parts.length - 1 ? 'dernier' : ''}"${id ? ` data-aller="${escape(id)}" data-depot="${escape(id.startsWith('d:') ? id.slice(2) : '')}"` : ''}>${escape(label)}</button>`).join('');
        box.scrollLeft = box.scrollWidth;
    }

    // Saisir un chemin (Ctrl+L ou double-clic sur le chemin)
    function editPath() {
        if (place.kind !== 'dossier') return;
        const box = $('#chemin');
        box.innerHTML = `<input value="${escape(place.chemin)}" spellcheck="false" aria-label="Chemin">`;
        const input = box.querySelector('input');
        input.focus();
        input.select();
        const done = async ok => {
            if (!ok) return renderPath();
            const target = input.value.trim().replace(/^~(?=\/|$)/, dirs.HOME);
            const kind = await api.exists(target);
            if (kind === 'dossier') go({ kind: 'dossier', chemin: target.replace(/\/+$/, '') || '/' });
            else if (kind === 'fichier') { await go({ kind: 'dossier', chemin: parentOf(target) }); selectByPath([target]); }
            else { message('Ce dossier n’existe pas'); renderPath(); }
        };
        input.addEventListener('keydown', event => {
            if (event.key === 'Enter') done(true);
            if (event.key === 'Escape') done(false);
        });
        input.addEventListener('blur', () => setTimeout(() => box.contains(input) && renderPath(), 100));
    }

    // ---- Affichage du contenu ----
    function sorted(list) {
        const factor = sort.up ? 1 : -1;
        const by = {
            nom: (a, b) => a.nom.localeCompare(b.nom, 'fr', { numeric: true, sensitivity: 'base' }),
            taille: (a, b) => (a.taille ?? -1) - (b.taille ?? -1),
            modifie: (a, b) => a.modifie - b.modifie,
            genre: (a, b) => a.genre.localeCompare(b.genre, 'fr')
        }[sort.key];
        return [...list].sort((a, b) => (b.dossier - a.dossier) || by(a, b) * factor);
    }

    let thumbObserver = null;
    function render() {
        const query = normalize($('#cherche').value.trim());
        shown = sorted(query ? items.filter(item => normalize(item.nom).includes(query)) : items);
        const banner = place.kind === 'corbeille' && items.length
            ? `<div class="bandeau"><span>Les éléments de la corbeille restent récupérables jusqu’à ce que tu la vides.</span><button class="bouton danger" data-vider data-icon="trash">Vider la corbeille</button></div>` : '';

        if (!shown.length) {
            const [icon, title, text] = query ? ['search', 'Rien trouvé', `Aucun élément ne contient « ${$('#cherche').value.trim()} » dans ce dossier.`]
                : place.kind === 'corbeille' ? ['trash', 'La corbeille est vide', 'Les fichiers que tu supprimes arrivent ici.']
                : ['folder-open', 'Dossier vide', 'Glisse des fichiers ici, ou clic droit › Nouveau dossier.'];
            zone.innerHTML = `${banner}<div class="vide"><span class="icon" data-icon="${icon}"></span><b>${escape(title)}</b><span>${escape(text)}</span></div>`;
        } else if (mode === 'liste') {
            const head = (key, label) => `<button data-tri="${key}" class="${sort.key === key ? 'tri' : ''}">${label}</button>`;
            zone.innerHTML = `${banner}<div class="liste-entete">${head('nom', 'NOM')}${head('taille', 'TAILLE')}${head('modifie', place.kind === 'corbeille' ? 'SUPPRIMÉ' : 'MODIFIÉ')}${head('genre', 'TYPE')}</div>` +
                shown.map((item, i) => `<div class="ligne${classes(item)}" data-i="${i}" draggable="true">
                    <span class="nom"><img src="${item.icone || ''}" alt=""><span>${escape(item.nom)}</span></span>
                    <span class="doux">${item.dossier ? '' : size(item.taille)}</span>
                    <span class="doux">${date(item.modifie)}</span>
                    <span class="doux" title="${escape(item.origine || '')}">${place.kind === 'corbeille' && item.origine ? escape(parentOf(item.origine).replace(dirs.HOME, '~')) : escape(item.genre)}</span>
                </div>`).join('');
        } else {
            zone.innerHTML = `${banner}<div class="grille">${shown.map((item, i) => `<div class="element${classes(item)}" data-i="${i}" draggable="true" title="${escape(item.nom)}">
                <span class="visuel"><img src="${item.icone || ''}" alt="" ${item.image ? `data-miniature="${i}"` : ''}>${item.lien ? '<span class="lien" data-icon="external"></span>' : ''}</span>
                <span class="nom">${escape(item.nom)}</span></div>`).join('')}</div>`;
            // Miniatures des images, au fur et à mesure qu'elles apparaissent
            thumbObserver?.disconnect();
            thumbObserver = new IntersectionObserver(entries => entries.forEach(async entry => {
                if (!entry.isIntersecting) return;
                thumbObserver.unobserve(entry.target);
                const item = shown[Number(entry.target.dataset.miniature)];
                const url = item && await api.thumbnail(item.chemin);
                if (url) { entry.target.src = url; entry.target.classList.add('miniature'); }
            }), { root: zone, rootMargin: '200px' });
            zone.querySelectorAll('[data-miniature]').forEach(img => thumbObserver.observe(img));
        }
        window.icons.fill(zone);
        updateStatus();
    }

    function classes(item) {
        return `${selection.has(item.chemin) ? ' choisi' : ''}${clip?.op === 'couper' && clip.fichiers.includes(item.chemin) ? ' coupe' : ''}`;
    }

    function refreshSelection() {
        zone.querySelectorAll('[data-i]').forEach(el => {
            const item = shown[Number(el.dataset.i)];
            el.classList.toggle('choisi', selection.has(item.chemin));
        });
        updateStatus();
    }

    function updateStatus() {
        const chosen = shown.filter(item => selection.has(item.chemin));
        const total = `${shown.length} élément${shown.length > 1 ? 's' : ''}`;
        if (!chosen.length) { $('#etat').textContent = total; return; }
        const bytes = chosen.reduce((sum, item) => sum + (item.taille || 0), 0);
        $('#etat').textContent = `${total} · ${chosen.length} sélectionné${chosen.length > 1 ? 's' : ''}${bytes ? ` (${size(bytes)})` : ''}`;
    }

    const selectedItems = () => shown.filter(item => selection.has(item.chemin));
    function selectByPath(paths) {
        selection.clear();
        paths.forEach(p => selection.add(p));
        refreshSelection();
        const i = shown.findIndex(item => item.chemin === paths[0]);
        if (i >= 0) { anchor = i; zone.querySelector(`[data-i="${i}"]`)?.scrollIntoView({ block: 'nearest' }); }
    }

    // ---- Ouvrir ----
    async function open(item) {
        if (place.kind === 'corbeille') return showProperties(item);
        if (item.dossier) return go({ kind: 'dossier', chemin: item.chemin });
        if (/^(image|video)\//.test(item.type) && !/svg|x-icon|heic/.test(item.type)) {
            // la visionneuse de Photos, dans la fenêtre même
            viewerFromFolder = true;
            photosFrame.hidden = false;
            zone.hidden = true;
            $('#etat').hidden = true;
            photosFrame.contentWindow?.postMessage({ type: 'ouvrir', file: item.chemin }, '*');
            return;
        }
        const result = await api.open(item.chemin);
        if (!result.ok) message(result.erreur);
    }

    // ---- Opérations ----
    const currentDir = () => (place.kind === 'dossier' ? place.chemin : null);

    function copy(cut) {
        const files = selectedItems().map(item => item.chemin);
        if (!files.length || place.kind !== 'dossier') return;
        clip = { op: cut ? 'couper' : 'copier', fichiers: files };
        render();
        message(`${files.length} élément${files.length > 1 ? 's' : ''} ${cut ? 'coupé' : 'copié'}${files.length > 1 ? 's' : ''}`);
    }

    async function paste(target = currentDir()) {
        if (!clip || !target) return;
        const move = clip.op === 'couper';
        const result = await transfer(clip.fichiers, target, move);
        if (result && move) clip = null;
    }

    // Copier ou déplacer, avec la progression en bas à droite
    async function transfer(files, target, move) {
        const result = await api.transfer(files, target, move);
        $('#transferts').hidden = true;
        if (!result.ok) { message(result.erreur); return null; }
        if (currentDir() === target) { await load(); selectByPath(result.valeur); }
        else if (place.kind === 'dossier') await load();
        message(`${result.valeur.length} élément${result.valeur.length > 1 ? 's' : ''} ${move ? 'déplacé' : 'copié'}${result.valeur.length > 1 ? 's' : ''}`);
        return result.valeur;
    }

    api.onProgress(({ fait, total, nom, deplacer, fini }) => {
        const box = $('#transferts');
        if (fini || !total) { box.hidden = true; return; }
        box.hidden = false;
        box.innerHTML = `${deplacer ? 'Déplacement' : 'Copie'} · ${Math.round(fait / total * 100)} %<br><small>${escape(nom)} · ${size(fait)} sur ${size(total)}</small><div class="jauge"><i style="width:${(fait / total * 100).toFixed(1)}%"></i></div>`;
    });

    async function toTrash(list = selectedItems()) {
        if (!list.length) return;
        const result = await api.trash(list.map(item => item.chemin));
        if (!result.ok) return message(result.erreur);
        message(list.length > 1 ? `${list.length} éléments mis à la corbeille` : `« ${list[0].nom} » mis à la corbeille`);
        await load();
    }

    async function deleteForever(list = selectedItems()) {
        if (!list.length) return;
        const ok = await api.confirm(list.length > 1 ? `Supprimer définitivement ${list.length} éléments ?` : `Supprimer définitivement « ${list[0].nom} » ?`, 'Ils ne pourront plus être récupérés.', 'Supprimer');
        if (!ok) return;
        const result = await api.deleteForever(list.map(item => item.chemin));
        if (!result.ok) message(result.erreur);
        await load();
    }

    async function rename(item) {
        const dot = item.dossier ? -1 : item.nom.lastIndexOf('.');
        const name = await ask({ title: 'RENOMMER', value: item.nom, confirm: 'Renommer', select: dot > 0 ? dot : item.nom.length });
        if (name === null || name === item.nom) return;
        const result = await api.rename(item.chemin, name);
        if (!result.ok) return message(result.erreur);
        await load();
        selectByPath([result.valeur]);
    }

    async function newFolder() {
        const dir = currentDir();
        if (!dir) return;
        const result = await api.newFolder(dir);
        if (!result.ok) return message(result.erreur);
        await load();
        selectByPath([result.valeur]);
        const item = shown.find(i => i.chemin === result.valeur);
        if (item) rename(item);
    }

    async function showProperties(item) {
        const result = await api.properties(item.chemin);
        if (!result.ok) return message(result.erreur);
        const p = result.valeur;
        const back_ = $('#dialogue');
        back_.innerHTML = `<div class="dialogue"><div class="tete"><img src="${p.icone || item.icone || ''}" alt=""><b>${escape(p.nom)}</b></div>
            <dl><dt>Type</dt><dd>${escape(p.genre)}</dd>
            <dt>Taille</dt><dd>${size(p.taille)}${p.elements != null ? ` · ${p.elements} élément${p.elements > 1 ? 's' : ''}` : ''}</dd>
            <dt>Emplacement</dt><dd>${escape(item.origine ? parentOf(item.origine) : parentOf(p.chemin))}</dd>
            <dt>Modifié</dt><dd>${date(p.modifie)}</dd>
            ${p.cree ? `<dt>Créé</dt><dd>${date(p.cree)}</dd>` : ''}</dl>
            <div class="ligne-boutons"><button class="bouton principal" data-fermer>Fermer</button></div></div>`;
        back_.hidden = false;
        back_.querySelector('[data-fermer]').addEventListener('click', () => { back_.hidden = true; zone.focus(); });
    }

    // ---- Menus ----
    function openMenu(x, y, entries) {
        const menu = $('#menu');
        menu.innerHTML = entries.filter(Boolean).map((e, i) => e === '-' ? '<hr>'
            : `<button data-m="${i}" class="${e.danger ? 'danger' : ''}" ${e.disabled ? 'disabled' : ''}><span class="icon" data-icon="${e.icon || 'file'}"></span>${escape(e.label)}${e.keys ? `<kbd>${e.keys}</kbd>` : ''}</button>`).join('');
        window.icons.fill(menu);
        menu.hidden = false;
        const list = entries.filter(Boolean);
        menu.querySelectorAll('[data-m]').forEach(button => button.addEventListener('click', () => {
            menu.hidden = true;
            list[Number(button.dataset.m)].run();
        }));
        const { innerWidth: w, innerHeight: h } = window;
        menu.style.left = `${Math.min(x, w - menu.offsetWidth - 8)}px`;
        menu.style.top = `${Math.min(y, h - menu.offsetHeight - 8)}px`;
    }
    document.addEventListener('mousedown', event => {
        if (!$('#menu').hidden && !$('#menu').contains(event.target)) $('#menu').hidden = true;
    });

    function itemMenu(x, y) {
        const list = selectedItems();
        const one = list.length === 1 ? list[0] : null;
        if (place.kind === 'corbeille') {
            return openMenu(x, y, [
                { label: 'Restaurer', icon: 'restaurer', run: async () => { const r = await api.restore(list.map(i => i.chemin)); if (!r.ok) message(r.erreur); else message('Restauré à son emplacement d’origine'); load(); } },
                one && { label: 'Propriétés', icon: 'info', run: () => showProperties(one) },
                '-',
                { label: 'Supprimer définitivement', icon: 'trash', danger: true, keys: 'Suppr', run: () => deleteForever(list) }
            ]);
        }
        const folder = one?.dossier;
        const image = one && /^image\/(jpeg|png|webp|avif)/.test(one.type);
        openMenu(x, y, [
            { label: 'Ouvrir', icon: folder ? 'folder-open' : 'external', keys: 'Entrée', run: () => list.forEach(open) },
            folder && { label: 'Voir les photos du dossier', icon: 'image', run: () => go({ kind: 'dossier', chemin: one.chemin }, { gallery: true }) },
            image && { label: 'Définir comme fond d’écran', icon: 'image', run: () => { api.setWallpaper(one.chemin); message('Nouveau fond d’écran'); } },
            '-',
            { label: 'Couper', icon: 'couper', keys: 'Ctrl+X', run: () => copy(true) },
            { label: 'Copier', icon: 'copier', keys: 'Ctrl+C', run: () => copy(false) },
            folder && clip && { label: 'Coller dans ce dossier', icon: 'coller', run: () => paste(one.chemin) },
            '-',
            one && { label: 'Renommer…', icon: 'edit', keys: 'F2', run: () => rename(one) },
            { label: 'Mettre à la corbeille', icon: 'trash', danger: true, keys: 'Suppr', run: () => toTrash(list) },
            '-',
            folder && !bookmarks.some(b => b.chemin === one.chemin) && { label: 'Ajouter aux signets', icon: 'signet', run: async () => { await api.addBookmark(one.chemin); bookmarks = await api.bookmarks(); renderSidebar(); } },
            one && { label: 'Copier le chemin', icon: 'clipboard', run: () => { api.copyText(one.chemin); message('Chemin copié'); } },
            one && { label: 'Propriétés', icon: 'info', run: () => showProperties(one) }
        ]);
    }

    function backgroundMenu(x, y) {
        if (place.kind === 'corbeille') {
            return openMenu(x, y, [{ label: 'Vider la corbeille', icon: 'trash', danger: true, disabled: !items.length, run: emptyTrash }]);
        }
        openMenu(x, y, [
            { label: 'Nouveau dossier', icon: 'folder', keys: 'Ctrl+Maj+N', run: newFolder },
            { label: 'Coller', icon: 'coller', keys: 'Ctrl+V', disabled: !clip, run: () => paste() },
            '-',
            { label: 'Sélectionner tout', icon: 'select', keys: 'Ctrl+A', run: selectAll },
            { label: hidden ? 'Masquer les fichiers cachés' : 'Afficher les fichiers cachés', icon: 'focus', keys: 'Ctrl+H', run: toggleHidden },
            '-',
            { label: 'Voir les photos du dossier', icon: 'image', run: () => setMode('galerie') },
            { label: 'Ouvrir un terminal ici', icon: 'terminal', run: () => api.terminal(place.chemin) },
            { label: 'Propriétés du dossier', icon: 'info', run: () => showProperties({ chemin: place.chemin, nom: placeName() }) }
        ]);
    }

    async function emptyTrash() {
        if (!await api.confirm('Vider la corbeille ?', 'Tous ses éléments seront supprimés définitivement.', 'Vider')) return;
        const result = await api.emptyTrash();
        if (!result.ok) message(result.erreur);
        load();
    }

    function selectAll() {
        shown.forEach(item => selection.add(item.chemin));
        refreshSelection();
    }

    function toggleHidden() {
        hidden = !hidden;
        try { localStorage.setItem('fichiers-caches', hidden ? '1' : '0'); } catch {}
        load();
        message(hidden ? 'Fichiers cachés affichés' : 'Fichiers cachés masqués');
    }

    function setMode(next) {
        mode = next;
        if (next !== 'galerie') try { localStorage.setItem('fichiers-vue', next); } catch {}
        show();
    }

    // ---- Souris : sélection, ouverture, menus, lasso ----
    zone.addEventListener('click', event => {
        if (event.target.closest('[data-vider]')) return emptyTrash();
        const tri = event.target.closest('[data-tri]');
        if (tri) {
            sort = { key: tri.dataset.tri, up: sort.key === tri.dataset.tri ? !sort.up : true };
            return render();
        }
        const el = event.target.closest('[data-i]');
        if (!el) {
            if (!lassoMoved) { selection.clear(); refreshSelection(); }
            return;
        }
        const i = Number(el.dataset.i);
        const item = shown[i];
        if (event.shiftKey && anchor >= 0) {
            if (!event.ctrlKey) selection.clear();
            const [a, b] = [Math.min(anchor, i), Math.max(anchor, i)];
            for (let k = a; k <= b; k++) selection.add(shown[k].chemin);
        } else if (event.ctrlKey) {
            selection.has(item.chemin) ? selection.delete(item.chemin) : selection.add(item.chemin);
            anchor = i;
        } else {
            selection.clear();
            selection.add(item.chemin);
            anchor = i;
        }
        refreshSelection();
    });

    zone.addEventListener('dblclick', event => {
        const el = event.target.closest('[data-i]');
        if (el) open(shown[Number(el.dataset.i)]);
    });

    zone.addEventListener('contextmenu', event => {
        event.preventDefault();
        const el = event.target.closest('[data-i]');
        if (el) {
            const item = shown[Number(el.dataset.i)];
            if (!selection.has(item.chemin)) { selection.clear(); selection.add(item.chemin); anchor = Number(el.dataset.i); refreshSelection(); }
            itemMenu(event.clientX, event.clientY);
        } else {
            selection.clear();
            refreshSelection();
            backgroundMenu(event.clientX, event.clientY);
        }
    });

    // Lasso : glisser sur le fond pour sélectionner plusieurs éléments
    let lasso = null, lassoMoved = false;
    zone.addEventListener('mousedown', event => {
        lassoMoved = false;
        if (event.button !== 0 || event.target.closest('[data-i], button, .bandeau')) return;
        zone.focus();
        lasso = { x: event.clientX, y: event.clientY, base: event.ctrlKey ? new Set(selection) : new Set() };
    });
    window.addEventListener('mousemove', event => {
        if (!lasso) return;
        const box = $('#cadre');
        const [x1, y1, x2, y2] = [Math.min(lasso.x, event.clientX), Math.min(lasso.y, event.clientY), Math.max(lasso.x, event.clientX), Math.max(lasso.y, event.clientY)];
        if (x2 - x1 < 4 && y2 - y1 < 4) return;
        lassoMoved = true;
        Object.assign(box.style, { left: `${x1}px`, top: `${y1}px`, width: `${x2 - x1}px`, height: `${y2 - y1}px` });
        box.hidden = false;
        selection.clear();
        lasso.base.forEach(p => selection.add(p));
        zone.querySelectorAll('[data-i]').forEach(el => {
            const r = el.getBoundingClientRect();
            if (r.right > x1 && r.left < x2 && r.bottom > y1 && r.top < y2) selection.add(shown[Number(el.dataset.i)].chemin);
        });
        refreshSelection();
    });
    window.addEventListener('mouseup', () => {
        if (!lasso) return;
        lasso = null;
        $('#cadre').hidden = true;
        setTimeout(() => { lassoMoved = false; }, 0);
    });

    // ---- Glisser-déposer ----
    zone.addEventListener('dragstart', event => {
        const el = event.target.closest('[data-i]');
        if (!el || place.kind !== 'dossier') return event.preventDefault();
        const item = shown[Number(el.dataset.i)];
        if (!selection.has(item.chemin)) { selection.clear(); selection.add(item.chemin); refreshSelection(); }
        const files = selectedItems().map(i => i.chemin);
        event.dataTransfer.setData('application/x-robbie-fichiers', JSON.stringify(files));
        // (vers d'autres applis : la liste des fichiers en adresses)
        event.dataTransfer.setData('text/uri-list', files.map(fileUrl).join('\r\n'));
        event.dataTransfer.effectAllowed = 'copyMove';
    });

    // Où l'on dépose : un dossier de la grille, une entrée de la barre, une pastille du chemin, ou le dossier affiché
    function dropTarget(event) {
        const el = event.target.closest('[data-i]');
        if (el) {
            const item = shown[Number(el.dataset.i)];
            if (item?.dossier) return { el, dir: item.chemin };
        }
        const side = event.target.closest('[data-depot]');
        if (side && side.dataset.depot) return { el: side, dir: side.dataset.depot };
        if (zone.contains(event.target) && currentDir()) return { el: null, dir: currentDir() };
        return null;
    }
    let lastTarget = null;
    document.addEventListener('dragover', event => {
        const target = dropTarget(event);
        lastTarget?.classList.remove('cible');
        lastTarget = target?.el || null;
        if (!target) return;
        event.preventDefault();
        lastTarget?.classList.add('cible');
        const internal = event.dataTransfer.types.includes('application/x-robbie-fichiers');
        event.dataTransfer.dropEffect = !internal || event.ctrlKey ? 'copy' : 'move';
    });
    document.addEventListener('dragleave', () => lastTarget?.classList.remove('cible'));
    document.addEventListener('drop', async event => {
        lastTarget?.classList.remove('cible');
        const target = dropTarget(event);
        if (!target) return;
        event.preventDefault();
        const internal = event.dataTransfer.getData('application/x-robbie-fichiers');
        if (target.dir === 'corbeille') {
            if (internal) { const files = JSON.parse(internal); await api.trash(files); load(); message('Mis à la corbeille'); }
            return;
        }
        if (internal) {
            const files = JSON.parse(internal).filter(f => f !== target.dir);
            if (files.length) await transfer(files, target.dir, !event.ctrlKey);
            return;
        }
        // Fichiers venus d'une autre appli : copiés
        const files = [...event.dataTransfer.files].map(f => api.pathOf(f)).filter(Boolean);
        if (files.length) await transfer(files, target.dir, false);
    });

    // ---- Barre latérale et barre d'outils ----
    document.addEventListener('click', async event => {
        const eject = event.target.closest('[data-ejecter]');
        if (eject) {
            event.stopPropagation();
            const dev = devices.find(d => d.device === eject.dataset.ejecter);
            if (place.kind === 'dossier' && dev?.monte && place.chemin.startsWith(dev.monte)) await go({ kind: 'dossier', chemin: dirs.HOME });
            const result = await api.eject(eject.dataset.ejecter);
            message(result.ok ? 'Tu peux retirer la clé en toute sécurité' : result.erreur);
            devices = await api.devices();
            return renderSidebar();
        }
        if (event.target.closest('[data-nouvel-album]')) {
            photosFrame.contentWindow?.postMessage({ type: 'nouvel-album' }, '*');
            return;
        }
        const link = event.target.closest('[data-aller]');
        if (!link) return;
        const id = link.dataset.aller;
        if (id.startsWith('d:')) return go({ kind: 'dossier', chemin: id.slice(2) });
        if (id === 'corbeille') return go({ kind: 'corbeille' });
        if (id.startsWith('photos:')) {
            const [, vue, albumId] = id.split(':');
            return go({ kind: 'photos', vue, id: albumId || undefined });
        }
        if (id.startsWith('monter:')) {
            const result = await api.mount(id.slice(7));
            if (!result.ok) return message(result.erreur);
            devices = await api.devices();
            const mounted = devices.find(d => d.device === id.slice(7))?.monte || result.chemin;
            if (mounted) go({ kind: 'dossier', chemin: mounted });
        }
    });

    $('#chemin').addEventListener('dblclick', event => { if (!event.target.closest('button')) editPath(); });
    $('#precedent').addEventListener('click', () => goBack());
    $('#suivant').addEventListener('click', () => goForward());
    $('#parent').addEventListener('click', () => goUp());
    $('#vues').addEventListener('click', event => {
        const button = event.target.closest('[data-vue]');
        if (button && place.kind === 'dossier') setMode(button.dataset.vue);
    });
    $('#cherche').addEventListener('input', () => {
        if (place.kind === 'dossier' && mode === 'galerie') setMode('grille');
        render();
    });

    function goBack() {
        if (!back.length) return;
        forward.push(place);
        go(back.pop(), { history: false });
    }
    function goForward() {
        if (!forward.length) return;
        back.push(place);
        go(forward.pop(), { history: false });
    }
    async function goUp() {
        if (place.kind !== 'dossier' || place.chemin === '/') return;
        const from = place.chemin;
        await go({ kind: 'dossier', chemin: parentOf(from) });
        selectByPath([from]);
    }

    // ---- Clavier ----
    function columns() {
        if (mode === 'liste') return 1;
        const first = zone.querySelector('[data-i]');
        const grid = zone.querySelector('.grille');
        return first && grid ? Math.max(1, Math.round(grid.clientWidth / first.offsetWidth)) : 1;
    }

    document.addEventListener('keydown', event => {
        if (!$('#dialogue').hidden) return;
        const typing = event.target.matches('input');
        const ctrl = event.ctrlKey;
        const key = event.key;
        if (event.altKey && key === 'ArrowLeft') return goBack();
        if (event.altKey && key === 'ArrowRight') return goForward();
        if (event.altKey && key === 'ArrowUp') return goUp();
        if (ctrl && key.toLowerCase() === 'l') { event.preventDefault(); return editPath(); }
        if (ctrl && key.toLowerCase() === 'f') { event.preventDefault(); return $('#cherche').focus(); }
        if (ctrl && key.toLowerCase() === 'h') { event.preventDefault(); return toggleHidden(); }
        if (typing) {
            if (key === 'Escape') { event.target.value = ''; render(); zone.focus(); }
            return;
        }
        if (place.kind === 'photos' || (place.kind === 'dossier' && mode === 'galerie')) return;
        if (ctrl && event.shiftKey && key.toLowerCase() === 'n') { event.preventDefault(); return newFolder(); }
        if (ctrl && key.toLowerCase() === 'a') { event.preventDefault(); return selectAll(); }
        if (ctrl && key.toLowerCase() === 'c') return copy(false);
        if (ctrl && key.toLowerCase() === 'x') return copy(true);
        if (ctrl && key.toLowerCase() === 'v') return paste();
        if (key === 'Delete') return place.kind === 'corbeille' || event.shiftKey ? deleteForever() : toTrash();
        if (key === 'F2') { const one = selectedItems(); if (one.length === 1) rename(one[0]); return; }
        if (key === 'Backspace') return goBack();
        if (key === 'Enter') { selectedItems().forEach(open); return; }
        if (key === 'Escape') { selection.clear(); refreshSelection(); return; }
        const moves = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns(), ArrowUp: -columns() };
        if (key in moves && shown.length) {
            event.preventDefault();
            const i = Math.max(0, Math.min(shown.length - 1, anchor < 0 ? 0 : anchor + moves[key]));
            if (!event.shiftKey) selection.clear();
            selection.add(shown[i].chemin);
            anchor = i;
            refreshSelection();
            zone.querySelector(`[data-i="${i}"]`)?.scrollIntoView({ block: 'nearest' });
            return;
        }
        // Taper les premières lettres d'un nom : il est sélectionné
        if (key.length === 1 && !ctrl && !event.altKey) {
            typeAhead = (Date.now() - typeAheadAt < 900 ? typeAhead : '') + normalize(key);
            typeAheadAt = Date.now();
            const i = shown.findIndex(item => normalize(item.nom).startsWith(typeAhead));
            if (i >= 0) { selection.clear(); selection.add(shown[i].chemin); anchor = i; refreshSelection(); zone.querySelector(`[data-i="${i}"]`)?.scrollIntoView({ block: 'nearest' }); }
        }
    });
    let typeAhead = '', typeAheadAt = 0;

    // Boutons « précédent » et « suivant » de la souris
    window.addEventListener('mouseup', event => {
        if (event.button === 3) goBack();
        if (event.button === 4) goForward();
    });

    // ---- Photos : son cadre parle à l'explorateur ----
    window.addEventListener('message', event => {
        const data = event.data || {};
        if (data.type === 'photos-etat') {
            const changed = JSON.stringify(data) !== JSON.stringify({ type: 'photos-etat', ...photosState });
            photosState = { total: data.total, favoris: data.favoris, albums: data.albums };
            if (changed) renderSidebar();
        } else if (data.type === 'visionneuse-fermee' && viewerFromFolder) {
            viewerFromFolder = false;
            show();
        }
    });
    // (au premier affichage d'une vue Photos, le cadre n'était peut-être pas encore prêt)
    photosFrame.addEventListener('load', () => {
        if (place?.kind === 'photos') photosFrame.contentWindow.postMessage({ type: 'vue', vue: place.vue, id: place.id }, '*');
        if (place?.kind === 'dossier' && mode === 'galerie') photosFrame.contentWindow.postMessage({ type: 'dossier', dossier: place.chemin }, '*');
    });

    // ---- Changements extérieurs ----
    api.onChange(async () => {
        if (place.kind !== 'dossier' || mode === 'galerie') return;
        const keep = [...selection];
        await load();
        keep.forEach(p => items.some(i => i.chemin === p) && selection.add(p));
        refreshSelection();
    });
    api.onDevices(async () => { devices = await api.devices(); renderSidebar(); });
    api.onGo(async target => {
        if (target === 'corbeille') return go({ kind: 'corbeille' });
        const kind = await api.exists(target);
        if (kind === 'dossier') go({ kind: 'dossier', chemin: target });
        else if (kind === 'fichier') { await go({ kind: 'dossier', chemin: parentOf(target) }); selectByPath([target]); }
    });

    // ---- Thème de Robbie OS (sombre, clair, automatique selon le soleil) ----
    let themeSettings = { theme: 'sombre' };
    function applyTheme(settings = themeSettings) {
        themeSettings = settings;
        let theme = settings.theme;
        if (theme === 'auto') {
            const where = settings.place || { latitude: 44.0556, longitude: 5.0481 };
            const now = new Date();
            const { sunrise, sunset } = window.soleil.sunTimes(now, where.latitude, where.longitude);
            const minutes = now.getHours() * 60 + now.getMinutes();
            theme = minutes >= sunrise && minutes < sunset ? 'clair' : 'sombre';
        }
        document.documentElement.classList.toggle('clair', theme === 'clair');
        const ACCENTS = { cyan: [94, 231, 255], green: [94, 240, 168], pink: [255, 110, 200], gold: [255, 196, 80], purple: [185, 140, 255], white: [225, 240, 255] };
        const rgb = ACCENTS[settings.accent] || ACCENTS.cyan;
        document.documentElement.style.setProperty('--accent', rgb.join(', '));
        document.documentElement.style.setProperty('--accent-texte', theme === 'clair' ? `rgb(${rgb.map(v => Math.round(v * 0.55)).join(', ')})` : `rgb(${rgb.join(', ')})`);
    }
    api.theme().then(applyTheme);
    api.onTheme(applyTheme);
    setInterval(() => applyTheme(), 60 * 1000);

    // ---- Démarrage : le dossier personnel ----
    (async () => {
        [dirs, bookmarks, devices] = await Promise.all([api.userDirs(), api.bookmarks(), api.devices(), loadPlaceIcons()]);
        if (!place) await go({ kind: 'dossier', chemin: dirs.HOME });
        zone.focus();
    })();
})();
