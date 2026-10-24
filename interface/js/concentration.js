// Mode concentration : pendant 25 ou 50 minutes, plus de notifications ni de Robbie qui écoute ;
// un minuteur s'affiche dans le coin (clic : arrêter), et Robbie prévient quand c'est fini
(() => {
    const chip = document.getElementById('coin-concentration');
    const label = document.getElementById('coin-minuteur');
    let end = 0;
    let timer = null;
    let previousDnd = false;

    const format = ms => {
        const s = Math.max(0, Math.ceil(ms / 1000));
        return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    };

    async function start(minutes = 25) {
        if (!end) previousDnd = Boolean((await window.os.settings()).doNotDisturb);
        end = Date.now() + minutes * 60000;
        window.notificationsCenter.setDoNotDisturb(true);
        window.os.setFocusMode(true);
        chip.hidden = false;
        window.icons.fill(chip);
        tick();
        clearInterval(timer);
        timer = setInterval(tick, 1000);
        window.ui.toast(`Concentration : ${minutes} minutes sans interruption`, 'focus');
    }

    function stop(finished = false) {
        if (!end) return;
        end = 0;
        clearInterval(timer);
        chip.hidden = true;
        window.notificationsCenter.setDoNotDisturb(previousDnd);
        window.os.setFocusMode(false);
        window.ui.toast(finished ? 'Séance terminée, bravo ! Fais une pause.' : 'Mode concentration arrêté', 'check');
        if (finished) window.face?.setExpression('happy', 3000);
    }

    function tick() {
        const left = end - Date.now();
        label.textContent = format(left);
        if (left <= 0) stop(true);
    }

    chip.addEventListener('click', () => stop());

    // « concentration-25 », « concentration-50 », « concentration-stop » (raccourcis, Robbie)
    window.os.onShortcut(name => {
        const match = name.match(/^concentration-(\d+|stop)$/);
        if (!match) return;
        if (match[1] === 'stop') stop();
        else start(Number(match[1]));
    });

    window.concentration = { start, stop, active: () => Boolean(end) };
})();
