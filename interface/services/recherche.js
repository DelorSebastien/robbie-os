// Recherche de fichiers pour la recherche globale (Super+Espace) : les noms des fichiers et dossiers
// du dossier personnel (sauf cachés et dossiers de programmes), gardés en mémoire quelques minutes
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const HOME = os.homedir();
const SKIP = new Set(['node_modules', 'robbie-os', 'snap', '.venv', 'venv', '__pycache__']);
const MAX_ENTRIES = 30000;
const MAX_DEPTH = 7;
const FRESH = 3 * 60 * 1000;

let entries = [];
let builtAt = 0;
let building = null;

async function walk(dir, depth) {
    let list;
    try {
        list = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
        return;
    }
    for (const entry of list) {
        if (entries.length >= MAX_ENTRIES) return;
        if (entry.name.startsWith('.') || SKIP.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        const isDir = entry.isDirectory();
        entries.push({ path: full, name: entry.name, lower: entry.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''), isDir });
        if (isDir && depth < MAX_DEPTH) await walk(full, depth + 1);
    }
}

function index() {
    if (Date.now() - builtAt < FRESH) return Promise.resolve();
    if (!building) {
        building = (async () => {
            entries = [];
            await walk(HOME, 0);
            builtAt = Date.now();
        })().finally(() => { building = null; });
    }
    return building;
}

// Les meilleurs résultats : le nom commence par la recherche, puis la contient ; les dossiers d'abord à égalité
async function search(query) {
    const q = String(query).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    if (q.length < 2) return [];
    await index();
    return entries
        .map(entry => ({ entry, rank: entry.lower.startsWith(q) ? 0 : entry.lower.includes(q) ? 1 : -1 }))
        .filter(item => item.rank >= 0)
        .sort((a, b) => a.rank - b.rank || Number(b.entry.isDir) - Number(a.entry.isDir) || a.entry.name.length - b.entry.name.length)
        .slice(0, 8)
        .map(({ entry }) => ({ path: entry.path, name: entry.name, isDir: entry.isDir, dir: path.dirname(entry.path).replace(HOME, '~') }));
}

// Ouvre un résultat (seulement un fichier trouvé par la recherche) : dossiers dans l'explorateur
function open(file) {
    const entry = entries.find(item => item.path === file);
    if (!entry) return false;
    const [command, args] = entry.isDir ? ['thunar', [file]] : ['xdg-open', [file]];
    spawn(command, args, { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
    return true;
}

module.exports = { search, open, warm: index };
