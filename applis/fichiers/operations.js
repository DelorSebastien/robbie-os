// Opérations de l'explorateur : lister un dossier, icônes et miniatures, copier ou déplacer
// (avec progression), corbeille, renommer, propriétés, clés USB, signets
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');

const HOME = os.homedir();
const TRASH = path.join(HOME, '.local', 'share', 'Trash');
const BOOKMARKS = path.join(HOME, '.config', 'gtk-3.0', 'bookmarks');

const run = (command, args, timeout = 15000) => new Promise(resolve => {
    execFile(command, args, { timeout, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => resolve({ ok: !error, out: stdout || '', err: stderr || error?.message || '' }));
});

// ---- Dossiers personnels (Documents, Images…) ----
function userDirs() {
    const dirs = { HOME };
    try {
        const text = fs.readFileSync(path.join(HOME, '.config', 'user-dirs.dirs'), 'utf8');
        for (const [, name, value] of text.matchAll(/^XDG_(\w+)_DIR="(.+)"$/gm)) dirs[name] = value.replace('$HOME', HOME);
    } catch {}
    return dirs;
}

// ---- Type de fichier (d'après son extension) ----
const TYPES = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', avif: 'image/avif', tif: 'image/tiff', tiff: 'image/tiff', heic: 'image/heic', ico: 'image/x-icon',
    mp4: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska', mov: 'video/quicktime', avi: 'video/x-msvideo', m4v: 'video/mp4', ogv: 'video/ogg',
    mp3: 'audio/mpeg', ogg: 'audio/ogg', flac: 'audio/flac', wav: 'audio/x-wav', m4a: 'audio/mp4', opus: 'audio/ogg', m3u: 'audio/x-mpegurl',
    pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown', log: 'text/plain', csv: 'text/csv', json: 'application/json', xml: 'application/xml', html: 'text/html', htm: 'text/html', css: 'text/css',
    js: 'application/javascript', ts: 'text/x-typescript', py: 'text/x-python', sh: 'application/x-shellscript', c: 'text/x-csrc', h: 'text/x-chdr', cpp: 'text/x-c++src', java: 'text/x-java', php: 'application/x-php', rs: 'text/rust',
    odt: 'application/vnd.oasis.opendocument.text', ods: 'application/vnd.oasis.opendocument.spreadsheet', odp: 'application/vnd.oasis.opendocument.presentation',
    doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    zip: 'application/zip', gz: 'application/gzip', tgz: 'application/x-compressed-tar', xz: 'application/x-xz', bz2: 'application/x-bzip', '7z': 'application/x-7z-compressed', rar: 'application/vnd.rar', tar: 'application/x-tar', deb: 'application/vnd.debian.binary-package',
    iso: 'application/x-cd-image', exe: 'application/x-msdownload', appimage: 'application/vnd.appimage', desktop: 'application/x-desktop', ttf: 'font/ttf', otf: 'font/otf', epub: 'application/epub+zip'
};
function typeOf(name, isDir) {
    if (isDir) return 'inode/directory';
    const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
    return TYPES[ext] || 'application/octet-stream';
}

// Nom lisible d'un type, pour la vue en liste et les propriétés
const KIND_NAMES = { image: 'Image', video: 'Vidéo', audio: 'Audio', text: 'Texte', font: 'Police' };
function kindName(type) {
    if (type === 'inode/directory') return 'Dossier';
    if (type === 'application/pdf') return 'Document PDF';
    if (/opendocument\.text|wordprocessing|msword/.test(type)) return 'Document texte';
    if (/spreadsheet|excel/.test(type)) return 'Classeur';
    if (/presentation|powerpoint/.test(type)) return 'Présentation';
    if (/zip|gzip|tar|xz|bzip|7z|rar|compressed/.test(type)) return 'Archive';
    if (/debian|appimage|msdownload/.test(type)) return 'Logiciel';
    if (/javascript|python|shellscript|csrc|java|php|rust|typescript|json|xml|html|css/.test(type)) return 'Code';
    return KIND_NAMES[type.split('/')[0]] || 'Fichier';
}

