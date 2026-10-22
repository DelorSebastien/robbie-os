// Réglages de Robbie, modifiables depuis la fenêtre de réglages (icône près de l'horloge)
const path = require('node:path');
const fs = require('node:fs');

// Valeur par défaut et limites de chaque réglage
const DEFAULTS = {
    voice: 'fr-FR-HenriNeural',
    rate: 8,                 // vitesse de la voix (%)
    pitch: 10,               // hauteur de la voix (Hz)
    wakeWord: true,          // il faut dire « Robbie » pour lui parler
    initiatives: true,       // Robbie engage la conversation de lui-même
    initiativeMinutes: 15,   // temps moyen entre deux initiatives
    health: true,            // rappels santé (eau, pause, étirements)
    healthMinutes: 45,       // temps devant l'écran avant un rappel santé
    morning: true,           // bonjour du matin
    autoSleepMinutes: 5,     // inactivité avant de s'endormir
    size: 1,                 // taille de la fenêtre (1, 1.5 ou 2)
    skin: 'auto',            // skin : selon la date, aucun, citrouille, bonnet, fête
    eyeColor: 'cyan',        // couleur des yeux au repos
    dance: true,             // danse sur la musique
    startWithWindows: false,
    dnd: false,              // ne pas déranger : Robbie ne parle que si on l'appelle
    city: '',                // ville de l'utilisateur (météo)
    brain: 'gemma3:4b',      // modèle de conversation (voir CHOICES)
    tourDone: false,         // visite guidée déjà faite (sinon, elle se lance au démarrage)
    phoneToken: ''           // code secret du téléphone (Robbie OS), créé au premier lancement
};

const LIMITS = {
    rate: [-30, 40],
    pitch: [-30, 40],
    initiativeMinutes: [5, 120],
    healthMinutes: [15, 180],
    autoSleepMinutes: [1, 60],
    size: [1, 2]
};

// Valeurs possibles des réglages à choix
const CHOICES = {
    skin: ['auto', 'none', 'pumpkin', 'santa', 'party'],
    eyeColor: ['cyan', 'green', 'pink', 'gold', 'purple', 'white'],
    // gemma3:4b : rapide et tient avec Whisper dans 8 Go ; qwen3:8b : plus malin mais
    // la carte graphique sature avec Whisper (1,5 à 3 s avant de répondre au lieu de 0,3 s)
    brain: ['gemma3:4b', 'qwen3:8b']
};

// Voix françaises proposées (sans les voix « Multilingual » qui changent d'accent)
const VOICES = [
    { name: 'fr-FR-HenriNeural', label: 'Henri (France, homme)' },
    { name: 'fr-FR-DeniseNeural', label: 'Denise (France, femme)' },
    { name: 'fr-FR-EloiseNeural', label: 'Éloïse (France, voix jeune)' },
    { name: 'fr-CA-AntoineNeural', label: 'Antoine (Québec, homme)' },
    { name: 'fr-CA-JeanNeural', label: 'Jean (Québec, homme)' },
    { name: 'fr-CA-SylvieNeural', label: 'Sylvie (Québec, femme)' },
    { name: 'fr-BE-GerardNeural', label: 'Gérard (Belgique, homme)' },
    { name: 'fr-BE-CharlineNeural', label: 'Charline (Belgique, femme)' },
    { name: 'fr-CH-FabriceNeural', label: 'Fabrice (Suisse, homme)' },
    { name: 'fr-CH-ArianeNeural', label: 'Ariane (Suisse, femme)' }
];

function createSettings(app) {
    const file = path.join(app.getPath('userData'), 'settings.json');
    const values = { ...DEFAULTS };
    const listeners = [];

    try {
        const saved = JSON.parse(fs.readFileSync(file, 'utf8'));

        update(saved, false);
    } catch {
        // Premier lancement : valeurs par défaut
    }

    // Seuls les réglages connus, du bon type et dans les limites sont acceptés
    function update(changes, save = true) {
        const applied = {};

        for (const [key, value] of Object.entries(changes || {})) {
            if (!(key in DEFAULTS) || typeof value !== typeof DEFAULTS[key]) continue;

            let clean = value;

            if (typeof value === 'number') {
                if (!Number.isFinite(value)) continue;
                const [min, max] = LIMITS[key] || [-Infinity, Infinity];
                clean = Math.min(max, Math.max(min, value));
            }

            if (typeof value === 'string') clean = value.trim().slice(0, 80);
            if (key === 'voice' && !VOICES.some(v => v.name === clean)) continue;
            if (CHOICES[key] && !CHOICES[key].includes(clean)) continue;

            if (values[key] !== clean) {
                values[key] = clean;
                applied[key] = clean;
            }
        }

        if (save && Object.keys(applied).length) {
            fs.writeFile(file, JSON.stringify(values, null, 2), error => {
                if (error) console.error('Erreur réglages :', error.message);
            });

            listeners.forEach(listener => listener(values, applied));
        }

        return applied;
    }

    return {
        get: () => values,
        update,
        onChange: listener => listeners.push(listener),
        voices: VOICES
    };
}

module.exports = { createSettings };
