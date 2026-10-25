// Service du téléphone de Robbie OS : il tourne pendant toute la session (lancé par l'interface)
// et tient les liaisons : le téléphone Android (SMS, appels) et les autres Robbie OS (messages,
// appels audio et vidéo). L'interface et l'appli Téléphone lui parlent par une prise locale.
// « ELECTRON_RUN_AS_NODE=1 electron applis/telephone/service »
const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const stockage = require('./stockage');
const identite = require('./identite');
const { createLink } = require('./lien');
const { createNetwork } = require('./reseau');
const { wrap } = require('./ligne');
const { SOCKET } = require('./client');

const APP_DIR = path.join(__dirname, '..');
const PIECES = path.join(stockage.DIR, 'pieces');
const MAX_PIECE = 15 * 1024 * 1024;
const RING_SECONDS = 45;
// (décroché, mais l'image et le son ne passent pas : l'appel s'arrête au bout de ce temps)
const CONNECT_SECONDS = 40;
const OLLAMA = process.env.ROBBIE_OLLAMA || 'http://127.0.0.1:11434';
const MODEL = process.env.ROBBIE_MODEL || 'qwen3:8b';

const identity = identite.load();
const link = createLink(identity);
const network = createNetwork(identity);
const clients = new Set();
const newId = () => crypto.randomBytes(9).toString('base64url');

function broadcast(event, data) {
    for (const client of clients) client.send({ ev: event, d: data });
}

// ---- Personnes : un numéro ou un Robbie OS, retrouvé dans les contacts ----
const { numberKey } = stockage;

function personOf(canal, adresse, contacts = stockage.contacts()) {
    let contact = null;
    if (canal === 'robbie') contact = contacts.find(c => c.robbie === adresse);
    else if (numberKey(adresse)) contact = contacts.find(c => c.phone && numberKey(c.phone) === numberKey(adresse));
    if (contact) {
        return { cle: `c:${contact.name}`, nom: contact.name, telephone: contact.phone || (canal === 'sms' || canal === 'telephone' ? adresse : ''), robbie: contact.robbie || (canal === 'robbie' ? adresse : ''), contact: true };
    }
    if (canal === 'robbie') {
        const peer = network.peer(adresse);
        return { cle: `r:${adresse}`, nom: peer?.nom || 'Robbie OS', telephone: '', robbie: adresse, contact: false };
    }
    return { cle: `n:${numberKey(adresse) || adresse}`, nom: adresse, telephone: adresse, robbie: '', contact: false };
}

function conversations() {
    const contacts = stockage.contacts();
    const groups = new Map();
    for (const message of stockage.messages()) {
        const person = personOf(message.canal, message.adresse, contacts);
        let group = groups.get(person.cle);
        if (!group) groups.set(person.cle, (group = { ...person, dernier: null, nonLus: 0 }));
        group.dernier = message;
        if (message.sens === 'recu' && !message.lu) group.nonLus++;
        if (message.canal === 'sms' && !group.telephone) group.telephone = message.adresse;
        if (message.canal === 'robbie' && !group.robbie) group.robbie = message.adresse;
    }
    return [...groups.values()].map(g => ({ ...g, enLigne: g.robbie ? network.isOnline(g.robbie) : false }))
        .sort((a, b) => b.dernier.date - a.dernier.date);
}

const inConversation = key => {
    const contacts = stockage.contacts();
    return message => personOf(message.canal, message.adresse, contacts).cle === key;
};

// ---- État général (en haut de l'appli, dans la barre de Robbie OS) ----
function status() {
    const phone = link.phone();
    return {
        moi: { id: identity.id, nom: identity.nom, machine: identity.machine },
        telephone: phone ? { connecte: true, id: phone.appareil.id, nom: phone.appareil.nom, ...phone.etat, droits: phone.droits } : { connecte: false, relie: stockage.settings().appareils.length > 0, nom: stockage.settings().appareils[0]?.nom || null },
        robbie: { enLigne: true, demandes: network.peers().filter(p => p.etat === 'demande-recue').length },
        appels: [...calls.values()].map(publicCall),
        nonLus: stockage.messages().filter(m => m.sens === 'recu' && !m.lu).length
    };
}
let statusTimer = null;
const statusChanged = () => {
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => broadcast('etat', status()), 80);
};

