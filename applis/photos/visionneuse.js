// Visionneuse : la photo en grand sur son reflet flouté, flèches et clavier pour passer
// de l'une à l'autre, zoom à la molette (déplacement en glissant), informations, favori,
// retouche, corbeille ; et le diaporama, en fondus enchaînés
(() => {
    const api = window.photos;
    const app = window.app;
    const $ = selector => document.querySelector(selector);
    const viewer = $('#visionneuse');
    const scene = $('#vis-scene');
    const panel = $('#vis-panneau');

    let items = [];
    let index = 0;
    let zoom = { scale: 1, x: 0, y: 0 };

    const timeFormat = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const size = bytes => bytes > 1e6 ? `${(bytes / 1e6).toFixed(1).replace('.', ',')} Mo` : `${Math.round(bytes / 1e3)} ko`;
    const current = () => items[index];

    function open(list, i) {
        items = list;
        index = i;
        viewer.hidden = false;
        show();
    }

    function close() {
        viewer.hidden = true;
        scene.innerHTML = '';
        panel.hidden = true;
        $('#vis-infos').classList.remove('allume');
        app.refresh();
        // (dans l'explorateur : il revient au dossier d'où la photo a été ouverte)
        if (window.parent !== window) window.parent.postMessage({ type: 'visionneuse-fermee' }, '*');
    }

    function show() {
        const item = current();
        if (!item) return close();
        zoom = { scale: 1, x: 0, y: 0 };
        scene.classList.remove('zoome');

        const url = app.fileUrl(item.path);
        if (item.kind === 'video') {
            scene.innerHTML = `<video src="${url}" controls autoplay></video>`;
            $('#vis-fond').removeAttribute('src');
        } else {
            scene.innerHTML = `<img src="${url}" alt="" draggable="false">`;
            const img = scene.querySelector('img');
            app.applyEdits(img, item.path);
            app.fitRotation(img, app.data().retouches[item.path]?.rotation, `${scene.clientWidth}px`, `${scene.clientHeight}px`);
            // (la taille en pixels, pour les photos sans EXIF)
            img.addEventListener('load', () => {
                if (!item.dimensions) item.dimensions = `${img.naturalWidth} × ${img.naturalHeight}`;
                if (!panel.hidden) renderInfos();
            }, { once: true });
            $('#vis-fond').src = url;
        }

        $('#vis-date').textContent = item.horsBibliotheque ? item.name : `${app.capital(app.dayFormat.format(item.date))} · ${timeFormat.format(item.date)}`;
        $('#vis-nom').textContent = item.horsBibliotheque ? '' : item.name;
        $('#vis-favori').classList.toggle('actif', app.isFavorite(item.path));
        for (const id of ['#vis-favori', '#vis-retoucher', '#vis-corbeille', '#vis-dossier']) $(id).hidden = Boolean(item.horsBibliotheque);
        $('#vis-retoucher').hidden ||= item.kind === 'video';
        $('#vis-precedente').hidden = index === 0;
        $('#vis-suivante').hidden = index >= items.length - 1;
        if (!panel.hidden) renderInfos();

        // (la suivante est préparée à l'avance : elle s'affiche tout de suite)
        const next = items[index + 1];
        if (next?.kind === 'photo') new Image().src = app.fileUrl(next.path);
    }

    const go = step => {
        const target = index + step;
        if (target < 0 || target >= items.length) return;
        index = target;
        show();
    };

    function renderInfos() {
        const item = current();
        const rows = [
            ['Nom', item.name],
            !item.horsBibliotheque && ['Date', `${app.capital(app.dayFormat.format(item.date))}, ${timeFormat.format(item.date)}`],
            item.dimensions && ['Taille', item.dimensions],
            item.size && ['Poids', size(item.size)],
            item.camera && ['Appareil', item.camera],
            item.reglages && ['Réglages', item.reglages],
            ['Dossier', item.path.slice(0, item.path.lastIndexOf('/')).replace(/^\/home\/[^/]+/, '~')]
        ].filter(Boolean);
        panel.innerHTML = `<h4>INFORMATIONS</h4><dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${String(v).replace(/</g, '&lt;')}</dd>`).join('')}</dl>`;
    }

    // ---- Zoom à la molette, autour du pointeur ; déplacement en glissant ----
    function applyZoom() {
        const img = scene.querySelector('img');
        if (!img) return;
        const rotation = img.style.transform.match(/rotate\([^)]*\)/)?.[0] || '';
        img.style.transform = `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale}) ${rotation}`;
        scene.classList.toggle('zoome', zoom.scale > 1);
    }

    scene.addEventListener('wheel', event => {
        if (!scene.querySelector('img')) return;
        event.preventDefault();
        const box = scene.getBoundingClientRect();
        const px = event.clientX - box.left - box.width / 2;
        const py = event.clientY - box.top - box.height / 2;
        const scale = Math.max(1, Math.min(8, zoom.scale * (event.deltaY < 0 ? 1.18 : 1 / 1.18)));
        const ratio = scale / zoom.scale;
        zoom = scale === 1 ? { scale: 1, x: 0, y: 0 } : { scale, x: px - (px - zoom.x) * ratio, y: py - (py - zoom.y) * ratio };
        applyZoom();
    }, { passive: false });

    scene.addEventListener('dblclick', event => {
        if (zoom.scale > 1) zoom = { scale: 1, x: 0, y: 0 };
        else {
            const box = scene.getBoundingClientRect();
            zoom = { scale: 2.5, x: -(event.clientX - box.left - box.width / 2) * 1.5, y: -(event.clientY - box.top - box.height / 2) * 1.5 };
        }
        applyZoom();
    });

    let drag = null;
    scene.addEventListener('mousedown', event => {
        if (zoom.scale <= 1) return;
        drag = { x: event.clientX - zoom.x, y: event.clientY - zoom.y };
    });
    window.addEventListener('mousemove', event => {
        if (!drag) return;
        zoom.x = event.clientX - drag.x;
        zoom.y = event.clientY - drag.y;
        applyZoom();
    });
    window.addEventListener('mouseup', () => { drag = null; });

    // ---- Boutons et clavier ----
    $('#vis-fermer').addEventListener('click', close);
    $('#vis-precedente').addEventListener('click', () => go(-1));
    $('#vis-suivante').addEventListener('click', () => go(1));

    async function toggleFavorite() {
        const item = current();
        if (item.horsBibliotheque) return;
        await app.setFavorite([item.path], !app.isFavorite(item.path));
        $('#vis-favori').classList.toggle('actif', app.isFavorite(item.path));
    }

    function toggleInfos() {
        panel.hidden = !panel.hidden;
        $('#vis-infos').classList.toggle('allume', !panel.hidden);
        if (!panel.hidden) renderInfos();
    }

    async function trashCurrent() {
        const item = current();
        if (item.horsBibliotheque || !await app.trash([item.path])) return;
        items = items.filter(p => p.path !== item.path);
        if (index >= items.length) index = items.length - 1;
        show();
    }

    $('#vis-favori').addEventListener('click', toggleFavorite);
    $('#vis-infos').addEventListener('click', toggleInfos);
    $('#vis-retoucher').addEventListener('click', () => window.retouche.open(current(), show));
    $('#vis-diaporama').addEventListener('click', () => window.diaporama.start(items, index));
    $('#vis-dossier').addEventListener('click', () => api.showInFolder(current().path));
    $('#vis-corbeille').addEventListener('click', trashCurrent);

    document.addEventListener('keydown', event => {
        if (viewer.hidden || !$('#retouche').hidden || !$('#diapo').hidden || !$('#dialogue').hidden) return;
        const keys = {
            Escape: close, ArrowLeft: () => go(-1), ArrowRight: () => go(1),
            f: toggleFavorite, i: toggleInfos, Delete: trashCurrent,
            e: () => current().kind === 'photo' && !current().horsBibliotheque && window.retouche.open(current(), show)
        };
        const action = keys[event.key];
        if (action) {
            event.preventDefault();
            action();
        }
    });

    window.visionneuse = { open, close, refresh: show };

    // ---- Diaporama : plein écran, une photo toutes les 5 s, fondu enchaîné et léger zoom ----
    const diapo = $('#diapo');
    const layers = [...diapo.querySelectorAll('.diapo-image')];
    let slides = [];
    let slide = 0;
    let front = 0;
    let timer = null;
    let paused = false;

    function start(list, from = 0) {
        slides = list.filter(p => p.kind === 'photo');
        if (!slides.length) return app.message('Pas de photo à montrer');
        slide = Math.max(0, slides.indexOf(list[from]));
        diapo.hidden = false;
        diapo.querySelector('.diapo-aide').style.animation = 'none';
        requestAnimationFrame(() => { diapo.querySelector('.diapo-aide').style.animation = ''; });
        document.documentElement.requestFullscreen?.().catch(() => {});
        paused = false;
        showSlide();
    }

    function showSlide() {
        const item = slides[slide];
        const layer = layers[front];
        const other = layers[1 - front];
        layer.onload = () => {
            layer.classList.add('visible');
            other.classList.remove('visible');
            front = 1 - front;
        };
        layer.src = app.fileUrl(item.path);
        app.applyEdits(layer, item.path);
        // (photo tournée d'un quart de tour : le cadre aussi, pour qu'elle tienne dans l'écran)
        const turned = (app.data().retouches[item.path]?.rotation || 0) % 180 !== 0;
        Object.assign(layer.style, turned
            ? { inset: 'auto', left: '50%', top: '50%', width: '100vh', height: '100vw', marginLeft: '-50vh', marginTop: '-50vw' }
            : { inset: '', left: '', top: '', width: '', height: '', marginLeft: '', marginTop: '' });
        clearTimeout(timer);
        if (!paused) timer = setTimeout(nextSlide, 5000);
    }

    function nextSlide(step = 1) {
        slide = (slide + step + slides.length) % slides.length;
        showSlide();
    }

    function stop() {
        clearTimeout(timer);
        diapo.hidden = true;
        layers.forEach(layer => layer.classList.remove('visible'));
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    }

    diapo.addEventListener('click', stop);
    document.addEventListener('keydown', event => {
        if (diapo.hidden) return;
        event.preventDefault();
        if (event.key === 'Escape') stop();
        else if (event.key === ' ') {
            paused = !paused;
            app.message(paused ? 'Diaporama en pause' : 'Diaporama reparti');
            if (!paused) timer = setTimeout(nextSlide, 2000);
            else clearTimeout(timer);
        } else if (event.key === 'ArrowRight') nextSlide(1);
        else if (event.key === 'ArrowLeft') nextSlide(-1);
    });
    document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && !diapo.hidden) stop(); });

    window.diaporama = { start, stop };
})();
