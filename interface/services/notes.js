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
    pinned: ['thunar', 'firefox-esr', 'foot', 'org.xfce.mousepad', 'robbie-logitheque'],
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

// La Logithèque arrive une fois dans le dock des comptes créés avant elle ; Photos (et l'ancienne
// visionneuse Ristretto) en part une fois : elle s'ouvre depuis l'explorateur (on peut la réépingler)
function migrate(settings) {
    if (!settings.logithequeProposee) {
        if (Array.isArray(settings.pinned) && !settings.pinned.includes('robbie-logitheque')) settings.pinned = [...settings.pinned, 'robbie-logitheque'];
        settings.logithequeProposee = true;
        save('reglages', settings);
    }
    if (!settings.photosDansExplorateur) {
        if (Array.isArray(settings.pinned)) settings.pinned = settings.pinned.filter(id => id !== 'robbie-photos' && id !== 'org.xfce.ristretto');
        settings.photosDansExplorateur = true;
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