// ---- Messages ----
function addMessage(message) {
    const stored = stockage.addMessage(message);
    if (!stored) return null;
    broadcast('message', { message: stored, personne: personOf(stored.canal, stored.adresse) });
    statusChanged();
    return stored;
}
function updateMessage(id, changes) {
    const message = stockage.updateMessage(id, changes);
    if (message) broadcast('message-modifie', message);
    return message;
}

function readPiece(file) {
    const stat = fs.statSync(file);
    if (!stat.isFile()) throw new Error('Ce n’est pas un fichier');
    if (stat.size > MAX_PIECE) throw new Error('Fichier trop lourd (15 Mo au plus)');
    const nom = path.basename(file);
    fs.mkdirSync(PIECES, { recursive: true });
    const copy = path.join(PIECES, `${newId()}-${nom}`);
    fs.copyFileSync(file, copy);
    return { nom, type: mimeOf(nom), taille: stat.size, chemin: copy };
}
const mimeOf = name => ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.pdf': 'application/pdf', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' }[path.extname(name).toLowerCase()] || 'application/octet-stream');

async function sendRobbie(message) {
    const payload = { type: 'message', id: message.id, texte: message.texte, date: message.date };
    if (message.piece) {
        try {
            payload.piece = { nom: message.piece.nom, type: message.piece.type, donnees: fs.readFileSync(message.piece.chemin).toString('base64') };
        } catch {
            return updateMessage(message.id, { etat: 'echec', erreur: 'Le fichier joint a disparu' });
        }
    }
    // (pas joignable : le message attend, il part dès que l'autre ordinateur revient)
    await network.send(message.adresse, payload);
}

async function send({ canal, adresse, texte, piece }) {
    texte = String(texte || '').slice(0, 10000);
    if (!texte.trim() && !piece) return { ok: false, erreur: 'Message vide' };
    const message = { id: newId(), canal, adresse: String(adresse), sens: 'envoye', texte, date: Date.now(), etat: 'envoi', lu: true };
    if (canal === 'sms') {
        if (piece) return { ok: false, erreur: 'Les fichiers ne passent pas par SMS : choisis Robbie OS' };
        if (!numberKey(adresse)) return { ok: false, erreur: 'Numéro incorrect' };
        if (!link.connected()) return { ok: false, erreur: 'Ton téléphone n’est pas joignable (Wi-Fi, appli Robbie Lien ouverte ?)' };
        addMessage(message);
        link.send({ type: 'sms-envoyer', ref: message.id, numero: message.adresse.replace(/[^\d+]/g, ''), texte });
        // (sans réponse du téléphone : l'envoi a échoué)
        setTimeout(() => {
            const current = stockage.messages().find(m => m.id === message.id);
            if (current?.etat === 'envoi') updateMessage(message.id, { etat: 'echec', erreur: 'Le téléphone n’a pas répondu' });
        }, 60000);
        return { ok: true, message };
    }
    if (canal === 'robbie') {
        if (network.peer(adresse)?.etat !== 'contact') return { ok: false, erreur: 'Cette personne n’est pas en contact sur Robbie OS' };
        if (piece) {
            try {
                message.piece = readPiece(String(piece));
            } catch (error) {
                return { ok: false, erreur: error.code === 'ENOENT' ? 'Fichier introuvable' : error.message };
            }
        }
        addMessage(message);
        sendRobbie(message);
        return { ok: true, message };
    }
    return { ok: false, erreur: 'Canal inconnu' };
}

// Messages Robbie OS en attente : partent quand l'autre ordinateur est joignable
network.events.on('joignable', id => {
    for (const message of stockage.messages()) {
        if (message.canal === 'robbie' && message.adresse === id && message.sens === 'envoye' && message.etat === 'envoi') sendRobbie(message);
    }
    statusChanged();
    broadcast('presence', { id, enLigne: true });
});
network.events.on('presence', id => broadcast('presence', { id, enLigne: network.isOnline(id) }));

