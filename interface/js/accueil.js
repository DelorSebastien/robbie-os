// Haut du bureau : l'heure, la date, la météo, et une phrase de Robbie selon le moment
(() => {
    const { $ } = window.ui;

    const time = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const date = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    function tick() {
        const now = new Date();
        $('#heure').textContent = time.format(now);
        $('#secondes').textContent = String(now.getSeconds()).padStart(2, '0');
        const text = date.format(now);
        $('#date').textContent = text.charAt(0).toUpperCase() + text.slice(1);
    }

    tick();
    setInterval(tick, 1000);

    // Météo
    let weather = null;

    async function refreshWeather() {
        try {
            weather = await window.os.weather();
            const icon = weather.kind === 'clear' && !weather.isDay ? 'moon' : weather.kind === 'clear' ? 'sun' : weather.kind;
            $('#meteo-icone').dataset.icon = icon;
            window.icons.fill($('#meteo'));
            $('#meteo-temp').textContent = `${weather.temperature}°`;
            $('#meteo-ville').textContent = weather.city;
            $('#meteo-detail').textContent = `${weather.label} · ${weather.min}° / ${weather.max}°`;
        } catch {
            $('#meteo-detail').textContent = 'hors ligne';
        }
        updateLine();
    }

    refreshWeather();
    setInterval(refreshWeather, 15 * 60 * 1000);
    document.addEventListener('settings-changed', refreshWeather);

    $('#meteo').addEventListener('click', () => {
        if (!weather) return;
        window.robbie.say(`À ${weather.city}, il fait ${weather.temperature}° (ressenti ${weather.feelsLike}°). ${weather.label}, vent à ${weather.wind} km/h.`, 'curious', 6000);
    });

    // Phrase du moment (plus tard, c'est le cerveau de Robbie qui l'écrira)
    function line() {
        const h = new Date().getHours();
        const day = new Date().getDay();

        if (weather?.kind === 'rain') return 'Il pleut dehors. Parfait pour avancer sur un projet.';
        if (weather?.kind === 'storm') return 'Orage en vue. Pense à sauvegarder ton travail.';
        if (h < 5) return 'Il est tard… Tu devrais peut-être dormir un peu.';
        if (h < 9) return 'Bonjour ! Un nouveau jour, de nouvelles idées.';
        if (h < 12) return day === 1 ? 'Lundi matin. On commence la semaine en douceur ?' : 'Belle matinée pour créer quelque chose.';
        if (h < 14) return 'Bon appétit ! Une pause fait du bien.';
        if (h < 18) return day === 5 ? 'Vendredi après-midi, le week-end approche.' : 'L\'après-midi file. Je suis là si tu as besoin.';
        if (h < 22) return 'Bonsoir. On termine en beauté ?';
        return 'La nuit est calme. Les meilleures idées arrivent maintenant.';
    }

    function updateLine() {
        $('#robbie-dit').textContent = line();
    }

    updateLine();
    setInterval(updateLine, 10 * 60 * 1000);
})();
