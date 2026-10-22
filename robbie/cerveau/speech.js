// Voix de Robbie : serveur edge-tts (Python lancé une seule fois, au lieu d'un
// démarrage par phrase), plusieurs phrases synthétisées en parallèle
const { spawn } = require('node:child_process');
const { python } = require('./paths');

function createSpeech({ settings }) {
    // Voix de Robbie, d'après les réglages
    function robotVoice() {
        const { voice, rate, pitch } = settings.get();
        const signed = (value, unit) => `${value >= 0 ? '+' : ''}${value}${unit}`;

        return { name: voice, rate: signed(rate, '%'), pitch: signed(pitch, 'Hz') };
    }

    // Serveur de synthèse vocale : Python lancé une seule fois (au lieu d'un
    // démarrage par phrase), plusieurs phrases synthétisées en parallèle
    let ttsServer = null;
    let ttsBuffer = '';
    let ttsCount = 0;
    const ttsJobs = new Map();

    function startTTS() {
        ttsServer = spawn('python', ['-u', python('tts_server.py')], {
            env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
        });

        ttsServer.stdout.setEncoding('utf8');

        ttsServer.stdout.on('data', data => {
            ttsBuffer += data;

            const lines = ttsBuffer.split('\n');
            ttsBuffer = lines.pop();

            lines.forEach(line => {
                let reply;

                try {
                    reply = JSON.parse(line);
                } catch {
                    return;
                }

                const job = ttsJobs.get(reply.id);
                if (!job) return;

                ttsJobs.delete(reply.id);
                clearTimeout(job.timeout);

                if (reply.error) job.reject(new Error(`edge-tts : ${reply.error}`));
                else job.resolve(Buffer.from(reply.audio, 'base64'));
            });
        });

        ttsServer.stderr.on('data', data => console.error('Voix :', data.toString().trim()));
        ttsServer.on('error', error => console.error('Erreur serveur vocal :', error.message));

        // Arrêt du serveur : les phrases en attente passent à la voix Windows
        ttsServer.on('exit', () => {
            ttsServer = null;
            ttsJobs.forEach(job => job.reject(new Error('serveur vocal arrêté')));
            ttsJobs.clear();
        });
    }

    function synthesize(text, voice = robotVoice()) {
        if (!ttsServer) startTTS();

        return new Promise((resolve, reject) => {
            const id = ++ttsCount;
            const timeout = setTimeout(() => {
                ttsJobs.delete(id);
                reject(new Error('edge-tts : délai dépassé'));
            }, 15000);

            ttsJobs.set(id, { resolve, reject, timeout });
            ttsServer.stdin.write(`${JSON.stringify({ id, text, voice: voice.name, rate: voice.rate, pitch: voice.pitch })}\n`);
        });
    }

    const stop = () => ttsServer?.kill();

    return { synthesize, robotVoice, stop };
}

// Suppression des emojis et de la mise en forme avant la lecture
function cleanForSpeech(text) {
    return text
        .replace(/\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|[️‍⃣]/gu, '')
        .replace(/[*_#~`]/g, '')
        .trim();
}

module.exports = { createSpeech, cleanForSpeech };