network.events.on('message', (payload, from) => {
    const id = String(payload.id || '').slice(0, 40);
    if (!id) return;
    const message = { id: `${from.slice(0, 8)}-${id}`, ref: id, canal: 'robbie', adresse: from, sens: 'recu', texte: String(payload.texte || '').slice(0, 10000), date: Math.min(Number(payload.date) || Date.now(), Date.now()), etat: 'recu', lu: false };
    if (payload.piece?.donnees) {
        try {
            const data = Buffer.from(String(payload.piece.donnees), 'base64');
            if (data.length <= MAX_PIECE) {
                const nom = path.basename(String(payload.piece.nom || 'fichier')).replace(/[^\w.\- ]+/g, '_').slice(0, 80) || 'fichier';
                fs.mkdirSync(PIECES, { recursive: true });
                const file = path.join(PIECES, `${newId()}-${nom}`);
                fs.writeFileSync(file, data, { mode: 0o600 });
                message.piece = { nom, type: mimeOf(nom), taille: data.length, chemin: file };
            }
        } catch {}
    }
    addMessage(message);
    network.send(from, { type: 'recu', id });
});
network.events.on('recu', payload => {
    const message = stockage.messages().find(m => m.id === payload.id && m.sens === 'envoye');
    if (message && message.etat === 'envoi') updateMessage(message.id, { etat: 'envoye' });
});
network.events.on('lu', (payload, from) => {
    for (const id of [].concat(payload.ids || []).slice(0, 500)) {
        const message = stockage.messages().find(m => m.id === id && m.adresse === from && m.sens === 'envoye');
        if (message && message.etat !== 'lu') updateMessage(message.id, { etat: 'lu', luA: Date.now() });
    }
});

function markRead(key) {
    const predicate = inConversation(key);
    const unread = stockage.messages().filter(m => m.sens === 'recu' && !m.lu && predicate(m));
    if (!unread.length) return;
    stockage.markRead(predicate);
    // Accusés de lecture : aux Robbie OS concernés, et au téléphone pour ses SMS
    const byPeer = new Map();
    for (const message of unread) {
        if (message.canal === 'robbie') byPeer.set(message.adresse, [...(byPeer.get(message.adresse) || []), message.ref]);
        if (message.canal === 'sms') link.send({ type: 'sms-lu', numero: message.adresse });
    }
    for (const [peer, ids] of byPeer) network.send(peer, { type: 'lu', ids });
    broadcast('lus', { cle: key });
    statusChanged();
}

// ---- Téléphone Android ----
link.events.on('connecte', () => statusChanged());
link.events.on('deconnecte', () => {
    // (un appel du téléphone en cours n'est plus suivi)
    if (calls.has('tel')) endCall('tel', 'perdu');
    statusChanged();
});
link.events.on('relie', appareil => broadcast('telephone-relie', { nom: appareil.nom }));
link.events.on('etat', () => statusChanged());
link.events.on('droits', () => statusChanged());

const smsMessage = s => ({ id: `sms-${s.id}`, ref: String(s.id), canal: 'sms', adresse: String(s.numero || ''), sens: s.sens === 'envoye' ? 'envoye' : 'recu', texte: String(s.texte || '').slice(0, 10000), date: Number(s.date) || Date.now(), etat: s.sens === 'envoye' ? 'envoye' : 'recu', lu: s.sens === 'envoye' || Boolean(s.lu) });

link.events.on('sms-liste', message => {
    const list = [].concat(message.messages || []).slice(0, 20000).filter(s => s && s.numero).map(smsMessage);
    stockage.replaceSmsThreads(list);
    broadcast('conversations', null);
    statusChanged();
});
link.events.on('sms-recu', message => {
    if (!message.message?.numero) return;
    addMessage({ ...smsMessage({ ...message.message, sens: 'recu' }) });
});
link.events.on('sms-envoye', message => {
    const mine = stockage.messages().find(m => m.id === message.ref);
    if (!mine) return;
    updateMessage(mine.id, message.ok ? { etat: 'envoye', ref: message.id ? String(message.id) : mine.ref } : { etat: 'echec', erreur: String(message.erreur || 'Le SMS n’est pas parti') });
});
link.events.on('appels-liste', message => {
    const SENS = { entrant: 'entrant', sortant: 'sortant', manque: 'manque', refuse: 'manque' };
    stockage.replacePhoneCalls([].concat(message.appels || []).slice(0, 1000).map(c => ({
        id: `tel-${c.id}`, canal: 'telephone', adresse: String(c.numero || ''), sens: SENS[c.sens] || 'entrant', video: false, date: Number(c.date) || 0, duree: Number(c.duree) || 0
    })));
    broadcast('appels', null);
});

