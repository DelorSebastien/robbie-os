// Widgets de droite : état du système, musique en cours, notes rapides
(() => {
    const { $, escape, bytes, duration } = window.ui;

    // ---- Système ----
    const CIRCUMFERENCE = 2 * Math.PI * 27;
    const history = [];

    function gauge(id, percent, label) {
        const el = $(id);
        const value = el.querySelector('.value');
        value.style.strokeDasharray = CIRCUMFERENCE;
        value.style.strokeDashoffset = percent == null ? CIRCUMFERENCE : CIRCUMFERENCE * (1 - Math.min(100, percent) / 100);
        el.querySelector('b').textContent = label;
        el.classList.toggle('hot', percent >= 85);
    }

    function sparkline() {
        const points = history.map((v, i) => [i * (300 / 59), 42 - (v / 100) * 38]);
        if (points.length < 2) return;
        const line = points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
        $('#sparkline .line').setAttribute('d', line);
        $('#sparkline .area').setAttribute('d', `${line} L${points.at(-1)[0].toFixed(1)} 44 L0 44 Z`);
    }

    function uptime(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        return h ? `allumé depuis ${h} h ${m} min` : `allumé depuis ${m} min`;
    }

    async function refreshSystem() {
        const s = await window.os.system();
        const ram = s.memory.used / s.memory.total * 100;
        const disk = s.disk.total ? s.disk.used / s.disk.total * 100 : 0;

        gauge('#g-cpu', s.cpu, `${s.cpu}%`);
        gauge('#g-ram', ram, `${Math.round(ram)}%`);
        gauge('#g-disk', disk, `${Math.round(disk)}%`);
        // Sans capteur (machine virtuelle), la jauge reste vide
        gauge('#g-temp', s.temperature == null ? null : s.temperature, s.temperature == null ? '—' : `${s.temperature}°`);

        history.push(s.cpu);
        if (history.length > 60) history.shift();
        sparkline();

        $('#net-down').textContent = `${bytes(s.network.down)}/s`;
        $('#net-up').textContent = `${bytes(s.network.up)}/s`;
        $('#sys-mem').textContent = `${bytes(s.memory.used)} / ${bytes(s.memory.total)}`;
        $('#sys-uptime').textContent = uptime(s.uptime);
    }

    refreshSystem();
    setInterval(refreshSystem, 2000);

    // ---- Musique ----
    let track = null;

    function renderMusic() {
        const card = $('#musique');
        card.classList.toggle('empty', !track);
        card.classList.toggle('playing', Boolean(track?.playing));

        $('#music-title').textContent = track ? track.title : 'Rien en lecture';
        $('#music-artist').textContent = track ? [track.artist, track.album].filter(Boolean).join(' · ') : 'Lance de la musique, je l\'afficherai ici';
        $('#music-player').textContent = track?.player || '';
        $('#music-bar').style.width = track?.length ? `${Math.min(100, track.position / track.length * 100)}%` : '0%';
        $('#music-bar').dataset.time = track?.length ? `${duration(track.position)} / ${duration(track.length)}` : '';

        const cover = $('#music-cover');
        cover.style.backgroundImage = track?.art ? `url("${track.art}")` : '';
        cover.classList.toggle('has-art', Boolean(track?.art));

        const toggle = $('#music-toggle');
        toggle.dataset.icon = track?.playing ? 'pause' : 'play';
        toggle.title = track?.playing ? 'Pause' : 'Lecture';
        window.icons.fill(card);
    }

    async function refreshMusic() {
        track = await window.os.music();
        renderMusic();
    }

    document.querySelectorAll('[data-music]').forEach(button => {
        button.addEventListener('click', async () => {
            track = await window.os.musicCommand(button.dataset.music);
            renderMusic();
        });
    });

    refreshMusic();
    setInterval(refreshMusic, 1500);

    // ---- Notes rapides ----
    let notes = [];

    function renderNotes() {
        const list = $('#note-list');
        list.innerHTML = notes.map((note, index) => `
            <li class="${note.done ? 'done' : ''}" data-index="${index}">
                <button class="check" data-act="toggle" title="Fait">${note.done ? window.icons.icon('check') : ''}</button>
                <span>${escape(note.text)}</span>
                <button class="remove" data-act="remove" title="Supprimer">${window.icons.icon('x')}</button>
            </li>`).join('') || '<li class="empty">Aucune note pour l\'instant</li>';

        const left = notes.filter(note => !note.done).length;
        $('#notes-count').textContent = notes.length ? `${left} à faire` : '';
    }

    async function saveNotes() {
        renderNotes();
        await window.os.setNotes(notes);
    }

    function addNote(text) {
        const value = text.trim();
        if (!value) return false;
        notes.unshift({ text: value, done: false, created: Date.now() });
        saveNotes();
        return true;
    }

    $('#note-form').addEventListener('submit', event => {
        event.preventDefault();
        if (addNote($('#note-input').value)) $('#note-input').value = '';
    });

    $('#note-list').addEventListener('click', event => {
        const button = event.target.closest('button');
        const item = event.target.closest('li[data-index]');
        if (!button || !item) return;

        const index = Number(item.dataset.index);
        if (button.dataset.act === 'toggle') {
            notes[index].done = !notes[index].done;
            if (notes[index].done) window.face.setExpression('happy', 1200);
        } else {
            notes.splice(index, 1);
        }
        saveNotes();
    });

    window.os.notes().then(list => {
        notes = list;
        renderNotes();
    });

    window.widgets = { addNote };
})();
