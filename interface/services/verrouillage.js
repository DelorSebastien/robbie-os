// Verrouillage de l'écran : gtklock (vérifie le vrai mot de passe Linux, rien ne passe par-dessus),
// habillé aux couleurs de Robbie OS ; et verrouillage automatique après inactivité (swayidle)
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn, execFile } = require('node:child_process');
const notes = require('./notes');

const CACHE = path.join(os.homedir(), '.cache', 'robbie-os');
const STYLE = path.join(CACHE, 'verrou.css');
const BACKGROUND = path.join(CACHE, 'verrou-fond.jpg');
const REFERENCE = path.join(__dirname, '..', 'fonds', 'reference-temporaire.png');

// Style de l'écran de verrouillage : verre sombre, heure en Orbitron, champ et bouton cyan
const CSS = `
window { background-color: #050a16; }
#window-box {
    background-color: rgba(10, 16, 32, 0.55);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 26px;
    padding: 40px 48px;
}
#clock-label { font-family: Orbitron; font-size: 68px; font-weight: 500; color: #eef3fb; letter-spacing: 4px; }
#date-label { font-family: Inter; font-size: 15px; color: rgba(226, 234, 248, 0.8); margin-bottom: 18px; }
#input-label { font-family: Orbitron; font-size: 11px; letter-spacing: 3px; color: rgba(226, 234, 248, 0.6); }
#input-field {
    min-width: 260px;
    padding: 8px 14px;
    border-radius: 12px;
    background-color: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.14);
    color: #eef3fb;
    font-family: Inter;
    font-size: 15px;
}
#input-field:focus { border-color: rgba(94, 231, 255, 0.7); }
#unlock-button {
    border-radius: 12px;
    background-image: none;
    background-color: rgba(94, 231, 255, 0.85);
    color: #04121c;
    font-family: Orbitron;
    font-weight: 700;
    border: none;
    padding: 6px 16px;
}
#error-label, #warning-label { font-family: Inter; color: #ff8a8a; }
`;

const run = (command, args) => new Promise(resolve => {
    execFile(command, args, { timeout: 20000 }, error => resolve(!error));
});

// Fond : le fond d'écran flouté et assombri (verre dépoli). L'image de référence provisoire
// est d'abord recadrée pour cacher le dock et la barre qui y sont dessinés.
async function background() {
    const wallpaper = notes.getSettings().wallpaper || REFERENCE;
    if (!fs.existsSync(wallpaper)) return null;

    const stamp = `${wallpaper}:${fs.statSync(wallpaper).mtimeMs}`;
    const stampFile = `${BACKGROUND}.source`;
    if (fs.existsSync(BACKGROUND) && fs.existsSync(stampFile) && fs.readFileSync(stampFile, 'utf8') === stamp) return BACKGROUND;

    const crop = /reference-temporaire/.test(wallpaper) ? ['-gravity', 'NorthWest', '-crop', '94%x82%+0+0', '+repage'] : [];
    const ok = await run('convert', [wallpaper, ...crop, '-resize', '1920x1080^', '-blur', '0x16', '-fill', 'black', '-colorize', '35%', '-quality', '88', BACKGROUND]);
    if (ok) fs.writeFileSync(stampFile, stamp);
    return ok ? BACKGROUND : null;
}

let locking = false;

async function lock() {
    if (locking) return;
    locking = true;
    try {
        fs.mkdirSync(CACHE, { recursive: true });
        fs.writeFileSync(STYLE, CSS);
        const image = await background();
        const args = ['-d', '-s', STYLE, '-g', 'Robbie', '-t', '%H:%M', '-D', '%A %e %B', '-H', '-T', '15'];
        if (image) args.push('-b', image);
        const child = spawn('gtklock', args, { detached: true, stdio: 'ignore' });
        child.on('error', error => console.error('Verrouillage impossible :', error.message));
        child.unref();
    } finally {
        setTimeout(() => {
            locking = false;
        }, 2000);
    }
}

// Inactivité : verrouillage après N minutes (0 : jamais), et toujours avant la mise en veille.
// swayidle demande le verrouillage par le même chemin que Super+L.
let idle = null;
const LOCK_REQUEST = `sh -c 'echo verrouiller > "$HOME/.cache/robbie-os.commande"'`;

function watchIdle() {
    idle?.kill();
    idle = null;
    const minutes = Number(notes.getSettings().lockMinutes) || 0;
    const args = ['-w', 'before-sleep', LOCK_REQUEST];
    if (minutes > 0) args.unshift('timeout', String(minutes * 60), LOCK_REQUEST);

    idle = spawn('swayidle', args, { stdio: 'ignore' });
    idle.on('error', error => console.error('Surveillance d\'inactivité impossible :', error.message));
}

const stop = () => idle?.kill();

module.exports = { lock, watchIdle, stop };
