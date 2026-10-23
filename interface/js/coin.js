// Coin en bas à droite : heure, et icône du son selon le volume
(() => {
    const time = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const clock = document.getElementById('heure');

    function tick() {
        clock.textContent = time.format(new Date());
    }

    tick();
    setInterval(tick, 1000);

    async function refreshVolume() {
        const volume = await window.os.volume();
        const icon = document.getElementById('coin-son');
        icon.dataset.icon = !volume || volume.muted || volume.level === 0 ? 'volume-x' : 'volume';
        window.icons.fill(icon.parentElement);
    }

    refreshVolume();
    setInterval(refreshVolume, 5000);
})();