// Contacts du téléphone : ils rejoignent ceux de Robbie OS (sans doublons ni écraser)
link.events.on('contacts', message => {
    const contacts = stockage.contacts();
    let changed = false;
    for (const entry of [].concat(message.contacts || []).slice(0, 5000)) {
        const name = String(entry?.nom || '').trim().slice(0, 80);
        const phones = [].concat(entry?.numeros || []).map(String).filter(Boolean);
        const email = String([].concat(entry?.emails || [])[0] || '').slice(0, 120);
        if (!name) continue;
        const existing = contacts.find(c => (phones.length && c.phone && phones.some(p => numberKey(p) === numberKey(c.phone))) || c.name.toLowerCase() === name.toLowerCase());
        if (existing) {
            if (!existing.phone && phones[0]) { existing.phone = phones[0]; changed = true; }
            if (!existing.email && email) { existing.email = email; changed = true; }
        } else {
            contacts.push({ name, phone: phones[0] || '', email, note: '', source: 'telephone' });
            changed = true;
        }
    }
    if (changed) {
        stockage.setContacts(contacts);
        broadcast('contacts', null);
    }
});
link.events.on('notification', message => broadcast('notification-telephone', { id: String(message.id || ''), app: String(message.app || 'Téléphone'), titre: String(message.titre || ''), texte: String(message.texte || '') }));
link.events.on('notification-fin', message => broadcast('notification-telephone-fin', { id: String(message.id || '') }));

// ---- Appels ----
// { id, canal: 'telephone'|'robbie', adresse, sens: 'entrant'|'sortant', video, etat: 'sonne'|'appel'|'connecte', debut, connecteA, micro }
const calls = new Map();
const publicCall = call => ({ ...call, personne: personOf(call.canal, call.adresse), timer: undefined, signaux: undefined });

// Un appel décroché doit se connecter : sinon (fenêtre d'appel fermée, réseau bloqué) il s'arrête
function watchConnection(call) {
    clearTimeout(call.timer);
    call.timer = setTimeout(() => calls.get(call.id) === call && call.etat !== 'connecte' && endCall(call.id, 'echec', true), CONNECT_SECONDS * 1000);
}

function callChanged(call) {
    broadcast('appel', publicCall(call));
    statusChanged();
}

function endCall(id, raison = 'fin', notifyPeer = false) {
    const call = calls.get(id);
    if (!call) return;
    clearTimeout(call.timer);
    calls.delete(id);
    if (notifyPeer && call.canal === 'robbie') network.send(call.adresse, { type: 'appel-fin', id: call.id });
    if (call.canal === 'robbie') {
        const missed = call.sens === 'entrant' && !call.connecteA;
        stockage.addCall({ id: call.id, canal: 'robbie', adresse: call.adresse, sens: missed ? 'manque' : call.sens, video: call.video, date: call.debut, duree: call.connecteA ? Math.round((Date.now() - call.connecteA) / 1000) : 0 });
        broadcast('appels', null);
    } else {
        // (le journal du téléphone fait foi : on lui redemande après l'appel)
        setTimeout(() => link.send({ type: 'sync', quoi: 'appels' }), 1500);
    }
    broadcast('appel-fin', { id, raison, personne: personOf(call.canal, call.adresse) });
    statusChanged();
}

