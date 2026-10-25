// Fenêtre d'appel Robbie OS ↔ Robbie OS : l'image et le son vont en direct d'un ordinateur à
// l'autre (WebRTC, chiffré) ; la signalisation passe par le service du téléphone.
// Celui qui appelle fait l'offre ; chaque côté a d'emblée une piste son et une piste image
// (vides si besoin) : couper la caméra ou partager l'écran ne fait que changer la piste.
(() => {
    const api = window.telephone;
    const $ = id => document.getElementById(id);
    const id = new URLSearchParams(location.search).get('id');
    const COLORS = ['#ff6fa8', '#ffb35c', '#5aa8ff', '#b57bff', '#5ee8a8', '#ff8a5c', '#5ee7ff', '#ffd25c', '#7f9dff', '#9fe0a0'];
    const colorOf = name => COLORS[[...String(name)].reduce((sum, c) => sum + c.charCodeAt(0), 0) % COLORS.length];
    const initials = name => String(name).split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('');

    let call = null;
    let pc = null;
    let local = null;              // flux du micro et de la caméra
    let camera = null;             // piste de la caméra (null : pas de caméra ou coupée)
    let screen = null;             // piste du partage d'écran
    let micOn = true;
    let remoteCamera = true;
    let connectedAt = 0;
    let ended = false;
    const pending = [];             // signaux arrivés avant que tout soit prêt
    let ready = false;
    let devicesReady = false;
    let startWhenReady = false;

    const svc = async (method, ...args) => {
        const result = await api.service(method, ...args);
        if (result?.erreurService) throw new Error(result.erreurService);
        return result;
    };
    const signal = data => svc('signal', id, data).catch(() => {});
    function flash(text) {
        const el = document.createElement('div');
        el.className = 'flash';
        el.textContent = text;
        document.body.append(el);
        setTimeout(() => el.remove(), 3500);
    }

    // ---- Affichage ----
    function renderPerson() {
        const name = call?.personne?.nom || 'Robbie OS';
        for (const el of [$('av'), $('grand-av')]) {
            el.style.setProperty('--c', colorOf(name));
            el.textContent = initials(name);
        }
        $('nom').textContent = name;
        $('grand-nom').textContent = name;
        document.title = `Appel avec ${name}`;
    }
    function renderState() {
        const state = call?.etat;
        const waiting = !connectedAt;
        $('grand-etat').textContent = ended ? '' : waiting ? (call?.sens === 'sortant' ? (state === 'appel' ? 'Ça sonne chez lui…' : 'Connexion…') : 'Connexion…') : remoteCamera ? '' : 'Caméra coupée';
        $('sans-video').classList.toggle('sonne', waiting && state === 'appel');
        $('sans-video').hidden = Boolean(!ended && connectedAt && remoteCamera && $('distant').srcObject?.getVideoTracks().some(t => !t.muted));
        $('qualite').hidden = !connectedAt;
    }
    function tick() {
        if (!connectedAt) {
            $('duree').textContent = `${call?.etat === 'appel' ? 'Appel…' : 'Connexion…'} · Robbie OS`;
            return;
        }
        const seconds = Math.floor((Date.now() - connectedAt) / 1000);
        const text = seconds >= 3600 ? `${Math.floor(seconds / 3600)}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}` : `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
        $('duree').textContent = `${text} · Robbie OS`;
    }
    setInterval(tick, 1000);

    function renderButtons() {
        const mic = $('micro');
        mic.classList.toggle('coupe', !micOn);
        mic.dataset.icon = micOn ? 'micro' : 'micro-coupe';
        mic.setAttribute('aria-label', micOn ? 'Couper le micro' : 'Rallumer le micro');
        mic.title = mic.getAttribute('aria-label');
        const cam = $('camera');
        const camOn = Boolean(camera && camera.enabled);
        cam.classList.toggle('coupe', !camOn);
        cam.dataset.icon = camOn ? 'video' : 'video-coupee';
        cam.setAttribute('aria-label', camOn ? 'Couper la caméra' : 'Allumer la caméra');
        cam.title = cam.getAttribute('aria-label');
        $('ecran').classList.toggle('on', Boolean(screen));
        $('ecran').title = screen ? 'Arrêter le partage' : 'Partager l’écran';
        window.icons.fill(document.querySelector('.commandes'));
        // Vignette : l'écran partagé, sinon la caméra
        const mine = screen || (camera?.enabled ? camera : null);
        $('moi-zone').hidden = !mine;
        $('moi-zone').classList.toggle('ecran', Boolean(screen));
        $('moi').srcObject = mine ? new MediaStream([mine]) : null;
    }

    // ---- Micro et caméra ----
    async function openDevices() {
        local = new MediaStream();
        try {
            const audio = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
            audio.getAudioTracks().forEach(t => local.addTrack(t));
        } catch {
            flash('Pas de micro trouvé : l’autre personne ne t’entendra pas');
            micOn = false;
        }
        if (call?.video) await startCamera(true);
    }
    async function startCamera(quiet = false) {
        try {
            const video = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } } });
            camera = video.getVideoTracks()[0];
            return true;
        } catch {
            if (!quiet) flash('Pas de caméra trouvée');
            camera = null;
            return false;
        }
    }

    const audioSender = () => pc?.getTransceivers().find(t => t.receiver.track.kind === 'audio')?.sender;
    const videoSender = () => pc?.getTransceivers().find(t => t.receiver.track.kind === 'video')?.sender;
    async function updateSenders() {
        await audioSender()?.replaceTrack(local.getAudioTracks()[0] || null);
        await videoSender()?.replaceTrack(screen || (camera?.enabled ? camera : null));
        signal({ etat: { camera: Boolean(screen || camera?.enabled), micro: micOn } });
    }

    // ---- La connexion ----
    function createConnection() {
        pc = new RTCPeerConnection({ iceServers: [] });
        pc.onicecandidate = event => event.candidate && signal({ candidat: event.candidate.toJSON() });
        pc.ontrack = event => {
            const video = $('distant');
            if (!video.srcObject) video.srcObject = new MediaStream();
            video.srcObject.addTrack(event.track);
            event.track.onunmute = renderState;
            event.track.onmute = renderState;
            if (subtitlesOn && event.track.kind === 'audio') startSubtitleCapture();
            renderState();
        };
        pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'connected' && !connectedAt) {
                connectedAt = Date.now();
                svc('appelConnecte', id).catch(() => {});
                tick();
                renderState();
            }
            if (pc.connectionState === 'failed') finish('La connexion a échoué');
        };
    }

    async function startAsCaller() {
        // (l'offre attend le micro et la caméra)
        if (!devicesReady) {
            startWhenReady = true;
            return;
        }
        if (pc) return;
        createConnection();
        pc.addTransceiver('audio', { direction: 'sendrecv' });
        pc.addTransceiver('video', { direction: 'sendrecv' });
        await updateSenders();
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        signal({ sdp: pc.localDescription.toJSON() });
        ready = true;
        flushPending();
    }

    async function receiveSignal(data) {
        if (!devicesReady || (!ready && !data.sdp)) return pending.push(data);
        if (data.sdp) {
            if (data.sdp.type === 'offer') {
                if (!pc) createConnection();
                await pc.setRemoteDescription(data.sdp);
                for (const transceiver of pc.getTransceivers()) transceiver.direction = 'sendrecv';
                await updateSenders();
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                signal({ sdp: pc.localDescription.toJSON() });
                ready = true;
                flushPending();
            } else if (data.sdp.type === 'answer' && pc) {
                await pc.setRemoteDescription(data.sdp);
            }
            return;
        }
        if (data.candidat && pc) await pc.addIceCandidate(data.candidat).catch(() => {});
        if (data.etat) {
            remoteCamera = Boolean(data.etat.camera);
            renderState();
        }
    }
    function flushPending() {
        const waiting = pending.splice(0);
        // (dans l'ordre : l'offre d'abord, puis ce qui l'accompagne)
        (async () => {
            for (const data of waiting) await receiveSignal(data);
        })();
    }

    // ---- Fin ----
    const REASONS = { 'echec': 'L’appel n’a pas pu se connecter', 'raccroche': 'Appel terminé', 'fin': 'Appel terminé', 'refuse': 'Appel refusé', 'occupe': 'Déjà en ligne', 'sans-reponse': 'Pas de réponse', 'injoignable': 'Cette personne n’est pas joignable', 'manque': 'Appel manqué' };
    function finish(text) {
        if (ended) return;
        ended = true;
        stopSubtitles();
        pc?.close();
        local?.getTracks().forEach(t => t.stop());
        camera?.stop();
        screen?.stop();
        // (l'image s'arrête : l'avatar revient derrière le message de fin)
        $('distant').srcObject = null;
        connectedAt = 0;
        $('fin').textContent = text;
        $('fin').hidden = false;
        renderState();
        setTimeout(() => api.closeCall(), 1800);
    }

    // ---- Sous-titres : l'oreille de Robbie écoute l'autre personne ----
    let subtitlesOn = false;
    let audioContext = null;
    let subtitleTimer = null;
    async function startSubtitleCapture() {
        const track = $('distant').srcObject?.getAudioTracks()[0];
        if (!track || audioContext) return;
        audioContext = new AudioContext();
        await audioContext.audioWorklet.addModule('./capture-son.js');
        const source = audioContext.createMediaStreamSource(new MediaStream([track]));
        const node = new AudioWorkletNode(audioContext, 'capture-son');
        node.port.onmessage = event => subtitlesOn && api.subtitlesAudio(event.data);
        source.connect(node);
    }
    function stopSubtitles() {
        subtitlesOn = false;
        audioContext?.close();
        audioContext = null;
        api.subtitles(false);
        $('sous-titre').hidden = true;
        $('sous-titres').classList.remove('on');
    }
    $('sous-titres').addEventListener('click', async () => {
        if (subtitlesOn) return stopSubtitles();
        subtitlesOn = true;
        $('sous-titres').classList.add('on');
        await api.subtitles(true);
        $('sous-titre-texte').textContent = 'Robbie écoute…';
        $('sous-titre').hidden = false;
        startSubtitleCapture();
    });
    api.onSubtitle(data => {
        if (!subtitlesOn) return;
        if (data.erreur) {
            flash(data.erreur);
            return stopSubtitles();
        }
        if (!data.texte) return;
        $('sous-titre-texte').textContent = data.texte;
        $('sous-titre').hidden = false;
        clearTimeout(subtitleTimer);
        subtitleTimer = setTimeout(() => ($('sous-titre').hidden = true), 7000);
    });

    // ---- Qualité de la connexion ----
    let lastLost = 0;
    let lastReceived = 0;
    setInterval(async () => {
        if (!pc || !connectedAt || ended) return;
        const stats = await pc.getStats();
        let rtt = 0;
        let lost = 0;
        let received = 0;
        stats.forEach(report => {
            if (report.type === 'candidate-pair' && report.nominated && report.currentRoundTripTime) rtt = report.currentRoundTripTime;
            if (report.type === 'inbound-rtp') {
                lost += report.packetsLost || 0;
                received += report.packetsReceived || 0;
            }
        });
        const lossRate = received - lastReceived > 0 ? (lost - lastLost) / (received - lastReceived + lost - lastLost) : 0;
        lastLost = lost;
        lastReceived = received;
        const level = rtt > 0.4 || lossRate > 0.08 ? 1 : rtt > 0.2 || lossRate > 0.03 ? 2 : rtt > 0.1 || lossRate > 0.01 ? 3 : 4;
        const bars = $('barres');
        [...bars.children].forEach((bar, i) => bar.classList.toggle('on', i < level));
        bars.className = `barres ${level <= 1 ? 'faible' : level === 2 ? 'moyen' : ''}`;
        $('qualite-texte').textContent = level >= 3 ? 'Bonne connexion' : level === 2 ? 'Connexion moyenne' : 'Mauvaise connexion';
    }, 2000);

    // ---- Commandes ----
    $('micro').addEventListener('click', () => {
        const track = local?.getAudioTracks()[0];
        if (!track) return flash('Pas de micro trouvé');
        micOn = !micOn;
        track.enabled = micOn;
        svc('micro', id, micOn).catch(() => {});
        signal({ etat: { camera: Boolean(screen || camera?.enabled), micro: micOn } });
        renderButtons();
    });
    $('camera').addEventListener('click', async () => {
        if (camera?.enabled) camera.enabled = false;
        else if (camera) camera.enabled = true;
        else if (!(await startCamera())) return;
        await updateSenders();
        renderButtons();
    });
    $('ecran').addEventListener('click', async () => {
        if (screen) {
            screen.stop();
            screen = null;
        } else {
            try {
                const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
                screen = stream.getVideoTracks()[0];
                screen.onended = async () => {
                    screen = null;
                    await updateSenders();
                    renderButtons();
                };
            } catch {
                return;
            }
        }
        await updateSenders();
        renderButtons();
    });
    $('ecrire').addEventListener('click', () => call && api.openConversation(`robbie:${call.adresse}`));
    $('raccrocher').addEventListener('click', async () => {
        await svc('raccrocher', id).catch(() => {});
        finish('Appel terminé');
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && ended) api.closeCall();
    });

    // ---- Nouvelles du service ----
    api.onService(async (event, data) => {
        if (event === 'signal' && data.id === id) receiveSignal(data.donnees);
        if (event === 'appel' && data.id === id) {
            const before = call?.etat;
            call = data;
            // (il a décroché : on fait l'offre)
            if (call.sens === 'sortant' && before === 'appel' && call.etat === 'connexion' && !pc) startAsCaller();
            renderState();
        }
        if (event === 'appel-fin' && data.id === id) finish(REASONS[data.raison] || 'Appel terminé');
    });

    async function start() {
        call = await svc('appel', id).catch(() => null);
        if (!call) return finish('Cet appel est terminé');
        renderPerson();
        renderState();
        tick();
        await openDevices();
        devicesReady = true;
        renderButtons();
        // (ce que l'autre a envoyé avant que la fenêtre soit là)
        const backlog = await svc('signauxEnAttente', id).catch(() => []);
        pending.unshift(...backlog);
        flushPending();
        if (startWhenReady) startAsCaller();
        if (call.sens === 'sortant' && call.etat === 'connexion') startAsCaller();
        // (côté qui répond : on attend l'offre)
        if (call.sens === 'entrant') ready = false;
    }

    window.icons.fill();
    start();
})();
