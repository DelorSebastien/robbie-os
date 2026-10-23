// Réglages rapides : son, ne pas déranger, costumes et couleur de Robbie, ville de la météo
(() => {
    const { $, escape, toast } = window.ui;

    const COLORS = { cyan: 'Cyan', green: 'Vert', pink: 'Rose', gold: 'Or', purple: 'Violet', white: 'Blanc' };
    const SWATCHES = { cyan: '56, 232, 255', green: '80, 255, 140', pink: '255, 110, 200', gold: '255, 200, 70', purple: '170, 120, 255', white: '225, 240, 255' };

    let settings = null;

    async function change(changes) {
        settings = await window.os.setSettings(changes);
        apply();
        document.dispatchEvent(new CustomEvent('settings-changed', { detail: settings }));
    }

    function apply() {
        window.face.setEyeColor(settings.eyeColor);
        window.face.setSkin(settings.skin);

        $('#couleurs').innerHTML = Object.entries(COLORS).map(([key, label]) => `
            <button class="swatch${key === settings.eyeColor ? ' active' : ''}" data-color="${key}" title="${label}" style="--swatch: ${SWATCHES[key]}"></button>`).join('');

        const dnd = $('#ne-pas-deranger');
        dnd.classList.toggle('on', settings.doNotDisturb);
        dnd.querySelector('small').textContent = settings.doNotDisturb ? 'Activé' : 'Désactivé';
        document.body.classList.toggle('do-not-disturb', settings.doNotDisturb);

        const skin = $('#costume');
        skin.classList.toggle('on', settings.skin === 'auto');
        skin.querySelector('small').textContent = settings.skin === 'auto' ? 'Selon les fêtes' : 'Désactivés';

        $('#ville').placeholder = settings.place.name;
    }

    // Son
    async function refreshVolume(volume) {
        volume = volume || await window.os.volume();
        const available = Boolean(volume);
        $('#volume').disabled = !available;
        $('#volume').value = volume?.level ?? 0;
        $('#volume-valeur').textContent = available ? (volume.muted ? 'muet' : `${volume.level}%`) : '—';
        $('#mute').dataset.icon = volume?.muted || volume?.level === 0 ? 'volume-x' : 'volume';
        window.icons.fill($('#reglages'));
    }

    let volumeTimer = null;
    $('#volume').addEventListener('input', event => {
        $('#volume-valeur').textContent = `${event.target.value}%`;
        clearTimeout(volumeTimer);
        volumeTimer = setTimeout(async () => refreshVolume(await window.os.setVolume(Number(event.target.value))), 60);
    });

    $('#mute').addEventListener('click', async () => refreshVolume(await window.os.toggleMute()));

    $('#ne-pas-deranger').addEventListener('click', () => change({ doNotDisturb: !settings.doNotDisturb }));
    $('#costume').addEventListener('click', () => change({ skin: settings.skin === 'auto' ? 'none' : 'auto' }));

    $('#couleurs').addEventListener('click', event => {
        const swatch = event.target.closest('[data-color]');
        if (!swatch) return;
        change({ eyeColor: swatch.dataset.color });
        window.face.setExpression('happy', 1200);
    });

    // Ville : recherche par nom (Open-Meteo), on garde la première trouvée en France
    $('#ville-form').addEventListener('submit', async event => {
        event.preventDefault();
        const name = $('#ville').value.trim();
        if (!name) return;

        $('#ville-info').textContent = 'Recherche…';
        try {
            const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=5&language=fr`);
            const { results = [] } = await response.json();
            const place = results.find(r => r.country_code === 'FR') || results[0];
            if (!place) throw new Error('introuvable');

            await change({ place: { name: place.name, latitude: place.latitude, longitude: place.longitude } });
            $('#ville').value = '';
            $('#ville-info').textContent = `${escape(place.name)}${place.admin1 ? `, ${place.admin1}` : ''}`;
            toast(`Météo de ${place.name}`, 'sun');
        } catch {
            $('#ville-info').textContent = 'Ville introuvable';
        }
    });

    document.addEventListener('overlay-open', event => {
        if (event.detail === 'reglages') refreshVolume();
    });

    window.os.settings().then(value => {
        settings = value;
        apply();
        document.dispatchEvent(new CustomEvent('settings-ready', { detail: settings }));
    });

    window.settings = { get: () => settings };
})();
