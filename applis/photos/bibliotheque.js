// Photothèque : toutes les photos et vidéos du dossier personnel (sauf dossiers cachés et
// dossiers système), avec leur date de prise de vue (EXIF), des miniatures en cache,
// et ce que la personne y ajoute : favoris, albums, retouches (l'original n'est jamais modifié)
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const exifr = require('exifr');

const HOME = os.homedir();
const CACHE = path.join(HOME, '.cache', 'robbie-os', 'photos');
const THUMBS = path.join(CACHE, 'miniatures');
const INDEX_FILE = path.join(CACHE, 'index.json');
const STORE_FILE = path.join(HOME, '.config', 'robbie-os', 'photos.json');

const PHOTO = /\.(jpe?g|png|webp|gif|bmp|avif|tiff?)$/i;
const VIDEO = /\.(mp4|webm|m4v|mov|ogv)$/i;
// Dossiers jamais parcourus : cachés (.config, .cache…), et ceux des programmes
const SKIP = new Set(['node_modules', 'robbie-os', 'snap', '.venv', 'venv', '__pycache__']);
const MAX_DEPTH = 8;
// (en dessous, ce sont des icônes ou des images d'interface, pas des photos)
const MIN_SIZE = 12 * 1024;

const picturesDir = () => folder('PICTURES', 'Images');
const importDir = () => path.join(picturesDir(), 'Importées');

function folder(name, fallback) {
    try {
        const file = fs.readFileSync(path.join(HOME, '.config', 'user-dirs.dirs'), 'utf8');
        const match = file.match(new RegExp(`XDG_${name}_DIR="(.+)"`));
        if (match) return match[1].replace('$HOME', HOME);
    } catch {}
    return path.join(HOME, fallback);
}

// ---- Parcours du dossier personnel ----
async function walk(dir, depth, found) {
    let entries;
    try {
        entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
        return;
    }
    for (const entry of entries) {
        if (entry.name.startsWith('.') || SKIP.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory() && depth < MAX_DEPTH) await walk(full, depth + 1, found);
        else if (entry.isFile() && (PHOTO.test(entry.name) || VIDEO.test(entry.name))) found.push(full);
    }
}

// ---- Informations sur chaque fichier (gardées en cache, relues seulement s'il a changé) ----
let index = {};
try {
    index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
} catch {}

async function describe(file) {
    const stat = await fsp.stat(file);
    if (stat.size < MIN_SIZE) return null;
    const known = index[file];
    if (known && known.mtime === stat.mtimeMs) return known;

    const kind = VIDEO.test(file) ? 'video' : 'photo';
    const info = { path: file, name: path.basename(file), kind, size: stat.size, mtime: stat.mtimeMs, date: stat.mtimeMs };
    if (kind === 'photo') {
        try {
            const exif = await exifr.parse(file, ['DateTimeOriginal', 'CreateDate', 'Make', 'Model', 'ExifImageWidth', 'ExifImageHeight', 'ISO', 'FNumber', 'ExposureTime', 'FocalLength']);
            const taken = exif?.DateTimeOriginal || exif?.CreateDate;
            if (taken instanceof Date && !isNaN(taken)) info.date = taken.getTime();
            if (exif?.Model) info.camera = [exif.Make, exif.Model].filter(Boolean).join(' ').replace(/^(\w+) \1 /i, '$1 ');
            if (exif?.ExifImageWidth) info.dimensions = `${exif.ExifImageWidth} × ${exif.ExifImageHeight}`;
            if (exif?.FNumber) info.reglages = [exif.FocalLength && `${Math.round(exif.FocalLength)} mm`, `ƒ/${exif.FNumber}`,
                exif.ExposureTime && (exif.ExposureTime < 1 ? `1/${Math.round(1 / exif.ExposureTime)} s` : `${exif.ExposureTime} s`),
                exif.ISO && `ISO ${exif.ISO}`].filter(Boolean).join(' · ');
        } catch {}
    }
    index[file] = info;
    return info;
}

let library = [];
let scanning = null;

async function scan() {
    if (scanning) return scanning;
    scanning = (async () => {
        const files = [];
        await walk(HOME, 0, files);
        const list = [];
        for (const file of files) {
            try {
                const info = await describe(file);
                if (info) list.push(info);
            } catch {}
        }
        // (on oublie les fichiers qui n'existent plus)
        index = Object.fromEntries(list.map(info => [info.path, info]));
        await fsp.mkdir(CACHE, { recursive: true });
        await fsp.writeFile(INDEX_FILE, JSON.stringify(index));
        // Collections automatiques : importées (Images › Importées) et captures d'écran
        const imported = importDir() + path.sep;
        library = list.map(info => ({
            ...info,
            imported: info.path.startsWith(imported) ? path.relative(importDir(), info.path).split(path.sep)[0] : null,
            capture: /^(capture|screenshot|capture d.écran)/i.test(info.name) || /captures? d.écran|screenshots/i.test(path.dirname(info.path))
        })).sort((a, b) => b.date - a.date);
        return library;
    })();
    try {
        return await scanning;
    } finally {
        scanning = null;
    }
}