// ---- Icônes : celles du thème de Robbie OS, puis Papirus et Adwaita ----
const ICON_DIRS = [
    '/usr/share/icons/Vivid-Glassy-Dark-Icons/places/64', '/usr/share/icons/Vivid-Glassy-Dark-Icons/mimetypes/64',
    '/usr/share/icons/Vivid-Glassy-Dark-Icons/devices/64',
    '/usr/share/icons/Papirus/64x64/places', '/usr/share/icons/Papirus/64x64/mimetypes', '/usr/share/icons/Papirus/64x64/devices',
    '/usr/share/icons/Adwaita/scalable/mimetypes', '/usr/share/icons/Adwaita/scalable/places'
];
const iconCache = new Map();
function iconData(names) {
    for (const name of names) {
        if (iconCache.has(name)) {
            if (iconCache.get(name)) return iconCache.get(name);
            continue;
        }
        let data = null;
        for (const dir of ICON_DIRS) {
            const file = ['.svg', '.png'].map(ext => path.join(dir, name + ext)).find(f => fs.existsSync(f));
            if (file) {
                data = `data:${file.endsWith('.svg') ? 'image/svg+xml' : 'image/png'};base64,${fs.readFileSync(file).toString('base64')}`;
                break;
            }
        }
        iconCache.set(name, data);
        if (data) return data;
    }
    return null;
}

const SPECIAL_ICONS = { HOME: 'user-home', DESKTOP: 'user-desktop', DOCUMENTS: 'folder-documents', PICTURES: 'folder-pictures', MUSIC: 'folder-music', VIDEOS: 'folder-videos', DOWNLOAD: 'folder-download', TEMPLATES: 'folder-templates', PUBLICSHARE: 'folder-publicshare' };
function iconFor(file, type) {
    if (type === 'inode/directory') {
        const dirs = userDirs();
        const special = Object.entries(dirs).find(([, dir]) => dir === file);
        return iconData([special && SPECIAL_ICONS[special[0]], 'folder'].filter(Boolean));
    }
    const [major] = type.split('/');
    return iconData([type.replace('/', '-'), `${major}-x-generic`, 'text-x-generic', 'unknown']);
}

// ---- Lister un dossier ----
async function list(dir, showHidden) {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    const items = [];
    await Promise.all(entries.map(async entry => {
        if (!showHidden && entry.name.startsWith('.')) return;
        const full = path.join(dir, entry.name);
        let stat;
        try {
            stat = await fsp.stat(full);
        } catch {
            stat = await fsp.lstat(full).catch(() => null);
        }
        if (!stat) return;
        const isDir = stat.isDirectory();
        const type = typeOf(entry.name, isDir);
        items.push({
            nom: entry.name,
            chemin: full,
            dossier: isDir,
            lien: entry.isSymbolicLink(),
            taille: isDir ? null : stat.size,
            modifie: stat.mtimeMs,
            type,
            genre: kindName(type),
            icone: iconFor(full, type),
            image: /^image\/(jpeg|png|webp|gif|bmp|avif|svg)/.test(type)
        });
    }));
    items.sort((a, b) => (b.dossier - a.dossier) || a.nom.localeCompare(b.nom, 'fr', { numeric: true, sensitivity: 'base' }));
    return items;
}

