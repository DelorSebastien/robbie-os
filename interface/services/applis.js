// Applis installées : lues dans les fichiers .desktop, comme le font les bureaux Linux
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');

const FOLDERS = [
    '/usr/share/applications',
    '/usr/local/share/applications',
    '/var/lib/flatpak/exports/share/applications',
    path.join(os.homedir(), '.local', 'share', 'applications')
];

const ICON_THEMES = ['Papirus-Dark', 'Papirus', 'Adwaita', 'hicolor'];
const ICON_SIZES = ['scalable', '256x256', '128x128', '96x96', '64x64', '48x48', '512x512'];
const ICON_FOLDERS = [
    ...ICON_THEMES.flatMap(theme => ['64x64', '48x48', 'scalable', '128x128'].map(size => `/usr/share/icons/${theme}/${size}/apps`)),
    ...ICON_SIZES.map(size => `/usr/share/icons/hicolor/${size}/apps`),
    '/usr/share/pixmaps'
];

// Rangement des applis par famille (catégories freedesktop)
const FAMILIES = [
    ['internet', /Network|WebBrowser|Email|Chat/],
    ['bureautique', /Office|TextEditor|WordProcessor|Spreadsheet/],
    ['multimedia', /Audio|Video|Graphics|Photography|Player/],
    ['developpement', /Development|IDE/],
    ['jeux', /Game/],
    ['systeme', /System|Settings|Utility|FileManager|TerminalEmulator/]
];

function parseDesktop(text) {
    const entry = {};
    let inEntry = false;

    for (const line of text.split('\n')) {
        if (line.startsWith('[')) {
            inEntry = line.trim() === '[Desktop Entry]';
            continue;
        }
        if (!inEntry) continue;

        const match = line.match(/^([\w-]+(?:\[[\w@.]+\])?)\s*=\s*(.*)$/);
        if (match) entry[match[1]] = match[2].trim();
    }

    return entry;
}

const iconCache = new Map();

// Icône en data URL (la page n'a pas le droit de lire les fichiers du système)
function iconData(name) {
    if (!name) return null;
    if (iconCache.has(name)) return iconCache.get(name);

    let file = null;
    if (path.isAbsolute(name) && fs.existsSync(name)) {
        file = name;
    } else {
        for (const folder of ICON_FOLDERS) {
            const found = ['.svg', '.png'].map(ext => path.join(folder, name + ext)).find(fs.existsSync);
            if (found) {
                file = found;
                break;
            }
        }
    }

    let data = null;
    if (file) {
        const type = file.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
        data = `data:${type};base64,${fs.readFileSync(file).toString('base64')}`;
    }

    iconCache.set(name, data);
    return data;
}

let cache = null;

function list() {
    if (cache) return cache;

    const byId = new Map();

    for (const folder of FOLDERS) {
        let names = [];
        try {
            names = fs.readdirSync(folder).filter(name => name.endsWith('.desktop'));
        } catch {
            continue;
        }

        for (const name of names) {
            const entry = parseDesktop(fs.readFileSync(path.join(folder, name), 'utf8'));
            if (entry.Type !== 'Application' || !entry.Exec) continue;
            if (entry.NoDisplay === 'true' || entry.Hidden === 'true') continue;

            const categories = entry.Categories || '';
            byId.set(name.replace(/\.desktop$/, ''), {
                id: name.replace(/\.desktop$/, ''),
                name: entry['Name[fr]'] || entry.Name || name,
                description: entry['Comment[fr]'] || entry.Comment || entry['GenericName[fr]'] || entry.GenericName || '',
                keywords: entry['Keywords[fr]'] || entry.Keywords || '',
                family: (FAMILIES.find(([, pattern]) => pattern.test(categories)) || ['autres'])[0],
                exec: entry.Exec,
                terminal: entry.Terminal === 'true',
                icon: iconData(entry.Icon)
            });
        }
    }

    cache = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    return cache;
}

function launch(id) {
    const app = list().find(item => item.id === id);
    if (!app) return false;

    // Les codes %f, %U... désignent des fichiers à ouvrir : aucun ici
    const command = app.exec.replace(/%[a-zA-Z%]/g, '').trim();
    const child = app.terminal
        ? spawn('foot', ['sh', '-c', command], { detached: true, stdio: 'ignore' })
        : spawn('sh', ['-c', command], { detached: true, stdio: 'ignore' });

    child.on('error', error => console.error(`Lancement impossible : ${app.name}`, error.message));
    child.unref();
    return true;
}

module.exports = { list, launch };
