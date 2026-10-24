// Packs d'icônes et de curseurs (Réglages › Apparence) : ceux installés sur le système et ceux
// que la personne importe (une archive téléchargée, rangée dans ~/.local/share/icons),
// et leur application aux applis (gsettings), à l'interface et à labwc
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');

const SYSTEM_DIR = '/usr/share/icons';
const USER_DIR = path.join(os.homedir(), '.local', 'share', 'icons');
// (thèmes techniques, jamais proposés)
const HIDDEN = new Set(['default', 'hicolor', 'locolor', 'HighContrast']);

const run = (command, args, options = {}) => new Promise(resolve => {
    execFile(command, args, { timeout: 120000, ...options }, (error, stdout) => resolve(error ? null : stdout));
});

function readIndex(dir) {
    try {
        return fs.readFileSync(path.join(dir, 'index.theme'), 'utf8');
    } catch {
        return null;
    }
}

// Tous les dossiers de thème : ceux de la personne passent avant ceux du système
function themeDirs() {
    const dirs = new Map();
    for (const base of [SYSTEM_DIR, USER_DIR]) {
        let names = [];
        try {
            names = fs.readdirSync(base);
        } catch {
            continue;
        }
        for (const name of names) {
            if (!HIDDEN.has(name)) dirs.set(name, { name, dir: path.join(base, name), user: base === USER_DIR });
        }
    }
    return [...dirs.values()];
}

const prettyName = (theme, index) => (index?.match(/^Name\s*=\s*(.+)$/m)?.[1] || theme.name).trim();

// ---- Recherche d'une icône dans un thème (rangements « taille/type » ou « type/taille ») ----
const SIZES = ['scalable', '64x64', '64', '48x48', '48', '128x128', '96x96', '256x256', '32x32', '32'];
const KINDS = ['apps', 'places', 'devices', 'mimetypes', 'preferences', 'categories', 'applets', 'actions', 'status'];

function folders(themeName) {
    const theme = themeDirs().find(t => t.name === themeName);
    if (!theme) return [];
    return SIZES.flatMap(size => KINDS.flatMap(kind => [path.join(theme.dir, size, kind), path.join(theme.dir, kind, size)]));
}

function findIcon(themeName, name) {
    for (const folder of folders(themeName)) {
        for (const ext of ['.svg', '.png']) {
            const file = path.join(folder, name + ext);
            if (fs.existsSync(file)) return file;
        }
    }
    return null;
}

function dataUrl(file) {
    if (!file) return null;
    const type = file.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
    return `data:${type};base64,${fs.readFileSync(file).toString('base64')}`;
}

// Packs d'icônes, avec un aperçu de quatre icônes courantes
const PREVIEW = ['folder', 'user-home', 'utilities-terminal', 'firefox-esr', 'user-trash', 'image-viewer'];
function iconThemes() {
    return themeDirs()
        .map(theme => ({ theme, index: readIndex(theme.dir) }))
        .filter(({ index }) => index && /^Directories\s*=/m.test(index))
        .map(({ theme, index }) => ({
            id: theme.name,
            name: prettyName(theme, index),
            user: theme.user,
            preview: PREVIEW.map(name => findIcon(theme.name, name)).filter(Boolean).slice(0, 4).map(dataUrl)
        }))
        .filter(theme => theme.preview.length >= 2);
}

// Packs de curseurs : un dossier « cursors » à l'intérieur
function cursorThemes() {
    return themeDirs()
        .filter(theme => fs.existsSync(path.join(theme.dir, 'cursors', 'left_ptr')) || fs.existsSync(path.join(theme.dir, 'cursors', 'default')))
        .map(theme => ({ id: theme.name, name: prettyName(theme, readIndex(theme.dir)), user: theme.user }));
}

// ---- Importer une archive (.tar.gz, .tar.xz, .tar.bz2, .zip) ----
async function importArchive(file) {
    const work = await fsp.mkdtemp(path.join(os.tmpdir(), 'robbie-pack-'));
    try {
        const ok = /\.zip$/i.test(file)
            ? await run('python3', ['-I', '-c', 'import sys, zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])', file, work])
            : await run('tar', ['-xf', file, '-C', work, '--no-same-owner', '--no-same-permissions']);
        if (ok === null) return { installed: [], error: 'Archive illisible' };

        // Les thèmes de l'archive : chaque dossier qui contient un index.theme ou un dossier cursors
        const found = [];
        const walk = async (dir, depth) => {
            const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => []);
            const names = entries.map(e => e.name);
            if (depth > 0 && (names.includes('index.theme') || names.includes('cursors'))) return found.push(dir);
            if (depth < 3) for (const e of entries) if (e.isDirectory() && !e.isSymbolicLink()) await walk(path.join(dir, e.name), depth + 1);
        };
        await walk(work, 0);

        await fsp.mkdir(USER_DIR, { recursive: true });
        const installed = [];
        for (const dir of found) {
            const name = path.basename(dir).replace(/[^\w.+-]/g, '_');
            if (!name || HIDDEN.has(name)) continue;
            const target = path.join(USER_DIR, name);
            await fsp.rm(target, { recursive: true, force: true });
            await fsp.cp(dir, target, { recursive: true, verbatimSymlinks: true });
            await run('gtk-update-icon-cache', ['-f', '-q', target]);
            installed.push(name);
        }
        return { installed, error: installed.length ? null : 'Aucun pack d\'icônes ou de curseurs dans cette archive' };
    } finally {
        await fsp.rm(work, { recursive: true, force: true });
    }
}

// ---- Appliquer ----
const exists = id => themeDirs().some(t => t.name === id);

function applyIcons(id) {
    if (!exists(id)) return false;
    execFile('gsettings', ['set', 'org.gnome.desktop.interface', 'icon-theme', id], () => {});
    return true;
}

// Curseur : les applis tout de suite ; le pointeur du bureau (labwc) à la prochaine connexion
function applyCursor(id) {
    if (!cursorThemes().some(t => t.id === id)) return false;
    execFile('gsettings', ['set', 'org.gnome.desktop.interface', 'cursor-theme', id], () => {});
    const env = path.join(os.homedir(), '.config', 'robbie-os', 'labwc', 'environment');
    try {
        const text = fs.readFileSync(env, 'utf8');
        fs.writeFileSync(env, /^XCURSOR_THEME=/m.test(text) ? text.replace(/^XCURSOR_THEME=.*$/m, `XCURSOR_THEME=${id}`) : `${text}\nXCURSOR_THEME=${id}\n`);
    } catch {}
    return true;
}

module.exports = { iconThemes, cursorThemes, importArchive, applyIcons, applyCursor, findIcon, exists };
