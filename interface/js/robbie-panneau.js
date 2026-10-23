// Panneau de Robbie : s'ouvre au-dessus du dock (clic sur Robbie, touche Super ou « Robbie ! »),
// affiche la conversation, joue sa voix et anime son visage (réflexion, émotions, paroles)
(() => {
    const api = window.robbieApi;
    const face = window.face;
    const panel = document.getElementById('robbie-panneau');
    const thread = document.getElementById('rp-fil');
    const form = document.getElementById('rp-saisie');
    const input = document.getElementById('rp-texte');
    const status = document.getElementById('rp-etat');
    const confirmBox = document.getElementById('rp-confirmer');

    const STATUS = { pret: 'PRÊT', reflechit: 'RÉFLÉCHIT…', parle: 'PARLE', ecoute: 'ÉCOUTE' };
    const POWER_LABELS = { suspend: 'Mettre en veille', reboot: 'Redémarrer', poweroff: 'Éteindre' };

    function setStatus(name) {
        status.textContent = STATUS[name] || STATUS.pret;
        panel.dataset.etat = name;
    }

    // ---- Ouverture / fermeture ----
    let closeTimer = null;

    function open() {
        window.panneaux?.close();
        clearTimeout(closeTimer);
        panel.hidden = false;
        requestAnimationFrame(() => panel.classList.add('ouvert'));
        api.setPanelOpen(true);
        setTimeout(() => input.focus(), 50);
    }

    function close() {
        panel.classList.remove('ouvert');
        api.setPanelOpen(false);
        closeTimer = setTimeout(() => {
            panel.hidden = true;
        }, 250);
    }

    const toggle = () => (panel.hidden || !panel.classList.contains('ouvert') ? open() : close());

    document.getElementById('rp-fermer').addEventListener('click', close);
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !panel.hidden) close();
    });
    window.os.onShortcut(name => {
        if (name === 'palette') toggle();
    });

    // ---- Conversation ----
    let typing = null;

    function addMessage(who, text) {
        const el = document.createElement('div');
        el.className = `rp-message ${who}`;
        el.textContent = text;
        thread.append(el);
        thread.scrollTop = thread.scrollHeight;
        return el;
    }

    form.addEventListener('submit', event => {
        event.preventDefault();
        const text = input.value.trim();
        if (!text) return;
        input.value = '';
        api.ask(text);
    });

    api.on('robbie-ouvrir', open);

    api.on('robbie-question', ({ text }) => {
        addMessage('moi', text);
        typing = addMessage('robbie attente', '');
        typing.innerHTML = '<i></i><i></i><i></i>';
    });

    api.on('robbie-etat', name => {
        setStatus(name);
        face.setThinking(name === 'reflechit');
    });

    api.on('robbie-reponse', ({ text, emotion, confirm }) => {
        typing?.remove();
        typing = null;
        face.setThinking(false);
        addMessage('robbie', text);
        if (face.expressions.includes(emotion)) face.setExpression(emotion, 4000);
        showConfirm(confirm);
    });

    api.on('robbie-ecoute', () => {
        face.listenPulse();
        if (!panel.hidden) setStatus('ecoute');
    });

    api.on('robbie-micro', problem => {
        if (!problem.ok) addMessage('systeme', `${problem.title} : ${problem.detail}`);
    });

    // ---- Confirmation des actions sensibles (éteindre, redémarrer…) ----
    function showConfirm(action) {
        confirmBox.hidden = !action;
        if (!action) return;

        confirmBox.innerHTML = '';
        const yes = document.createElement('button');
        yes.className = 'rp-oui';
        yes.textContent = POWER_LABELS[action.command] || 'Confirmer';
        const no = document.createElement('button');
        no.className = 'rp-non';
        no.textContent = 'Annuler';

        yes.addEventListener('click', () => {
            confirmBox.hidden = true;
            api.confirm(action);
        });
        no.addEventListener('click', () => {
            confirmBox.hidden = true;
            addMessage('robbie', 'D\'accord, on ne touche à rien.');
        });

        confirmBox.append(yes, no);
    }

    // ---- Voix : lecture du son, bouche animée au rythme du volume ----
    let audioContext = null;

    api.on('robbie-voix', async base64 => {
        try {
            audioContext ??= new AudioContext();
            const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
            const buffer = await audioContext.decodeAudioData(bytes.buffer);

            const source = audioContext.createBufferSource();
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 512;
            source.buffer = buffer;
            source.connect(analyser);
            analyser.connect(audioContext.destination);

            const samples = new Float32Array(analyser.fftSize);
            let playing = true;

            const animate = () => {
                if (!playing) return;
                analyser.getFloatTimeDomainData(samples);
                const rms = Math.sqrt(samples.reduce((sum, v) => sum + v * v, 0) / samples.length);
                face.talkPulse(Math.min(1, rms * 6));
                requestAnimationFrame(animate);
            };

            source.onended = () => {
                playing = false;
                face.setSpeaking(false);
                api.setSpeaking(false);
            };

            face.setSpeaking(true);
            api.setSpeaking(true);
            setStatus('parle');
            source.start();
            animate();
        } catch (error) {
            console.error('Lecture de la voix impossible :', error);
            face.setSpeaking(false);
            api.setSpeaking(false);
        }
    });

    setStatus('pret');
    addMessage('robbie', 'Salut ! Écris-moi ici, ou dis « Robbie » pour me parler.');

    window.robbiePanel = { open, close, toggle };
})();
