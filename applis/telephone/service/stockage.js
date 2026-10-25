// Ce que le téléphone garde : messages (SMS et Robbie OS), journal d'appels, téléphones et
// ordinateurs reliés. Dans ~/.local/share/robbie-os/telephone (ROBBIE_TELEPHONE_DIR pour les essais)
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DIR = process.env.ROBBIE_TELEPHONE_DIR || path.join(os.homedir(), '.local', 'share', 'robbie-os', 'telephone');
const CONTACTS = process.env.ROBBIE_CONTACTS || path.join(os.homedir(), '.config', 'robbie-os', 'contacts.json');
const MAX_MESSAGES = 20000;
const MAX_CALLS = 1000;

fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });

function read(name, fallback) {
    try {
        return JSON.parse(fs.readFileSync(path.join(DIR, name), 'utf8'));
    } catch {
        return fallback;
    }
}

// Écriture dans un fichier temporaire puis renommage : jamais de fichier à moitié écrit
function write(file, data) {
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(data), { mode: 0o600 });
    fs.renameSync(`${file}.tmp`, file);
}

// Les gros fichiers sont écrits un peu plus tard, une seule fois pour plusieurs changements
const pending = new Map();
function save(name, data, now = false) {
    clearTimeout(pending.get(name));
    pending.delete(name);
    if (now) return write(path.join(DIR, name), data);
    pending.set(name, setTimeout(() => {
        pending.delete(name);
        write(path.join(DIR, name), data);
    }, 400));
}
function flush() {
    for (const [name, timer] of pending) {
        clearTimeout(timer);
        pending.delete(name);
        write(path.join(DIR, name), name === 'messages.json' ? messages : name === 'appels.json' ? calls : null);
    }
}

let messages = read('messages.json', []);
let calls = read('appels.json', []);
const settings = { favoris: [], appareils: [], pairs: [], ...read('reglages.json', {}) };

// Numéros : on compare les 9 derniers chiffres (06 12…, +33 6 12… et 0033 6 12… sont le même)
const digits = number => String(number || '').replace(/[^\d]/g, '');
const numberKey = number => digits(number).slice(-9);

module.exports = {
    DIR,
    numberKey,
    flush,

    // ---- Messages : { id, canal: 'sms'|'robbie', adresse, sens: 'recu'|'envoye', texte, date, etat, lu, piece } ----
    messages: () => messages,
    addMessage(message) {
        // (un SMS déjà connu, revenu dans une synchronisation, n'est pas doublé)
        if (message.ref && messages.some(m => m.ref === message.ref && m.canal === message.canal)) return null;
        messages.push(message);
        if (messages.length > MAX_MESSAGES) messages = messages.slice(-MAX_MESSAGES);
        save('messages.json', messages);
        return message;
    },
    updateMessage(id, changes) {
        const message = messages.find(m => m.id === id);
        if (!message) return null;
        Object.assign(message, changes);
        save('messages.json', messages);
        return message;
    },
    // Un fil SMS du téléphone remplace ce qu'on savait de ce numéro (le téléphone fait foi)
    replaceSmsThreads(list) {
        const keys = new Set(list.map(m => numberKey(m.adresse)));
        // (les SMS écrits ici et pas encore confirmés par le téléphone restent)
        messages = messages.filter(m => m.canal !== 'sms' || !keys.has(numberKey(m.adresse)) || (!m.ref && m.etat === 'envoi'));
        messages.push(...list);
        messages.sort((a, b) => a.date - b.date);
        save('messages.json', messages);
    },
    markRead(predicate) {
        let changed = false;
        for (const message of messages) {
            if (message.sens === 'recu' && !message.lu && predicate(message)) {
                message.lu = true;
                changed = true;
            }
        }
        if (changed) save('messages.json', messages);
        return changed;
    },
    deleteMessages(predicate) {
        messages = messages.filter(m => !predicate(m));
        save('messages.json', messages);
    },

    // ---- Appels : { id, canal: 'telephone'|'robbie', adresse, sens: 'entrant'|'sortant'|'manque', video, date, duree } ----
    calls: () => calls,
    addCall(call) {
        calls.push(call);
        if (calls.length > MAX_CALLS) calls = calls.slice(-MAX_CALLS);
        save('appels.json', calls);
        return call;
    },
    replacePhoneCalls(list) {
        calls = [...calls.filter(c => c.canal !== 'telephone'), ...list].sort((a, b) => a.date - b.date).slice(-MAX_CALLS);
        save('appels.json', calls);
    },

    // ---- Réglages : favoris, téléphones reliés, ordinateurs Robbie OS en contact ----
    settings: () => settings,
    setSettings(changes) {
        Object.assign(settings, changes);
        save('reglages.json', settings, true);
        return settings;
    },

    // ---- Contacts de Robbie OS (le même fichier que la barre latérale) ----
    contacts() {
        try {
            const list = JSON.parse(fs.readFileSync(CONTACTS, 'utf8'));
            return Array.isArray(list) ? list : [];
        } catch {
            return [];
        }
    },
    setContacts(list) {
        fs.mkdirSync(path.dirname(CONTACTS), { recursive: true });
        fs.writeFileSync(`${CONTACTS}.tmp`, JSON.stringify(list, null, 2));
        fs.renameSync(`${CONTACTS}.tmp`, CONTACTS);
    },
    CONTACTS
};