// Changements dans le dossier personnel (photo ajoutée, supprimée…) : on reparcourt, sans se presser
function watch(onChange) {
    let timer = null;
    try {
        fs.watch(HOME, { recursive: true }, (_event, name) => {
            if (!name || name.split(path.sep).some(part => part.startsWith('.') || SKIP.has(part))) return;
            if (!PHOTO.test(name) && !VIDEO.test(name) && path.extname(name)) return;
            clearTimeout(timer);
            timer = setTimeout(async () => onChange(await scan()), 1500);
        });
    } catch (error) {
        console.error('Surveillance du dossier personnel impossible :', error.message);
    }
}

// ---- Miniatures (ImageMagick : redresse aussi les photos prises de travers) ----
const queue = [];
let running = 0;

function thumbnail(file) {
    const id = crypto.createHash('sha1').update(`${file}:${index[file]?.mtime || 0}`).digest('hex');
    const target = path.join(THUMBS, `${id}.jpg`);
    if (fs.existsSync(target)) return Promise.resolve(target);
    return new Promise(resolve => {
        queue.push({ file, target, resolve });
        pump();
    });
}

function pump() {
    while (running < 3 && queue.length) {
        const { file, target, resolve } = queue.shift();
        running++;
        fs.mkdirSync(THUMBS, { recursive: true });
        execFile('convert', [`${file}[0]`, '-auto-orient', '-thumbnail', '480x480^', '-quality', '82', target], { timeout: 30000 }, error => {
            running--;
            resolve(error ? null : target);
            pump();
        });
    }
}

// ---- Favoris, albums, retouches ----
let store = { favoris: [], albums: [], retouches: {} };
try {
    store = { ...store, ...JSON.parse(fs.readFileSync(STORE_FILE, 'utf8')) };
} catch {}

function save() {
    fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
    fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
    return store;
}

const getStore = () => store;

function toggleFavorite(files, on) {
    const set = new Set(store.favoris);
    for (const file of files) on ? set.add(file) : set.delete(file);
    store.favoris = [...set];
    return save();
}

function createAlbum(name) {
    const album = { id: crypto.randomUUID(), nom: String(name).trim().slice(0, 60) || 'Nouvel album', photos: [], cree: Date.now() };
    store.albums.push(album);
    save();
    return album;
}

function renameAlbum(id, name) {
    const album = store.albums.find(a => a.id === id);
    if (album) album.nom = String(name).trim().slice(0, 60) || album.nom;
    return save();
}

function deleteAlbum(id) {
    store.albums = store.albums.filter(a => a.id !== id);
    return save();
}

function addToAlbum(id, files) {
    const album = store.albums.find(a => a.id === id);
    if (album) album.photos = [...new Set([...album.photos, ...files])];
    return save();
}

function removeFromAlbum(id, files) {
    const album = store.albums.find(a => a.id === id);
    if (album) album.photos = album.photos.filter(file => !files.includes(file));
    return save();
}

// Retouches : rotation, recadrage, réglages et filtre, appliqués à l'affichage seulement
function setEdits(file, edits) {
    if (edits && Object.keys(edits).length) store.retouches[file] = edits;
    else delete store.retouches[file];
    return save();
}

// ---- Importer : les photos sont copiées dans Images › Importées › date du jour ----
async function importFiles(sources) {
    const files = [];
    for (const source of sources) {
        const stat = await fsp.stat(source).catch(() => null);
        if (stat?.isDirectory()) await walk(source, 0, files);
        else if (stat && (PHOTO.test(source) || VIDEO.test(source))) files.push(source);
    }
    const day = new Date().toISOString().slice(0, 10);
    const target = path.join(importDir(), day);
    await fsp.mkdir(target, { recursive: true });
    let count = 0;
    for (const file of files) {
        let name = path.basename(file);
        // (même nom déjà présent : « photo (2).jpg »)
        for (let n = 2; fs.existsSync(path.join(target, name)); n++) {
            const ext = path.extname(file);
            name = `${path.basename(file, ext)} (${n})${ext}`;
        }
        try {
            await fsp.copyFile(file, path.join(target, name));
            const { atime, mtime } = await fsp.stat(file);
            await fsp.utimes(path.join(target, name), atime, mtime);
            count++;
        } catch {}
    }
    await scan();
    return { count, folder: target };
}

// Copie retouchée : enregistrée à côté de l'original
async function saveCopy(file, buffer) {
    const ext = path.extname(file);
    let target = path.join(path.dirname(file), `${path.basename(file, ext)} (retouchée).jpg`);
    for (let n = 2; fs.existsSync(target); n++) target = path.join(path.dirname(file), `${path.basename(file, ext)} (retouchée ${n}).jpg`);
    await fsp.writeFile(target, Buffer.from(buffer));
    await scan();
    return target;
}

const isInLibrary = file => library.some(info => info.path === file);

module.exports = {
    scan, watch, thumbnail, getStore, toggleFavorite, createAlbum, renameAlbum, deleteAlbum,
    addToAlbum, removeFromAlbum, setEdits, importFiles, saveCopy, isInLibrary, importDir, picturesDir
};
