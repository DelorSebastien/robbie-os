// Robbie au centre du bureau : il regarde la souris, réagit, parle dans une bulle,
// et sa couleur (celle de son émotion) devient la couleur de toute l'interface
(() => {
    const face = window.face;
    const el = document.getElementById('robbie');
    const bubble = document.getElementById('bulle');
    const root = document.documentElement;

    // Couleur d'accent de l'interface = couleur des yeux de Robbie
    let lastColor = '';
    setInterval(() => {
        const color = face.color().join(', ');
        if (color === lastColor) return;
        lastColor = color;
        root.style.setProperty('--accent', color);
    }, 120);

    // Il suit la souris des yeux (et s'endort si personne ne bouge pendant longtemps)
    let lastMove = Date.now();
    window.addEventListener('mousemove', event => {
        lastMove = Date.now();
        if (face.isSleeping()) {
            face.setSleeping(false);
            setTimeout(() => face.setExpression('happy', 1600), 500);
        }

        const box = el.getBoundingClientRect();
        const x = (event.clientX - (box.left + box.width / 2)) / (window.innerWidth / 2);
        const y = (event.clientY - (box.top + box.height / 2)) / (window.innerHeight / 2);
        face.setGaze(x * 1.2, y * 1.2);
    });

    setInterval(() => {
        if (!face.isSleeping() && Date.now() - lastMove > 5 * 60 * 1000) face.setSleeping(true);
    }, 10000);

    // Petites réactions spontanées de temps en temps
    const MOODS = ['happy', 'curious', 'love'];
    setInterval(() => {
        if (face.isSleeping() || face.isBusy() || Math.random() > 0.35) return;
        face.setExpression(MOODS[Math.floor(Math.random() * MOODS.length)], 2200);
    }, 25000);

    // Bulle de parole
    let bubbleTimer = null;
    function say(text, expression = 'happy', duration = 5000) {
        bubble.textContent = text;
        bubble.hidden = false;
        requestAnimationFrame(() => bubble.classList.add('show'));
        if (expression) face.setExpression(expression, Math.min(duration, 4000));
        face.setSpeaking(true);
        setTimeout(() => face.setSpeaking(false), Math.min(2400, 60 * text.length));

        clearTimeout(bubbleTimer);
        bubbleTimer = setTimeout(() => {
            bubble.classList.remove('show');
            setTimeout(() => {
                if (!bubble.classList.contains('show')) bubble.hidden = true;
            }, 300);
        }, duration);
    }

    function think(active) {
        face.setThinking(active);
        el.classList.toggle('thinking', active);
    }

    // Un clic sur Robbie : il réagit et ouvre la palette pour qu'on lui parle
    el.addEventListener('click', () => {
        face.setExpression('happy', 1500);
        window.ui.overlays.open('palette');
    });

    window.robbie = { say, think };
})();
