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
    pinned: ['thunar', 'firefox-esr', 'foot', 'org.xfce.mousepad', 'robbie-photos', 'robbie-logitheque'],
    // Fond d'écran (chemin d'une image), voix de Robbie, sensibilité du micro, verrouillage
    wallpaper: null,
    theme: 'sombre',
    barre: 'droite',
    dockTaille: 'moyen',
    pleinEcran: false,
    iconTheme: 'Vivid-Glassy-Dark-Icons',
    iconThemeClair: '',
    cursorTheme: 'Bibata-Modern-Classic',
    voice: 'fr_FR-siwis-medium',
    robotVoice: true,
    voiceThreshold: 150,
    lockMinutes: 0
};

// La visionneuse Ristretto a été remplacée par l'appli Photos : elle garde sa place dans le dock.
// La Logithèque arrive une fois dans le dock des comptes créés avant elle (on peut ensuite l'en retirer)
function migrate(settings) {
    if (Array.isArray(settings.pinned)) settings.pinned = settings.pinned.map(id => (id === 'org.xfce.ristretto' ? 'robbie-photos' : id));
    if (!settings.logithequeProposee) {
        if (Array.isArray(settings.pinned) && !settings.pinned.includes('robbie-logitheque')) settings.pinned = [...settings.pinned, 'robbie-logitheque'];
        settings.logithequeProposee = true;
        save('reglages', settings);
    }
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
    getSettings: () => migrate({ ...DEFAULT_SETTINGS, ...load('reglages', {}) }),
    setSettings: changes => save('reglages', { ...DEFAULT_SETTINGS, ...load('reglages', {}), ...changes })
};
