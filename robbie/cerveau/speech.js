// Voix de Robbie : serveur Piper (Python lancé une seule fois, la voix reste en mémoire),
// voix française hors ligne
const { spawn } = require('node:child_process');
const { python, PYTHON } = require('./paths');

function createSpeech() {
    let server = null;
    let buffer = '';
    let count = 0;
    const jobs = new Map();

    function start() {
        server = spawn(PYTHON, ['-u', python('voix_piper.py')], {
            env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
        });

        server.stdout.setEncoding('utf8');

        server.stdout.on('data', data => {
            buffer += data;

            const lines = buffer.split('\n');
            buffer = lines.pop();

            lines.forEach(line => {
                let reply;

                try {
                    reply = JSON.parse(line);
                } catch {
                    return;
                }

                const job = jobs.get(reply.id);
                if (!job) return;

                jobs.delete(reply.id);
                clearTimeout(job.timeout);

                if (reply.error) job.reject(new Error(`Piper : ${reply.error}`));
                else job.resolve(Buffer.from(reply.audio, 'base64'));
            });
        });

        server.stderr.on('data', data => console.log('Voix :', data.toString().trim()));
        server.on('error', error => console.error('Erreur serveur vocal :', error.message));

        server.on('exit', () => {
            server = null;
            jobs.forEach(job => job.reject(new Error('serveur vocal arrêté')));
            jobs.clear();
        });
    }

    // Phrase → son WAV
    function synthesize(text) {
        if (!server) start();

        return new Promise((resolve, reject) => {
            const id = ++count;
            const timeout = setTimeout(() => {
                jobs.delete(id);
                reject(new Error('Piper : délai dépassé'));
            }, 30000);

            jobs.set(id, { resolve, reject, timeout });
            server.stdin.write(`${JSON.stringify({ id, text })}\n`);
        });
    }

    const stop = () => server?.kill();

    return { synthesize, stop };
}

// Suppression des emojis et de la mise en forme avant la lecture
function cleanForSpeech(text) {
    return text
        .replace(/\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|[️‍⃣]/gu, '')
        .replace(/[*_#~`]/g, '')
        .trim();
}

module.exports = { createSpeech, cleanForSpeech };