// La fenêtre d'appel (image, son, sous-titres) est dans l'appli Téléphone
function openCallWindow(id) {
    if (clients.size && [...clients].some(c => c.role === 'appli')) return broadcast('ouvrir-appel', { id });
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    spawn(process.execPath, [APP_DIR, '--appel', id], { env, detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
}

function startCall({ canal, adresse, video }) {
    if (calls.size) return { ok: false, erreur: 'Un appel est déjà en cours' };
    if (canal === 'telephone') {
        if (!numberKey(adresse)) return { ok: false, erreur: 'Numéro incorrect' };
        if (!link.connected()) return { ok: false, erreur: 'Ton téléphone n’est pas joignable (Wi-Fi, appli Robbie Lien ouverte ?)' };
        link.send({ type: 'appeler', numero: String(adresse) });
        const call = { id: 'tel', canal, adresse: String(adresse), sens: 'sortant', video: false, etat: 'appel', debut: Date.now(), micro: true };
        calls.set(call.id, call);
        callChanged(call);
        return { ok: true, appel: publicCall(call) };
    }
    if (canal === 'robbie') {
        if (network.peer(adresse)?.etat !== 'contact') return { ok: false, erreur: 'Cette personne n’est pas en contact sur Robbie OS' };
        if (!network.isOnline(adresse)) return { ok: false, erreur: 'Cette personne n’est pas en ligne' };
        const call = { id: newId(), canal, adresse: String(adresse), sens: 'sortant', video: Boolean(video), etat: 'appel', debut: Date.now(), micro: true };
        calls.set(call.id, call);
        network.send(adresse, { type: 'appel', id: call.id, video: call.video }).then(sent => !sent && endCall(call.id, 'injoignable'));
        call.timer = setTimeout(() => endCall(call.id, 'sans-reponse', true), RING_SECONDS * 1000);
        callChanged(call);
        openCallWindow(call.id);
        return { ok: true, appel: publicCall(call) };
    }
    return { ok: false, erreur: 'Canal inconnu' };
}

function answer(id) {
    const call = calls.get(id);
    if (!call || call.etat !== 'sonne') return { ok: false };
    if (call.canal === 'telephone') {
        link.send({ type: 'decrocher' });
        return { ok: true };
    }
    clearTimeout(call.timer);
    call.etat = 'connexion';
    watchConnection(call);
    network.send(call.adresse, { type: 'appel-reponse', id: call.id, accepte: true });
    callChanged(call);
    openCallWindow(call.id);
    return { ok: true };
}

function hangUp(id, smsText) {
    const call = calls.get(id);
    if (!call) return { ok: false };
    if (call.canal === 'telephone') {
        link.send({ type: 'raccrocher' });
        // (refuser avec un SMS : « Je te rappelle »…)
        if (smsText) send({ canal: 'sms', adresse: call.adresse, texte: smsText });
        return { ok: true };
    }
    if (call.etat === 'sonne') network.send(call.adresse, { type: 'appel-reponse', id: call.id, accepte: false });
    endCall(id, 'fin', call.etat !== 'sonne');
    if (smsText) send({ canal: 'robbie', adresse: call.adresse, texte: smsText });
    return { ok: true };
}

// Appels du téléphone (il annonce : ça sonne, décroché, terminé)
link.events.on('appel', message => {
    const numero = String(message.numero || '');
    const current = calls.get('tel');
    if (message.etat === 'sonne') {
        if (calls.size && !current) return;
        const call = { id: 'tel', canal: 'telephone', adresse: numero, sens: 'entrant', video: false, etat: 'sonne', debut: Date.now(), micro: true };
        calls.set('tel', call);
        callChanged(call);
    } else if (message.etat === 'decroche') {
        const call = current || { id: 'tel', canal: 'telephone', adresse: numero, sens: 'sortant', video: false, debut: Date.now(), micro: true };
        if (!call.adresse && numero) call.adresse = numero;
        call.etat = 'connecte';
        call.connecteA = call.connecteA || Date.now();
        calls.set('tel', call);
        callChanged(call);
    } else if (message.etat === 'termine') {
        endCall('tel', 'fin');
    }
});

// Appels Robbie OS
network.events.on('appel', (message, from) => {
    const id = String(message.id || '').slice(0, 40);
    if (!id) return;
    if (calls.size) return network.send(from, { type: 'appel-reponse', id, accepte: false, occupe: true });
    const call = { id, canal: 'robbie', adresse: from, sens: 'entrant', video: Boolean(message.video), etat: 'sonne', debut: Date.now(), micro: true };
    call.timer = setTimeout(() => {
        network.send(from, { type: 'appel-reponse', id, accepte: false });
        endCall(id, 'manque');
    }, RING_SECONDS * 1000);
    calls.set(id, call);
    callChanged(call);
});
network.events.on('appel-reponse', (message, from) => {
    const call = calls.get(message.id);
    if (!call || call.adresse !== from || call.sens !== 'sortant') return;
    clearTimeout(call.timer);
    if (!message.accepte) return endCall(call.id, message.occupe ? 'occupe' : 'refuse');
    call.etat = 'connexion';
    watchConnection(call);
    callChanged(call);
});
network.events.on('appel-fin', (message, from) => {
    const call = calls.get(message.id);
    if (call && call.adresse === from) endCall(call.id, 'raccroche');
});
// Signalisation de l'image et du son (WebRTC) entre les deux fenêtres d'appel
network.events.on('signal', (message, from) => {
    const call = calls.get(message.id);
    if (!call || call.adresse !== from) return;
    // (la fenêtre d'appel pas encore ouverte : les signaux l'attendent)
    if (!call.fenetre) (call.signaux ||= []).push(message.donnees);
    else broadcast('signal', { id: call.id, donnees: message.donnees });
});

// ---- Ce que l'interface et l'appli peuvent demander ----
const METHODS = {
    etat: () => status(),
    conversations: () => conversations(),
    messages: key => stockage.messages().filter(inConversation(String(key))),
    envoyer: options => send(options || {}),
    lire: key => markRead(String(key)),
    supprimerConversation: key => {
        stockage.deleteMessages(inConversation(String(key)));
        broadcast('conversations', null);
        statusChanged();
    },
    // (un message pas parti, renvoyé : l'ancien s'efface)
    supprimerMessage: id => {
        stockage.deleteMessages(m => m.id === String(id) && m.etat === 'echec');
        broadcast('conversations', null);
    },
    personne: (canal, adresse) => personOf(String(canal), String(adresse)),
    appels: () => {
        const contacts = stockage.contacts();
        return stockage.calls().slice(-300).reverse().map(c => ({ ...c, personne: personOf(c.canal, c.adresse, contacts) }));
    },
    appeler: options => startCall(options || {}),
    decrocher: id => answer(String(id)),
    raccrocher: (id, smsText) => hangUp(String(id), smsText ? String(smsText).slice(0, 500) : ''),
    micro: (id, on) => {
        const call = calls.get(String(id));
        if (!call) return { ok: false };
        call.micro = Boolean(on);
        if (call.canal === 'telephone') link.send({ type: 'micro', coupe: !call.micro });
        callChanged(call);
        return { ok: true };
    },
    appel: id => (calls.has(String(id)) ? publicCall(calls.get(String(id))) : null),
    // La fenêtre d'appel signale que l'image et le son passent
    appelConnecte: id => {
        const call = calls.get(String(id));
        if (!call || call.canal !== 'robbie') return;
        if (call.etat !== 'connecte') {
            clearTimeout(call.timer);
            call.etat = 'connecte';
            call.connecteA = Date.now();
            callChanged(call);
        }
    },
    // La fenêtre d'appel est prête : elle reçoit ce qui est arrivé avant elle, puis tout en direct
    signauxEnAttente: id => {
        const call = calls.get(String(id));
        if (!call) return [];
        call.fenetre = true;
        const waiting = call.signaux || [];
        call.signaux = [];
        return waiting;
    },
    signal: (id, data) => {
        const call = calls.get(String(id));
        if (call?.canal === 'robbie') network.send(call.adresse, { type: 'signal', id: call.id, donnees: data });
    },
    // Favoris (en haut des appels)
    favoris: () => stockage.settings().favoris,
    setFavoris: list => stockage.setSettings({ favoris: [].concat(list || []).map(String).slice(0, 12) }).favoris,
    // Téléphones reliés
    appareils: () => link.devices(),
    nouvelleLiaison: () => link.newPairing(),
    annulerLiaison: () => link.cancelPairing(),
    oublierAppareil: id => {
        link.forget(String(id));
        statusChanged();
    },
    // Robbie OS : à proximité, en contact, demandes
    proches: () => network.nearby(),
    pairs: () => network.peers(),
    demanderContact: async id => {
        const result = await network.request(String(id));
        return result;
    },
    repondreDemande: (id, accept) => network.answer(String(id), Boolean(accept)),
    retirerPair: id => network.remove(String(id)),
    // Robbie propose deux réponses courtes au dernier message reçu
    suggestions: key => suggest(String(key))
};

async function suggest(key) {
    const recent = stockage.messages().filter(inConversation(key)).slice(-8);
    if (!recent.length || recent[recent.length - 1].sens !== 'recu') return [];
    const dialog = recent.map(m => `${m.sens === 'recu' ? 'Lui' : 'Moi'} : ${m.texte}`).join('\n');
    try {
        const response = await fetch(`${OLLAMA}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(30000),
            body: JSON.stringify({
                model: MODEL,
                stream: false,
                keep_alive: '30m',
                format: 'json',
                ...(/qwen3|deepseek-r1/i.test(MODEL) ? { think: false } : {}),
                options: { temperature: 0.6 },
                messages: [
                    { role: 'system', content: 'Tu aides à répondre à un message. Propose deux réponses très courtes (moins de 40 caractères chacune), naturelles, en français, dans le ton de la conversation, que « Moi » pourrait envoyer. Réponds uniquement en JSON : {"reponses": ["…", "…"]}' },
                    { role: 'user', content: dialog }
                ]
            })
        });
        if (!response.ok) return [];
        const data = await response.json();
        const parsed = JSON.parse(String(data.message?.content || '{}'));
        return [].concat(parsed.reponses || []).map(r => String(r).trim()).filter(r => r && r.length <= 60).slice(0, 2);
    } catch {
        return [];
    }
}

// Quand une personne devient un contact Robbie OS : elle rejoint les contacts (ou complète le sien)
network.events.on('contact', peer => {
    if (!peer) return;
    const contacts = stockage.contacts();
    if (!contacts.some(c => c.robbie === peer.id)) {
        const same = contacts.find(c => !c.robbie && c.name.toLowerCase() === String(peer.nom).toLowerCase());
        if (same) same.robbie = peer.id;
        else contacts.push({ name: peer.nom, phone: '', email: '', note: '', robbie: peer.id });
        stockage.setContacts(contacts);
        broadcast('contacts', null);
    }
    broadcast('pairs', null);
    // (des messages écrits en attendant partent maintenant)
    network.events.emit('joignable', peer.id);
});
network.events.on('demande', peer => {
    broadcast('demande', peer);
    statusChanged();
});
network.events.on('retire', () => broadcast('pairs', null));

// ---- La prise locale ----
function serve() {
    const server = net.createServer(socket => {
        const client = wrap(socket, async message => {
            if (message.role) client.role = String(message.role);
            if (!message.m) return;
            const method = METHODS[message.m];
            try {
                if (!method) throw new Error(`Inconnu : ${message.m}`);
                const result = await method(...[].concat(message.a || []));
                client.send({ id: message.id, r: result === undefined ? null : result });
            } catch (error) {
                client.send({ id: message.id, e: error.message });
            }
        }, () => {
            clients.delete(client);
        });
        clients.add(client);
    });
    // (un service déjà lancé pour cette session : on le laisse faire)
    const listen = () => server.listen(SOCKET, () => fs.chmodSync(SOCKET, 0o600));
    server.on('error', error => {
        if (error.code !== 'EADDRINUSE') throw error;
        const probe = net.connect(SOCKET);
        probe.on('connect', () => {
            console.log('Service du téléphone déjà lancé');
            process.exit(0);
        });
        probe.on('error', () => {
            fs.rmSync(SOCKET, { force: true });
            listen();
        });
    });
    listen();
}

async function main() {
    serve();
    await Promise.all([link.start(), network.start()]);
    console.log(`Téléphone de Robbie OS prêt (${identity.nom}, ${identity.id.slice(0, 12)}…) : téléphones sur ${link.port}, Robbie OS sur le réseau`);
}

for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => {
        stockage.flush();
        fs.rmSync(SOCKET, { force: true });
        process.exit(0);
    });
}
process.on('uncaughtException', error => console.error('Téléphone :', error));

main();
