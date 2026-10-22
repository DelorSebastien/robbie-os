// Voix du robot : file de phrases audio (edge-tts) ou voix Windows en secours
let audioContext = null;
let stopCurrent = null;
let speaking = false;
let playing = false;
const speechQueue = [];

function startSpeaking() {
    if (speaking) return;

    speaking = true;
    window.robot.setSpeechState(true);
    face.setSpeaking(true);
}

function endSpeaking() {
    if (!speaking) return;

    speaking = false;
    window.robot.setSpeechState(false);
    face.setSpeaking(false);
}

// Arrêt immédiat de la parole (sommeil, interruption)
let speechGeneration = 0;

function stopSpeech() {
    speechGeneration++;
    speechQueue.length = 0;
    speechSynthesis.cancel();
    if (stopCurrent) stopCurrent();

    playing = false;
    endSpeaking();
}


// Partie parlée de l'audio : edge-tts ajoute environ 0,2 s de silence au début
// et jusqu'à 1,4 s à la fin, ce qui créait de longues pauses entre les phrases
function speechBounds(buffer) {
    const samples = buffer.getChannelData(0);
    let peak = 0;

    for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));

    const threshold = peak * 0.02;
    let first = 0;
    let last = samples.length - 1;

    while (first < last && Math.abs(samples[first]) < threshold) first++;
    while (last > first && Math.abs(samples[last]) < threshold) last--;

    // Petites marges pour garder une respiration naturelle
    const start = Math.max(0, first / buffer.sampleRate - 0.04);
    const end = Math.min(buffer.duration, last / buffer.sampleRate + 0.18);

    return { start, duration: Math.max(0.05, end - start) };
}

// Lecture d'une phrase audio : son volume réel anime les yeux et l'onde vocale
async function playAudio(data, done) {
    const generation = speechGeneration;

    audioContext ??= new AudioContext();
    audioContext.resume();

    let buffer;

    try {
        // Copie : decodeAudioData consomme les données
        buffer = await audioContext.decodeAudioData(new Uint8Array(data).buffer);
    } catch {
        done();
        return;
    }

    const source = audioContext.createBufferSource();
    source.buffer = buffer;

    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;

    source.connect(analyser);
    analyser.connect(audioContext.destination);

    const samples = new Uint8Array(analyser.fftSize);
    let frame;

    function follow() {
        analyser.getByteTimeDomainData(samples);

        let sum = 0;
        for (const sample of samples) {
            const v = (sample - 128) / 128;
            sum += v * v;
        }

        face.talkPulse(Math.min(1, Math.sqrt(sum / samples.length) * 4));
        frame = requestAnimationFrame(follow);
    }

    let finished = false;

    function finish(interrupted) {
        if (finished) return;
        finished = true;

        cancelAnimationFrame(frame);
        source.onended = null;
        try { source.stop(); } catch { /* déjà arrêtée */ }
        source.disconnect();
        stopCurrent = null;

        if (!interrupted) done();
    }

    // Robbie a été interrompu pendant le décodage
    if (generation !== speechGeneration) return;

    stopCurrent = () => finish(true);

    const { start, duration } = speechBounds(buffer);

    source.onended = () => finish(false);
    source.start(0, start, duration);
    follow();
}


// Voix Windows (secours si edge-tts est indisponible)
function speakWithWindows(text, done) {
    const speech = new SpeechSynthesisUtterance(text);

    speech.lang = 'fr-FR';
    speech.rate = 1;
    speech.pitch = 1.1;

    const voices = speechSynthesis.getVoices();
    const frenchVoice = voices.find(voice => voice.lang.startsWith('fr'));

    if (frenchVoice) speech.voice = frenchVoice;

    // Les yeux et l'onde vocale réagissent à chaque mot
    speech.onboundary = () => face.talkPulse();

    speech.onend = done;
    speech.onerror = (event) => {
        if (event.error !== 'interrupted' && event.error !== 'canceled') done();
    };

    speechSynthesis.speak(speech);
}


// Lecture des phrases dans l'ordre d'arrivée
function playNext() {
    const chunk = speechQueue.shift();

    if (!chunk) {
        playing = false;
        return;
    }

    playing = true;

    // Fin de la réponse
    if (chunk.end) {
        endSpeaking();
        playNext();
        return;
    }

    startSpeaking();

    // Des points d'interrogation s'envolent quand Robbie pose une question
    if (chunk.text?.trim().endsWith('?')) face.ask();

    if (chunk.audio) playAudio(chunk.audio, playNext);
    else speakWithWindows(chunk.text, playNext);
}

window.robot.onSpeechChunk((chunk) => {
    if (face.isSleeping()) return;

    speechQueue.push(chunk);
    if (!playing) playNext();
});

window.robot.onStopSpeech(stopSpeech);
