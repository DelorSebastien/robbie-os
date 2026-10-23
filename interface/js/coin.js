// Coin en bas à droite : l'heure (clic : agenda), le réseau et le son (clic : réglages rapides)
(() => {
    const { escape, toast } = window.ui;
    const time = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const clock = document.getElementById('heure');
    const soundIcon = document.getElementById('coin-son');
    const networkIcon = document.getElementById('coin-reseau');

    function tick() {
        clock.textContent = time.format(new Date());
        clock.title = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }

    tick();
    setInterval(tick, 1000);

    async function refreshIcons() {
        const volume = await window.os.volume();
        soundIcon.dataset.icon = !volume || volume.muted || volume.level === 0 ? 'volume-x' : 'volume';
        const network = await window.os.network();
        networkIcon.dataset.icon = network.online ? (network.wifi?.connected ? 'wifi' : 'ethernet') : 'wifi-off';
        window.icons.fill(soundIcon.parentElement);
    }

    refreshIcons();
    setInterval(refreshIcons, 5000);

    document.getElementById('coin-heure').addEventListener('click', () => window.panneaux.toggle('agenda'));
    document.getElementById('coin-rapide').addEventListener('click', () => window.panneaux.toggle('rapide'));

    // ---- Réglages rapides ----
    const panel = window.panneaux.create('rapide', 'Réglages rapides', { place: 'coin', onOpen: render });

    async function render() {
        const [volume, brightness, network, settings] = await Promise.all([
            window.os.volume(), window.os.brightness(), window.os.network(), window.os.settings()
        ]);

        const networkText = !network.online ? 'Hors ligne'
            : network.wifi?.connected ? `Wi-Fi · ${escape(network.wifi.network)}`
                : 'Ethernet · connecté';

        panel.body.innerHTML = `
            <div class="rapide-ligne">
                <button class="rapide-icone" data-mute data-icon="${volume?.muted ? 'volume-x' : 'volume'}" aria-label="Couper le son"></button>
                <input type="range" min="0" max="100" value="${volume?.level ?? 0}" data-volume aria-label="Volume" ${volume ? '' : 'disabled'}>
                <b data-volume-valeur>${volume ? (volume.muted ? 'muet' : `${volume.level}%`) : '—'}</b>
            </div>
            ${brightness == null ? '' : `
            <div class="rapide-ligne">
                <span class="rapide-icone" data-icon="sun"></span>
                <input type="range" min="5" max="100" value="${brightness}" data-luminosite aria-label="Luminosité">
                <b data-luminosite-valeur>${brightness}%</b>
            </div>`}
            <div class="rapide-reseau">
                <span data-icon="${network.online ? (network.wifi?.connected ? 'wifi' : 'ethernet') : 'wifi-off'}"></span>
                <span>${networkText}</span>
            </div>
            ${network.wifi ? '<div class="rapide-wifi" data-wifi><p class="panneau-vide">Recherche des réseaux Wi-Fi…</p></div>' : ''}
            <label class="interrupteur">
                <input type="checkbox" data-dnd ${settings.doNotDisturb ? 'checked' : ''}>
                <span>Ne pas déranger</span>
            </label>`;
        window.icons.fill(panel.body);

        const slider = panel.body.querySelector('[data-volume]');
        let timer = null;
        slider.addEventListener('input', () => {
            panel.body.querySelector('[data-volume-valeur]').textContent = `${slider.value}%`;
            clearTimeout(timer);
            timer = setTimeout(async () => {
                await window.os.setVolume(Number(slider.value));
                refreshIcons();
            }, 60);
        });
        panel.body.querySelector('[data-mute]').addEventListener('click', async () => {
            await window.os.toggleMute();
            refreshIcons();
            render();
        });

        const light = panel.body.querySelector('[data-luminosite]');
        light?.addEventListener('input', () => {
            panel.body.querySelector('[data-luminosite-valeur]').textContent = `${light.value}%`;
            window.os.setBrightness(Number(light.value));
        });

        panel.body.querySelector('[data-dnd]').addEventListener('change', event => {
            window.os.setSettings({ doNotDisturb: event.target.checked });
        });

        if (network.wifi) renderWifi(panel.body.querySelector('[data-wifi]'));
    }

    // Réseaux Wi-Fi : clic pour se connecter (mot de passe demandé si le réseau est protégé)
    async function renderWifi(box) {
        const networks = await window.os.wifiNetworks();
        if (!networks.length) {
            box.innerHTML = '<p class="panneau-vide">Aucun réseau Wi-Fi trouvé</p>';
            return;
        }

        box.innerHTML = networks.slice(0, 8).map((n, index) => `
            <button class="wifi-reseau${n.active ? ' actif' : ''}" data-index="${index}">
                <span class="wifi-force" style="--force: ${n.signal}%"></span>
                <span class="liste-texte">${escape(n.ssid)}</span>
                ${n.secured ? '<small>protégé</small>' : ''}
            </button>`).join('');

        box.querySelectorAll('[data-index]').forEach(button => button.addEventListener('click', () => {
            const network = networks[Number(button.dataset.index)];
            if (network.active) return;
            if (!network.secured) return connect(network.ssid);

            button.insertAdjacentHTML('afterend', `
                <form class="champ-ajout wifi-mdp">
                    <input type="password" placeholder="Mot de passe de ${escape(network.ssid)}" aria-label="Mot de passe">
                    <button aria-label="Se connecter" data-icon="send"></button>
                </form>`);
            const form = button.nextElementSibling;
            window.icons.fill(form);
            form.querySelector('input').focus();
            form.addEventListener('submit', event => {
                event.preventDefault();
                connect(network.ssid, form.querySelector('input').value);
            });
        }));
    }

    async function connect(ssid, password) {
        toast(`Connexion à ${ssid}…`, 'wifi');
        const ok = await window.os.connectWifi(ssid, password);
        toast(ok ? `Connecté à ${ssid}` : `Impossible de se connecter à ${ssid}`, ok ? 'check' : 'x');
        refreshIcons();
        if (window.panneaux.current() === 'rapide') render();
    }
})();
