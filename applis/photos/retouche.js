// Retouche : réglages (lumière, contraste, saturation), filtres, rotation et recadrage.
// « Enregistrer » garde les retouches à part (l'original ne change jamais, on peut revenir
// en arrière) ; « Enregistrer une copie » crée un vrai fichier retouché à côté de l'original
(() => {
    const api = window.photos;
    const app = window.app;
    const $ = selector => document.querySelector(selector);
    const editor = $('#retouche');
    const stage = $('#ret-scene');
    const side = $('#ret-reglages');

    let item = null;
    let edits = {};
    let cropping = false;
    let onClose = null;

    const SLIDERS = [['lumiere', 'Luminosité'], ['contraste', 'Contraste'], ['saturation', 'Saturation']];

    function open(photo, callback) {
        item = photo;
        edits = { ...(app.data().retouches[photo.path] || {}) };
        onClose = callback;
        cropping = false;
        editor.hidden = false;
        renderSide();
        renderStage();
    }

    function close() {
        editor.hidden = true;
        stage.innerHTML = '';
        onClose?.();
    }

    // ---- Aperçu (en recadrage : la photo entière, droite, avec le cadre par-dessus) ----
    function renderStage() {
        stage.innerHTML = `<div class="ret-cadre"><img src="${app.fileUrl(item.path)}" alt="" draggable="false"></div>`;
        const img = stage.querySelector('img');
        const style = app.editStyle(edits);
        img.style.filter = style.filter;
        if (!cropping) {
            img.style.transform = style.transform;
            img.style.objectViewBox = style.objectViewBox;
            app.fitRotation(img, edits.rotation, 'calc(100vw - 420px)', 'calc(100vh - 80px)');
        } else {
            img.addEventListener('load', addCropFrame, { once: true });
            if (img.complete) addCropFrame();
        }
    }

    function renderSide() {
        side.innerHTML = `
            <section><h4>AJUSTEMENTS</h4>${SLIDERS.map(([key, label]) => `
                <label class="ret-curseur">${label}<output data-sortie="${key}">${edits[key] || 0}</output>
                    <input type="range" min="-100" max="100" value="${edits[key] || 0}" data-curseur="${key}"></label>`).join('')}
            </section>
            <section><h4>FILTRES</h4><div class="filtres">${Object.entries(app.FILTERS).map(([key, filter]) => `
                <button class="filtre${(edits.filtre || 'aucun') === key ? ' actif' : ''}" data-filtre="${key}">
                    <img src="${app.fileUrl(item.path)}" alt="" style="filter: ${filter.css || 'none'}">${filter.label}</button>`).join('')}
            </div></section>
            <section><h4>ROTATION ET RECADRAGE</h4><div class="ret-ligne">
                <button class="bouton icone" data-tourner="-90" data-icon="restart" title="Tourner à gauche"></button>
                <button class="bouton icone" data-tourner="90" data-icon="rotate" title="Tourner à droite"></button>
                <button class="bouton${cropping ? ' principal' : ''}" data-recadrer data-icon="crop">${cropping ? 'Terminer le recadrage' : 'Recadrer'}</button>
                ${edits.recadrage ? '<button class="bouton" data-sans-recadrage>Sans recadrage</button>' : ''}
            </div></section>
            <div class="ret-bas">
                <button class="bouton principal" data-enregistrer>Enregistrer</button>
                <button class="bouton" data-copie>Enregistrer une copie</button>
                <button class="bouton" data-original>Revenir à l'original</button>
                <button class="bouton" data-annuler>Annuler</button>
            </div>`;
        window.icons.fill(side);

        side.querySelectorAll('[data-curseur]').forEach(input => input.addEventListener('input', () => {
            edits[input.dataset.curseur] = Number(input.value);
            side.querySelector(`[data-sortie="${input.dataset.curseur}"]`).textContent = input.value;
            renderStageStyle();
        }));
        side.querySelectorAll('[data-filtre]').forEach(button => button.addEventListener('click', () => {
            edits.filtre = button.dataset.filtre;
            side.querySelectorAll('[data-filtre]').forEach(b => b.classList.toggle('actif', b === button));
            renderStageStyle();
        }));
        side.querySelectorAll('[data-tourner]').forEach(button => button.addEventListener('click', () => {
            edits.rotation = (((edits.rotation || 0) + Number(button.dataset.tourner)) % 360 + 360) % 360;
            renderStage();
        }));
        side.querySelector('[data-recadrer]').addEventListener('click', () => {
            cropping = !cropping;
            renderSide();
            renderStage();
        });
        side.querySelector('[data-sans-recadrage]')?.addEventListener('click', () => {
            delete edits.recadrage;
            cropping = false;
            renderSide();
            renderStage();
        });
        side.querySelector('[data-enregistrer]').addEventListener('click', save);
        side.querySelector('[data-copie]').addEventListener('click', saveCopy);
        side.querySelector('[data-original]').addEventListener('click', async () => {
            edits = {};
            await save();
        });
        side.querySelector('[data-annuler]').addEventListener('click', close);
    }

    function renderStageStyle() {
        const img = stage.querySelector('img');
        if (img) img.style.filter = app.editStyle(edits).filter;
    }

    // ---- Recadrage : un cadre à déplacer, et à agrandir par ses coins ----
    function addCropFrame() {
        const holder = stage.querySelector('.ret-cadre');
        if (!holder || holder.querySelector('.ret-recadrage')) return;
        const crop = edits.recadrage || { gauche: 0, haut: 0, largeur: 100, hauteur: 100 };
        const frame = document.createElement('div');
        frame.className = 'ret-recadrage';
        frame.innerHTML = '<i data-coin="nw"></i><i data-coin="ne"></i><i data-coin="sw"></i><i data-coin="se"></i>';
        holder.append(frame);
        const place = () => Object.assign(frame.style, { left: `${crop.gauche}%`, top: `${crop.haut}%`, width: `${crop.largeur}%`, height: `${crop.hauteur}%` });
        place();

        frame.addEventListener('mousedown', event => {
            event.preventDefault();
            const box = holder.getBoundingClientRect();
            const corner = event.target.dataset.coin;
            const start = { x: event.clientX, y: event.clientY, ...crop };
            const move = moveEvent => {
                const dx = (moveEvent.clientX - start.x) / box.width * 100;
                const dy = (moveEvent.clientY - start.y) / box.height * 100;
                const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
                if (!corner) {
                    crop.gauche = clamp(start.gauche + dx, 0, 100 - start.largeur);
                    crop.haut = clamp(start.haut + dy, 0, 100 - start.hauteur);
                } else {
                    if (corner.includes('w')) { crop.gauche = clamp(start.gauche + dx, 0, start.gauche + start.largeur - 8); crop.largeur = start.largeur + start.gauche - crop.gauche; }
                    if (corner.includes('e')) crop.largeur = clamp(start.largeur + dx, 8, 100 - start.gauche);
                    if (corner.includes('n')) { crop.haut = clamp(start.haut + dy, 0, start.haut + start.hauteur - 8); crop.hauteur = start.hauteur + start.haut - crop.haut; }
                    if (corner.includes('s')) crop.hauteur = clamp(start.hauteur + dy, 8, 100 - start.haut);
                }
                place();
            };
            const up = () => {
                window.removeEventListener('mousemove', move);
                window.removeEventListener('mouseup', up);
                const whole = crop.gauche < 0.5 && crop.haut < 0.5 && crop.largeur > 99.5 && crop.hauteur > 99.5;
                if (whole) delete edits.recadrage;
                else edits.recadrage = { ...crop };
            };
            window.addEventListener('mousemove', move);
            window.addEventListener('mouseup', up);
        });
    }

    // ---- Enregistrer ----
    async function save() {
        const clean = Object.fromEntries(Object.entries(edits).filter(([key, value]) => value && !(key === 'filtre' && value === 'aucun')));
        app.setData(await api.setEdits(item.path, clean));
        app.message(Object.keys(clean).length ? 'Retouches enregistrées' : 'Photo revenue à l\'original');
        close();
    }

    // Copie : la photo dessinée avec ses retouches, en JPEG, à côté de l'original
    async function saveCopy() {
        const img = new Image();
        img.src = app.fileUrl(item.path);
        await img.decode();
        const crop = edits.recadrage || { gauche: 0, haut: 0, largeur: 100, hauteur: 100 };
        const sx = img.naturalWidth * crop.gauche / 100;
        const sy = img.naturalHeight * crop.haut / 100;
        const sw = img.naturalWidth * crop.largeur / 100;
        const sh = img.naturalHeight * crop.hauteur / 100;
        const rotation = edits.rotation || 0;
        const turned = rotation % 180 !== 0;

        const canvas = document.createElement('canvas');
        canvas.width = Math.round(turned ? sh : sw);
        canvas.height = Math.round(turned ? sw : sh);
        const ctx = canvas.getContext('2d');
        ctx.filter = app.editStyle(edits).filter || 'none';
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(rotation * Math.PI / 180);
        ctx.drawImage(img, sx, sy, sw, sh, -sw / 2, -sh / 2, sw, sh);

        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
        const target = await api.saveCopy(item.path, await blob.arrayBuffer());
        app.message(`Copie enregistrée : ${target.split('/').pop()}`);
        close();
    }

    document.addEventListener('keydown', event => {
        if (editor.hidden || !$('#dialogue').hidden) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            close();
        }
    });

    window.retouche = { open, close };
})();
