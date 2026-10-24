// Verrouillage de l'écran : gtklock (vérifie le vrai mot de passe Linux, rien ne passe par-dessus),
// habillé aux couleurs de Robbie OS ; et verrouillage automatique après inactivité (swayidle)
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn, execFile } = require('node:child_process');
const notes = require('./notes');
const soleil = require('../js/soleil');

const CACHE = path.join(os.homedir(), '.cache', 'robbie-os');
const STYLE = path.join(CACHE, 'verrou.css');
const BACKGROUND = path.join(CACHE, 'verrou-fond.jpg');
const ROOT = path.join(__dirname, '..', '..');

// Style de l'écran de verrouillage, comme l'écran de connexion : l'heure en grand (Orbitron),
// une carte du verre épais de Robbie OS, le champ et le bouton à la couleur d'accent ;
// la musique en cours et le compte viennent des modules de gtklock
const CSS = `
window { background-color: #050a16; }
#window-box {
    background-color: rgba(10, 16, 32, 0.66);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 20px;
    padding: 36px 44px;
}
#clock-label { font-family: Orbitron; font-size: 96px; font-weight: 500; color: #eef3fb; letter-spacing: 6px; }
#date-label { font-family: Inter; font-size: 16px; color: rgba(226, 234, 248, 0.8); margin-bottom: 18px; }
#user-name { font-family: Orbitron; font-size: 13px; letter-spacing: 3px; color: #eef3fb; }
#user-image { border-radius: 50%; }
#playerctl-revealer, #playerctl-box { margin-top: 16px; }
#playerctl-box { background-color: rgba(255, 255, 255, 0.06); border-radius: 14px; padding: 10px 14px; }
#label-title, #title-label { font-family: Inter; font-weight: 600; color: #eef3fb; }
#label-artist, #artist-label { font-family: Inter; color: rgba(226, 234, 248, 0.7); }
#playerctl-box button { border-radius: 50%; background-image: none; background-color: rgba(255, 255, 255, 0.08); border: none; color: #eef3fb; }
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

// Modules de gtklock : le compte (nom et photo) et la musique en cours
const MODULES = ['userinfo', 'playerctl'].map(name => `/usr/lib/x86_64-linux-gnu/gtklock/${name}-module.so`);

const run = (command, args) => new Promise(resolve => {
    execFile(command, args, { timeout: 20000 }, error => resolve(!error));
});

// Fond : le fond d'écran flouté et assombri (verre dépoli) ; pour le fond au fil du jour,
// la photo du moment. L'image de référence provisoire est d'abord recadrée pour cacher
// le dock et la barre qui y sont dessinés.
async function background() {
    const { wallpaper: chosen, place } = notes.getSettings();
    const wallpaper = !chosen || chosen === 'jour'
        ? path.join(ROOT, soleil.DOSSIER, `${soleil.current(new Date(), place.latitude, place.longitude)}.png`)
        : chosen;
    if (!fs.existsSync(wallpaper)) return null;

    // La météo du moment, écrite en bas à gauche du fond (gtklock n'a pas de module météo)
    let weather = '';
    try {
        const now = await require('./meteo').current(place);
        weather = `${now.temperature}°  ${now.label} · ${now.city}`;
    } catch {}

    const stamp = `${wallpaper}:${fs.statSync(wallpaper).mtimeMs}:${weather}`;
    const stampFile = `${BACKGROUND}.source`;
    if (fs.existsSync(BACKGROUND) && fs.existsSync(stampFile) && fs.readFileSync(stampFile, 'utf8') === stamp) return BACKGROUND;

    const crop = /reference-temporaire/.test(wallpaper) ? ['-gravity', 'NorthWest', '-crop', '94%x82%+0+0', '+repage'] : [];
    const text = weather ? ['-gravity', 'SouthWest', '-font', 'Inter', '-pointsize', '30', '-fill', 'rgba(238,243,251,0.92)', '-annotate', '+64+56', weather] : [];
    const ok = await run('convert', [wallpaper, ...crop, '-resize', '1920x1080^', '-gravity', 'center', '-extent', '1920x1080', '-blur', '0x16', '-fill', 'black', '-colorize', '35%', ...text, '-quality', '88', BACKGROUND]);
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
        for (const module of MODULES) if (fs.existsSync(module)) args.push('-m', module);
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
