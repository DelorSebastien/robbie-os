// Aujourd'hui : les widgets de la barre latérale réunis dans un panneau — la météo détaillée,
// les prochains rendez-vous de l'agenda, la musique en cours et un minuteur
(() => {
    const { escape, duration, toast } = window.ui;
    const panel = window.panneaux.create('aujourdhui', 'Aujourd\'hui', { onOpen: render });
    const WEATHER_ICONS = { clear: 'sun', partly: 'partly', cloud: 'cloud', fog: 'fog', rain: 'rain', snow: 'snow', storm: 'storm' };

    // ---- Minuteur (continue même panneau fermé) ----
    let timerEnd = 0;
    let timerTick = null;

    function startTimer(minutes) {
        timerEnd = Date.now() + minutes * 60000;
        clearInterval(timerTick);
        timerTick = setInterval(() => {
            if (Date.now() >= timerEnd) {
                clearInterval(timerTick);
                timerEnd = 0;
                toast('Minuteur terminé !', 'bell');
                window.face?.setExpression('surprised', 2500);
            }
            const box = panel.body.querySelector('[data-minuteur-reste]');
            if (box) box.textContent = timerEnd ? duration((timerEnd - Date.now()) / 1000) : '';
            if (!timerEnd && window.panneaux.current() === 'aujourdhui') render();
        }, 1000);
        render();
    }

    // Les rendez-vous d'aujourd'hui et des prochains jours, dans l'ordre
    function upcoming(agenda) {
        const now = new Date();
        const today = now.toISOString().slice(0, 10);
        const time = now.toTimeString().slice(0, 5);
        return Object.entries(agenda)
            .filter(([day]) => day >= today)
            .sort(([a], [b]) => a.localeCompare(b))
            .flatMap(([day, events]) => events.map(event => ({ day, ...event })))
            .filter(event => event.day > today || !event.heure || event.heure >= time)
            .slice(0, 3);
    }

    const dayLabel = day => {
        const date = new Date(`${day}T00:00`);
        const diff = Math.round((date - new Date(new Date().toDateString())) / 86400000);
        if (diff <= 0) return 'Aujourd\'hui';
        if (diff === 1) return 'Demain';
        return date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric' });
    };

    async function render() {
        const [weather, agenda, music] = await Promise.all([
            window.os.weather().catch(() => null), window.os.agenda().catch(() => ({})), window.os.music().catch(() => null)
        ]);
        const events = upcoming(agenda);

        panel.body.innerHTML = `
            <section class="widget widget-meteo">${weather ? `
                <span class="widget-meteo-icone" data-icon="${WEATHER_ICONS[weather.kind] || 'cloud'}"></span>
                <div class="widget-meteo-texte">
                    <b>${weather.temperature}°</b><span>${escape(weather.label)} · ${escape(weather.city)}</span>
                    <small>Ressenti ${weather.feelsLike}° · min ${weather.min}° · max ${weather.max}° · vent ${weather.wind} km/h</small>
                </div>` : '<p class="panneau-vide">Météo indisponible (pas de connexion ?)</p>'}
            </section>

            <section class="widget">
                <h4>À VENIR</h4>${events.length ? `<ul class="widget-agenda">${events.map(event => `
                    <li><span class="agenda-heure">${escape(event.heure || '—')}</span>
                        <span class="liste-texte">${escape(event.texte)}<small>${dayLabel(event.day)}</small></span></li>`).join('')}</ul>`
                    : '<p class="panneau-vide">Rien de prévu. Ajoute un rendez-vous dans l\'agenda.</p>'}
            </section>

            <section class="widget">
                <h4>MUSIQUE</h4>${music ? `
                <div class="widget-musique">
                    <span class="widget-musique-texte"><b>${escape(music.title)}</b><small>${escape(music.artist || music.player || '')}</small></span>
                    <span class="widget-musique-boutons">
                        <button class="petit-bouton" data-musique="previous" data-icon="previous" aria-label="Précédent"></button>
                        <button class="petit-bouton" data-musique="toggle" data-icon="${music.playing ? 'pause' : 'play'}" aria-label="${music.playing ? 'Pause' : 'Lecture'}"></button>
                        <button class="petit-bouton" data-musique="next" data-icon="next" aria-label="Suivant"></button>
                    </span>
                </div>` : '<p class="panneau-vide">Aucune musique en cours.</p>'}
            </section>

            <section class="widget">
                <h4>MINUTEUR</h4>${timerEnd ? `
                <div class="widget-minuteur"><b data-minuteur-reste>${duration((timerEnd - Date.now()) / 1000)}</b>
                    <button class="bouton" data-minuteur-stop>Arrêter</button></div>` : `
                <div class="segments">${[5, 10, 15, 30].map(m => `<button data-minuteur="${m}">${m} min</button>`).join('')}</div>`}
            </section>`;
        window.icons.fill(panel.body);

        panel.body.querySelectorAll('[data-musique]').forEach(button => button.addEventListener('click', async () => {
            await window.os.musicCommand(button.dataset.musique);
            setTimeout(render, 300);
        }));
        panel.body.querySelectorAll('[data-minuteur]').forEach(button => button.addEventListener('click', () => startTimer(Number(button.dataset.minuteur))));
        panel.body.querySelector('[data-minuteur-stop]')?.addEventListener('click', () => {
            clearInterval(timerTick);
            timerEnd = 0;
            render();
        });
    }

    // « minuteur-5 »… (Robbie, raccourcis)
    window.os.onShortcut(name => {
        const match = name.match(/^minuteur-(\d+)$/);
        if (match) startTimer(Number(match[1]));
    });

    window.aujourdhui = { startTimer };
})();