// ---- Copier, déplacer (avec progression) ----
// Nom libre dans le dossier d'arrivée : « photo (2).jpg »
function freeName(dir, name) {
    let target = path.join(dir, name);
    if (!fs.existsSync(target)) return target;
    const dot = name.lastIndexOf('.');
    const [base, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
    for (let n = 2; ; n++) {
        target = path.join(dir, `${base} (${n})${ext}`);
        if (!fs.existsSync(target)) return target;
    }
}

async function sizeOf(file) {
    const stat = await fsp.lstat(file).catch(() => null);
    if (!stat) return 0;
    if (!stat.isDirectory()) return stat.size;
    let total = 0;
    for (const name of await fsp.readdir(file).catch(() => [])) total += await sizeOf(path.join(file, name));
    return total;
}

async function copyTree(source, target, onBytes) {
    const stat = await fsp.lstat(source);
    if (stat.isSymbolicLink()) return fsp.symlink(await fsp.readlink(source), target);
    if (stat.isDirectory()) {
        await fsp.mkdir(target, { recursive: true });
        for (const name of await fsp.readdir(source)) await copyTree(path.join(source, name), path.join(target, name), onBytes);
        return;
    }
    await new Promise((resolve, reject) => {
        const input = fs.createReadStream(source);
        const output = fs.createWriteStream(target, { mode: stat.mode });
        input.on('data', chunk => onBytes(chunk.length));
        input.on('error', reject);
        output.on('error', reject);
        output.on('finish', resolve);
        input.pipe(output);
    });
}

// `move` : déplacer (un simple renommage sur le même disque) ; `onProgress(fait, total, nom)`
async function transfer(sources, destination, move, onProgress) {
    const total = (await Promise.all(sources.map(sizeOf))).reduce((a, b) => a + b, 0);
    let done = 0;
    const results = [];
    for (const source of sources) {
        const name = path.basename(source);
        // (glisser un dossier sur lui-même ou dans un de ses sous-dossiers : refusé)
        if (destination === source || destination.startsWith(source + path.sep)) throw new Error(`Impossible de mettre « ${name} » dans lui-même`);
        if (move && path.dirname(source) === destination) continue;
        const target = freeName(destination, name);
        if (move) {
            try {
                await fsp.rename(source, target);
                done += await sizeOf(target);
                onProgress(done, total, name);
                results.push(target);
                continue;
            } catch (error) {
                if (error.code !== 'EXDEV') throw error;
            }
        }
        await copyTree(source, target, bytes => {
            done += bytes;
            onProgress(done, total, name);
        });
        if (move) await fsp.rm(source, { recursive: true, force: true });
        results.push(target);
    }
    onProgress(total, total, '');
    return results;
}

// ---- Corbeille (dossier standard : files/ et info/*.trashinfo) ----
async function trashList() {
    const names = await fsp.readdir(path.join(TRASH, 'files')).catch(() => []);
    const items = [];
    for (const name of names) {
        const full = path.join(TRASH, 'files', name);
        const stat = await fsp.lstat(full).catch(() => null);
        if (!stat) continue;
        let origin = '', deleted = stat.mtimeMs;
        try {
            const info = await fsp.readFile(path.join(TRASH, 'info', name + '.trashinfo'), 'utf8');
            origin = decodeURIComponent(info.match(/^Path=(.*)$/m)?.[1] || '');
            const date = info.match(/^DeletionDate=(.*)$/m)?.[1];
            if (date) deleted = new Date(date).getTime();
        } catch {}
        const isDir = stat.isDirectory();
        const type = typeOf(name, isDir);
        items.push({ nom: name, chemin: full, dossier: isDir, taille: isDir ? null : stat.size, modifie: deleted, type, genre: kindName(type), icone: iconFor(full, type), origine: origin, corbeille: true });
    }
    return items.sort((a, b) => b.modifie - a.modifie);
}

async function restore(files) {
    for (const file of files) {
        const name = path.basename(file);
        const info = path.join(TRASH, 'info', name + '.trashinfo');
        const text = await fsp.readFile(info, 'utf8').catch(() => '');
        const origin = decodeURIComponent(text.match(/^Path=(.*)$/m)?.[1] || path.join(HOME, name));
        await fsp.mkdir(path.dirname(origin), { recursive: true });
        await fsp.rename(file, freeName(path.dirname(origin), path.basename(origin)));
        await fsp.rm(info, { force: true });
    }
}

async function deleteForever(files) {
    for (const file of files) {
        await fsp.rm(file, { recursive: true, force: true });
        if (path.dirname(file) === path.join(TRASH, 'files')) await fsp.rm(path.join(TRASH, 'info', path.basename(file) + '.trashinfo'), { force: true });
    }
}

async function emptyTrash() {
    for (const sub of ['files', 'info']) {
        for (const name of await fsp.readdir(path.join(TRASH, sub)).catch(() => [])) await fsp.rm(path.join(TRASH, sub, name), { recursive: true, force: true });
    }
}

// ---- Propriétés ----
async function properties(file) {
    const stat = await fsp.stat(file);
    const isDir = stat.isDirectory();
    const type = typeOf(path.basename(file), isDir);
    let count = null;
    if (isDir) count = (await fsp.readdir(file).catch(() => [])).length;
    return {
        nom: path.basename(file), chemin: file, dossier: isDir, genre: kindName(type), type,
        taille: await sizeOf(file), elements: count,
        modifie: stat.mtimeMs, cree: stat.birthtimeMs, acces: stat.atimeMs,
        icone: iconFor(file, type)
    };
}

// ---- Disques et clés USB ----
async function devices() {
    const { out } = await run('lsblk', ['-J', '-b', '-o', 'NAME,LABEL,SIZE,MOUNTPOINT,RM,HOTPLUG,TYPE,FSTYPE']);
    let tree;
    try {
        tree = JSON.parse(out).blockdevices || [];
    } catch {
        return [];
    }
    const found = [];
    const visit = (dev, removable) => {
        const isRemovable = removable || dev.rm || dev.hotplug;
        if (dev.type === 'part' || (dev.type === 'disk' && !dev.children)) {
            if (isRemovable && dev.fstype) {
                found.push({ device: `/dev/${dev.name}`, nom: dev.label || `Disque ${(dev.size / 1e9).toFixed(0)} Go`, taille: dev.size, monte: dev.mountpoint || null });
            }
        }
        (dev.children || []).forEach(child => visit(child, isRemovable));
    };
    tree.forEach(dev => visit(dev, false));
    return found;
}

async function mount(device) {
    const result = await run('udisksctl', ['mount', '-b', device, '--no-user-interaction'], 30000);
    const mountpoint = result.out.match(/ at (.+?)\.?\s*$/m)?.[1];
    return result.ok ? { ok: true, chemin: mountpoint } : { ok: false, erreur: result.err.trim() || 'Impossible d’ouvrir ce disque' };
}

async function eject(device) {
    const unmount = await run('udisksctl', ['unmount', '-b', device, '--no-user-interaction'], 30000);
    if (!unmount.ok && !/not mounted/i.test(unmount.err)) return { ok: false, erreur: 'Le disque est encore utilisé (un fichier ouvert ?)' };
    const disk = device.replace(/p?\d+$/, '');
    await run('udisksctl', ['power-off', '-b', disk, '--no-user-interaction'], 30000);
    return { ok: true };
}

async function diskSpace(dir) {
    try {
        const stat = await fsp.statfs(dir);
        return { libre: stat.bavail * stat.bsize, total: stat.blocks * stat.bsize };
    } catch {
        return null;
    }
}

// ---- Signets (partagés avec les autres applis GTK) ----
function bookmarks() {
    let text = '';
    try {
        text = fs.readFileSync(BOOKMARKS, 'utf8');
    } catch {}
    return text.split('\n').filter(line => line.startsWith('file://')).map(line => {
        const [uri, ...label] = line.split(' ');
        const file = decodeURIComponent(uri.slice(7));
        return { chemin: file, nom: label.join(' ') || path.basename(file) };
    }).filter(b => !b.chemin.endsWith('.desktop') && fs.existsSync(b.chemin))
        .map(b => ({ ...b, icone: iconFor(b.chemin, 'inode/directory') }));
}

function addBookmark(dir) {
    const uri = 'file://' + dir.split('/').map(encodeURIComponent).join('/');
    let text = '';
    try {
        text = fs.readFileSync(BOOKMARKS, 'utf8');
    } catch {}
    if (text.split('\n').some(line => line.split(' ')[0] === uri)) return;
    fs.mkdirSync(path.dirname(BOOKMARKS), { recursive: true });
    fs.writeFileSync(BOOKMARKS, (text && !text.endsWith('\n') ? text + '\n' : text) + uri + '\n');
}

function removeBookmark(dir) {
    const uri = 'file://' + dir.split('/').map(encodeURIComponent).join('/');
    try {
        const text = fs.readFileSync(BOOKMARKS, 'utf8');
        fs.writeFileSync(BOOKMARKS, text.split('\n').filter(line => line.split(' ')[0] !== uri).join('\n'));
    } catch {}
}

module.exports = {
    HOME, TRASH, userDirs, list, transfer, freeName, trashList, restore, deleteForever, emptyTrash,
    properties, devices, mount, eject, diskSpace, bookmarks, addBookmark, removeBookmark, iconData
};
