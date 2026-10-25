// « Tu es toujours là ? » : après une longue inactivité (swayidle, Réglages › Système), Robbie le
// demande à voix haute ; une barre se vide en une minute. Bouger, toucher une touche, répondre ou
// cliquer « Je suis là » annule ; sinon l'ordinateur se met en veille.
(() => {
    const SECONDS = 60;
    let timer = null;
    let ticker = null;

    const card = document.createElement('section');
    card.className = 'presence';
    card.setAttribute('role', 'alertdialog');
    card.setAttribute('aria-label', 'Tu es toujours là ?');
    card.hidden = true;
    card.innerHTML = `
        <span class="presence-robbie">ROBBIE</span>
        <b class="presence-question">Tu es toujours là ?</b>
        <span class="presence-texte">Sans réponse, je mets l’ordinateur en veille dans <b data-secondes>${SECONDS}</b> s.</span>
        <div class="presence-barre" aria-hidden="true"><i></i></div>
        <button class="presence-bouton" data-la>Je suis là</button>`;
    document.body.append(card);
    const bar = card.querySelector('.presence-barre i');
    const seconds = card.querySelector('[data-secondes]');

    async function ask() {
        if (!card.hidden) return;
        // (pas pendant un appel)
        try {
            const status = await window.os.phone('etat');
            if (status?.appels?.length) return;
        } catch {}
        window.panneaux.close();
        askedAt = Date.now();
        card.hidden = false;
        // La barre part pleine et se vide jusqu'au bout de la minute
        bar.style.transition = 'none';
        bar.style.transform = 'scaleX(1)';
        requestAnimationFrame(() => requestAnimationFrame(() => {
            bar.style.transition = `transform ${SECONDS}s linear`;
            bar.style.transform = 'scaleX(0)';
            card.classList.add('visible');
        }));
        const end = Date.now() + SECONDS * 1000;
        seconds.textContent = SECONDS;
        ticker = setInterval(() => (seconds.textContent = Math.max(0, Math.ceil((end - Date.now()) / 1000))), 250);
        timer = setTimeout(sleep, SECONDS * 1000);
        window.os.setPresenceAsked(true);
    }

    function cancel() {
        if (card.hidden) return;
        clearTimeout(timer);
        clearInterval(ticker);
        card.classList.remove('visible');
        setTimeout(() => (card.hidden = true), 250);
        window.os.setPresenceAsked(false);
    }

    function sleep() {
        cancel();
        window.os.power('suspend');
    }

    card.querySelector('[data-la]').addEventListener('click', cancel);
    window.os.onShortcut(name => {
        if (name === 'veille-question') ask();
        // (le bureau passe devant en simulant une touche : swayidle croit qu'on est revenu ;
        // ce faux retour des premières secondes ne compte pas)
        if (name === 'veille-annuler' && Date.now() - askedAt > 2000) cancel();
    });
    // (une touche, la souris : swayidle prévient aussi, mais la page le voit tout de suite ;
    // le bureau qui passe devant peut faire bouger le pointeur de lui-même : il faut un vrai geste)
    const shown = () => !card.hidden && Date.now() - askedAt > 800;
    let askedAt = 0;
    document.addEventListener('keydown', () => shown() && cancel(), true);
    document.addEventListener('pointerdown', event => shown() && !event.target.closest('[data-la]') && cancel(), true);
    document.addEventListener('pointermove', event => shown() && Math.abs(event.movementX) + Math.abs(event.movementY) > 2 && cancel(), true);

    window.presence = { ask, cancel };
})();
