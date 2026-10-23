// Icônes (traits de 24 × 24) : tout élément avec data-icon="nom" reçoit son icône
(() => {
    const PATHS = {
        home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
        grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
        folder: 'M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z',
        terminal: 'M3 5h18v14H3zM7 10l3 2.5L7 15M12.5 15H17',
        sliders: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4',
        power: 'M12 3v8M6.3 6.8a8 8 0 1 0 11.4 0',
        restart: 'M4 12a8 8 0 1 0 2.3-5.7M4 4v4.5h4.5',
        search: 'M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM16.5 16.5 21 21',
        cpu: 'M7 7h10v10H7zM10 10h4v4h-4zM10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4',
        music: 'M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
        play: 'M8 5.5v13l10.5-6.5z',
        pause: 'M8 5h3v14H8zM13 5h3v14h-3z',
        next: 'M6 5.5v13l9-6.5zM18 5v14',
        previous: 'M18 5.5v13l-9-6.5zM6 5v14',
        note: 'M5 4h14v16H5zM9 9h6M9 13h6M9 17h3',
        plus: 'M12 5v14M5 12h14',
        x: 'M6 6l12 12M18 6 6 18',
        check: 'M5 12.5 10 17l9-10',
        volume: 'M4 9.5h4L13 5v14l-5-4.5H4zM16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11',
        'volume-x': 'M4 9.5h4L13 5v14l-5-4.5H4zM17 9.5l5 5M22 9.5l-5 5',
        moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
        sun: 'M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8 6 18M18 6l1.8-1.8',
        cloud: 'M7 18a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.4 1.6A3.8 3.8 0 0 1 17.5 18z',
        rain: 'M7 15a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.4 1.6A3.8 3.8 0 0 1 17.5 15zM8 18l-1 2.5M12 18l-1 2.5M16 18l-1 2.5',
        snow: 'M7 15a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.4 1.6A3.8 3.8 0 0 1 17.5 15zM8 19h.01M12 20h.01M16 19h.01',
        storm: 'M7 15a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.4 1.6A3.8 3.8 0 0 1 17.5 15zM13 15l-2.5 3.5h3L11 22',
        fog: 'M7 12a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.4 1.6A3.8 3.8 0 0 1 17.5 12zM4 16h16M6 20h12',
        partly: 'M9 4.5a4 4 0 0 1 5.5 2M4.5 9.5H3M6 5.5 5 4.5M9 13a4 4 0 0 1-.4-8M10 20a4 4 0 0 1-.5-8 5.5 5.5 0 0 1 10.4 1.4A3.3 3.3 0 0 1 19.3 20z',
        'arrow-down': 'M12 5v14M6 13l6 6 6-6',
        'arrow-up': 'M12 19V5M6 11l6-6 6 6',
        sparkles: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
        calculator: 'M6 3h12v18H6zM9 7h6M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01',
        bolt: 'M13 3 5 13.5h6L10 21l8-10.5h-6z',
        trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13'
    };

    function icon(name) {
        const d = PATHS[name] || PATHS.sparkles;
        return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
    }

    function fill(root = document) {
        root.querySelectorAll('[data-icon]').forEach(el => {
            if (el.dataset.iconDone === el.dataset.icon) return;
            el.querySelector(':scope > svg.icon')?.remove();
            el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon));
            el.dataset.iconDone = el.dataset.icon;
        });
    }

    window.icons = { icon, fill };
    fill();
})();
