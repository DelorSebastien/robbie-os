// Micro : reconnaissance vocale Whisper (script Python), relancée toute seule si elle s'arrête
const { spawn } = require('node:child_process');
const { python } = require('./paths');

// Au-delà, le problème est expliqué à l'utilisateur au lieu de relancer en boucle
const MAX_RESTARTS = 3;

// Cause probable d'un arrêt, d'après ce que Python a affiché
function explain(errors) {
    const module = errors.match(/No module named '([\w.]+)'/);

    if (module) {
        return {
            title: 'Module Python manquant',
            detail: `Le micro a besoin du module « ${module[1]} ». Tape : pip install ${module[1].replace(/_/g, '-')}`,
            speech: "Mon micro ne marche pas : il manque un module Python. La commande à taper est affichée à l'écran."
        };
    }

    if (/PortAudio|Invalid (input )?device|device unavailable|-999[68]/i.test(errors)) {
        return {
            title: 'Micro introuvable',
            detail: 'Vérifie que ton micro est branché et autorisé dans Paramètres › Confidentialité › Microphone.',
            speech: "Je ne trouve pas de micro. Vérifie qu'il est bien branché."
        };
    }

    return {
        title: 'Micro arrêté',
        detail: 'La reconnaissance vocale s\'est arrêtée plusieurs fois. Le détail est dans le journal (menu de l\'icône › Journal).',
        speech: "Mon micro s'est arrêté plusieurs fois. Le détail est dans mon journal."
    };
}

function createMicrophone({ onHeard, onVoiceActive, onProblem }) {
    let child = null;
    let restarts = 0;
    let stopped = false;
    let vocabulary = null;
    let source = 'pc';

    function start() {
        let buffer = '';
        let errors = '';

        // (sortie Python en UTF-8 pour garder les accents)
        child = spawn('python', ['-u', python('voice_recognition.py')], {
            env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
        });

        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');

        child.stdout.on('data', data => {
            buffer += data;

            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop();

            lines.forEach(line => {
                // Signal de voix détectée par le micro
                if (line.trim() === 'VOICE_ACTIVE') {
                    onVoiceActive();
                    return;
                }

                console.log(line);

                const match = line.match(/^(Entendu|Incertain)\s*:\s*(.+)$/);
                if (match) onHeard(match[2].trim(), { uncertain: match[1] === 'Incertain' });
            });
        });

        // (Python écrit aussi ses informations ici : seules les vraies erreurs sont notées comme telles)
        child.stderr.on('data', data => {
            errors = `${errors}\n${data}`.slice(-3000);

            const text = data.trim();
            if (/traceback|error|exception|erreur/i.test(text)) console.error(text);
            else console.log(text);
        });

        child.on('error', error => {
            console.error('Erreur microphone :', error.message);

            if (error.code === 'ENOENT') {
                stopped = true;
                onProblem({
                    title: 'Python introuvable',
                    detail: 'Installe Python 3 depuis python.org en cochant « Add python.exe to PATH ».',
                    speech: "Je ne trouve pas Python : sans lui, je ne peux pas t'entendre."
                });
            }
        });

        child.on('exit', code => {
            child = null;
            if (stopped) return;

            console.error(`Micro arrêté (code ${code})`);

            if (restarts < MAX_RESTARTS) {
                restarts++;
                setTimeout(start, 3000);
            } else {
                onProblem(explain(errors));
            }
        });

        if (vocabulary) setVocabulary(vocabulary);
        if (source !== 'pc') listen(source);
    }

    // Mots que Whisper doit écrire en priorité (prénom, ville, jeux, applications)
    function setVocabulary(list) {
        vocabulary = list;
        write({ vocabulary: list });
    }

    const write = message => {
        if (child?.stdin.writable) child.stdin.write(`${JSON.stringify(message)}\n`);
    };

    // Micro écouté : celui du PC, ou celui du téléphone quand Robbie y est
    function listen(name) {
        source = name;
        write({ listen: name });
    }

    // Son reçu du téléphone (PCM 16 bits, 16 kHz, mono)
    function pushAudio(buffer) {
        write({ audio: buffer.toString('base64') });
    }

    function stop() {
        stopped = true;
        child?.kill();
    }

    start();
    return { setVocabulary, listen, pushAudio, stop };
}

module.exports = { createMicrophone };
