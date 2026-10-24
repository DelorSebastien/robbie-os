// Historique du presse-papiers (Super+V) : les 25 derniers textes copiés, gardés en mémoire
// seulement (rien n'est écrit sur le disque : on copie parfois des mots de passe)
const { spawn } = require('node:child_process');

const MAX = 25;
const MAX_LENGTH = 20000;
let history = [];
let watcher = null;

// wl-paste --watch lance une commande à chaque copie, le texte copié sur son entrée :
// on le reçoit encodé en base64, une ligne par copie
function watch(onChange) {
    if (watcher) return;
    watcher = spawn('wl-paste', ['--no-newline', '--type', 'text', '--watch', 'sh', '-c', 'base64 -w0; echo'], { stdio: ['ignore', 'pipe', 'ignore'] });
    watcher.on('error', error => console.error('Presse-papiers :', error.message));
    let buffer = '';
    watcher.stdout.on('data', chunk => {
        buffer += chunk;
        let line;
        while ((line = buffer.indexOf('\n')) >= 0) {
            const encoded = buffer.slice(0, line);
            buffer = buffer.slice(line + 1);
            const text = Buffer.from(encoded, 'base64').toString('utf8');
            if (!text.trim() || text.length > MAX_LENGTH) continue;
            history = [{ text, time: Date.now() }, ...history.filter(item => item.text !== text)].slice(0, MAX);
            onChange(history);
        }
    });
}

const list = () => history;

// Remet un texte de l'historique dans le presse-papiers
function copy(text) {
    if (!history.some(item => item.text === text)) return false;
    const child = spawn('wl-copy', [], { stdio: ['pipe', 'ignore', 'ignore'] });
    child.on('error', () => {});
    child.stdin.end(text);
    return true;
}

function clear() {
    history = [];
    spawn('wl-copy', ['--clear'], { stdio: 'ignore' }).on('error', () => {});
    return history;
}

function stop() {
    watcher?.kill();
    watcher = null;
}

module.exports = { watch, list, copy, clear, stop };
