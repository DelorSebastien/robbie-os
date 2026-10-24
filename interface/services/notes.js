// Notes rapides, et réglages de l'interface : enregistrés dans ~/.config/robbie-os
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const FOLDER = path.join(os.homedir(), '.config', 'robbie-os');

function load(name, fallback) {
    try {
        return JSON.parse(fs.readFileSync(path.join(FOLDER, `${name}.json`), 'utf8'));
    } catch {
        return fallback;
    }
}

// Écriture dans un fichier temporaire puis renommage : jamais de fichier à moitié écrit
function save(name, data) {
    fs.mkdirSync(FOLDER, { recursive: true });
    const file = path.join(FOLDER, `${name}.json`);
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(data, null, 2));
    fs.renameSync(`${file}.tmp`, file);
    return data;
}

const DEFAULT_SETTINGS = {
    // Ville de la météo (changeable dans les réglages)
    place: { name: 'Carpentras', latitude: 44.0556, longitude: 5.0481 },
    eyeColor: 'cyan',
    skin: 'none',
    doNotDisturb: false,
    pinned: ['nemo', 'firefox-esr', 'foot', 'org.xfce.mousepad', 'org.xfce.ristretto'],
    // Fond d'écran (chemin d'une image), voix de Robbie, sensibilité du micro, verrouillage
    wallpaper: null,
    voice: 'fr_FR-siwis-medium',
    robotVoice: true,
    voiceThreshold: 150,
    lockMinutes: 0
};

// L'explorateur Thunar a été remplacé par Nemo : il garde sa place dans le dock
function withNemo(settings) {
    if (Array.isArray(settings.pinned)) settings.pinned = settings.pinned.map(id => (id === 'thunar' ? 'nemo' : id));
    return settings;
}

module.exports = {
    getNotes: () => load('notes', []),
    setNotes: notes => save('notes', Array.isArray(notes) ? notes.slice(0, 200) : []),
    // Agenda : { "AAAA-MM-JJ": [{ heure, texte }] }
    getAgenda: () => load('agenda', {}),
    setAgenda: agenda => save('agenda', agenda && typeof agenda === 'object' ? agenda : {}),
    getContacts: () => load('contacts', []),
    setContacts: contacts => save('contacts', Array.isArray(contacts) ? contacts.slice(0, 30) : []),
    getSettings: () => withNemo({ ...DEFAULT_SETTINGS, ...load('reglages', {}) }),
    setSettings: changes => save('reglages', { ...DEFAULT_SETTINGS, ...load('reglages', {}), ...changes })
};
