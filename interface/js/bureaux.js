// Bureaux virtuels : quatre points en haut de la barre latérale, celui du bureau actif allumé.
// Un clic change de bureau ; Super + 1…4 aussi (labwc prévient l'interface : « bureau-N »)
(() => {
    const COUNT = 4;
    const box = document.getElementById('bureaux');
    let current = 1;

    box.innerHTML = Array.from({ length: COUNT }, (_, i) =>
        `<button class="bureau" data-bureau="${i + 1}" aria-label="Bureau ${i + 1}" title="Bureau ${i + 1} (Super+${i + 1})"></button>`).join('');

    function show(number) {
        current = number;
        box.querySelectorAll('[data-bureau]').forEach(dot => {
            const active = Number(dot.dataset.bureau) === number;
            dot.classList.toggle('actif', active);
            dot.setAttribute('aria-current', active ? 'true' : 'false');
        });
    }

    box.addEventListener('click', event => {
        const dot = event.target.closest('[data-bureau]');
        if (dot && Number(dot.dataset.bureau) !== current) window.os.goToDesktop(Number(dot.dataset.bureau));
    });

    window.os.onShortcut(name => {
        const match = name.match(/^bureau-([1-4])$/);
        if (match) show(Number(match[1]));
    });

    show(1);
    window.bureaux = { current: () => current, go: number => window.os.goToDesktop(number) };
})();
