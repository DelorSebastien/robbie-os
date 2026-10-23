// Réglages du système : fonds d'écran, voix de Robbie, écran, informations sur la machine
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const IMAGE = /\.(jpe?g|png|webp|avif)$/i;

const run = (command, args) => new Promise(resolve => {
    execFile(command, args, { timeout: 5000 }, (error, stdout) => resolve(error ? null : stdout));
});

// Dossiers où l'on cherche des fonds d'écran (et seuls fichiers que la page a le droit d'afficher)
function wallpaperFolders() {
    const pictures = path.join(os.homedir(), 'Images');
    return [path.join(ROOT, 'interface', 'fonds'), path.join(ROOT, 'assets', 'fonds'), path.join(pictures, "Fonds d'écran"), pictures];
}

function wallpapers() {
    const list = [];
    for (const folder of wallpaperFolders()) {
        let names = [];
        try {
            names = fs.readdirSync(folder);
        } catch {
            continue;
        }
        for (const name of names) {
            if (IMAGE.test(name)) list.push({ path: path.join(folder, name), name: name.replace(/\.[^.]+$/, '') });
        }
    }
    return list;
}

// Un fichier peut-il être servi comme fond d'écran ? (uniquement les images des dossiers prévus)
function isWallpaper(file) {
    const resolved = path.resolve(file);
    return IMAGE.test(resolved) && wallpaperFolders().some(folder => resolved.startsWith(folder + path.sep));
}

// Voix installées (fichiers .onnx de Piper)
function voices() {
    try {
        return fs.readdirSync(path.join(ROOT, 'robbie', 'voix'))
            .filter(name => name.endsWith('.onnx'))
            .map(name => name.replace(/\.onnx$/, ''));
    } catch {
        return [];
    }
}

// Écrans et résolutions (wlr-randr)
async function displays() {
    const output = await run('wlr-randr', ['--json']);
    if (!output) return [];
    try {
        return JSON.parse(output).map(screen => {
            // Une même taille existe à plusieurs fréquences : on n'en garde qu'une, active si l'une l'est
            const sizes = new Map();
            for (const m of screen.modes || []) {
                const key = `${m.width}x${m.height}`;
                const known = sizes.get(key);
                sizes.set(key, { width: m.width, height: m.height, current: Boolean(m.current) || Boolean(known?.current) });
            }
            // (les écrans virtuels n'ont ni marque ni modèle : « (null) (null) »)
            const description = String(screen.description || '').replace(/\(null\)/g, '').replace(/[()]/g, '').trim();
            return {
                name: screen.name,
                description: /^virtual/i.test(screen.name) ? `Écran virtuel (${screen.name})` : (description || screen.name),
                modes: [...sizes.values()].sort((a, b) => b.width * b.height - a.width * a.height)
            };
        });
    } catch {
        return [];
    }
}

async function setResolution(name, width, height) {
    return (await run('wlr-randr', ['--output', String(name), '--mode', `${Number(width)}x${Number(height)}`])) != null;
}

async function systemInfo() {
    const release = fs.existsSync('/etc/os-release') ? fs.readFileSync('/etc/os-release', 'utf8') : '';
    const pretty = release.match(/^PRETTY_NAME="?([^"\n]+)/m)?.[1] || os.type();
    let disk = null;
    try {
        const stats = fs.statfsSync('/');
        disk = { total: stats.blocks * stats.bsize, free: stats.bavail * stats.bsize };
    } catch {
        // pas de statfs (aperçu Windows)
    }
    return {
        version: require(path.join(ROOT, 'package.json')).version,
        base: pretty,
        kernel: os.release(),
        cpu: os.cpus()[0]?.model?.replace(/\s+/g, ' ').trim() || '',
        cores: os.cpus().length,
        memory: os.totalmem(),
        disk,
        hostname: os.hostname(),
        uptime: os.uptime()
    };
}

// Ville de la météo : recherche par nom (Open-Meteo), en France d'abord
async function searchCity(name) {
    const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=5&language=fr`,
        { signal: AbortSignal.timeout(8000) });
    const { results = [] } = await response.json();
    const place = results.find(r => r.country_code === 'FR') || results[0];
    return place ? { name: place.name, region: place.admin1 || place.country || '', latitude: place.latitude, longitude: place.longitude } : null;
}

module.exports = { wallpapers, isWallpaper, voices, displays, setResolution, systemInfo, searchCity };
