// Liaison avec le téléphone Android (l'appli Robbie Lien) : le téléphone se connecte à
// l'ordinateur en Wi-Fi, par une connexion chiffrée dont il vérifie l'empreinte (lue dans le
// code QR). L'ordinateur reconnaît le téléphone à son jeton, donné une seule fois à la liaison.
const crypto = require('node:crypto');
const dgram = require('node:dgram');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const os = require('node:os');
const tls = require('node:tls');
const { EventEmitter } = require('node:events');
const { wrap } = require('./ligne');
const stockage = require('./stockage');

const PORT = Number(process.env.ROBBIE_LIEN_PORT ?? 47851);
const DISCOVERY_PORT = Number(process.env.ROBBIE_LIEN_DECOUVERTE ?? 47852);
const CODE_MINUTES = 10;
const PING_SECONDS = 30;
const APK_PORT = Number(process.env.ROBBIE_LIEN_APK_PORT ?? 47855);
// L'appli Android, fournie par Robbie OS lui-même (construite depuis applis/telephone/android)
const APK = path.join(__dirname, '..', 'robbie-lien.apk');

const hash = text => crypto.createHash('sha256').update(String(text)).digest('hex');

// Adresses de l'ordinateur sur le réseau local (données au téléphone dans le code QR)
function addresses() {
    return Object.values(os.networkInterfaces()).flat()
        .filter(i => i && i.family === 'IPv4' && !i.internal)
        .map(i => i.address);
}

function createLink(identity) {
    const events = new EventEmitter();
    const phones = new Map();         // id du téléphone → { appareil, ligne, etat, droits }
    let pairing = null;                // { code, expire }
    let port = PORT;

    const server = tls.createServer({ key: identity.key, cert: identity.cert, minVersion: 'TLSv1.2' }, socket => {
        let phone = null;
        const timeout = setTimeout(() => !phone && socket.destroy(), 15000);
        let lastSeen = Date.now();
        const ping = setInterval(() => {
            if (Date.now() - lastSeen > PING_SECONDS * 3000) socket.destroy();
            else line.send({ type: 'ping' });
        }, PING_SECONDS * 1000);

        const line = wrap(socket, message => {
            lastSeen = Date.now();
            if (!phone) {
                phone = welcome(message, line);
                if (phone) clearTimeout(timeout);
                return;
            }
            receive(phone, message);
        }, () => {
            clearTimeout(timeout);
            clearInterval(ping);
            if (phone && phones.get(phone.appareil.id) === phone) {
                phones.delete(phone.appareil.id);
                events.emit('deconnecte', phone.appareil);
            }
        });
    });

    // Premier message du téléphone : une demande de liaison (avec le code du QR) ou un bonjour
    function welcome(message, line) {
        const settings = stockage.settings();
        if (message.type === 'relier') {
            const valid = pairing && Date.now() < pairing.expire && String(message.code || '').toUpperCase() === pairing.code;
            if (!valid || !message.id) {
                line.send({ type: 'refuse', raison: 'Code expiré : affiche un nouveau code dans Robbie OS' });
                setTimeout(() => line.close(), 500);
                return null;
            }
            pairing = null;
            const token = crypto.randomBytes(32).toString('hex');
            const appareil = {
                id: String(message.id).slice(0, 64),
                nom: String(message.nom || 'Téléphone').slice(0, 60),
                modele: String(message.modele || '').slice(0, 60),
                jeton: hash(token),
                ajoute: Date.now(),
                vu: Date.now()
            };
            stockage.setSettings({ appareils: [...settings.appareils.filter(a => a.id !== appareil.id), appareil] });
            line.send({ type: 'relie', jeton: token, nom: `PC de ${identity.nom}`, id: identity.id });
            events.emit('relie', appareil);
            return open(appareil, line);
        }
        if (message.type === 'bonjour') {
            const appareil = settings.appareils.find(a => a.id === message.id && a.jeton === hash(message.jeton));
            if (!appareil) {
                line.send({ type: 'refuse', raison: 'Ce téléphone n’est plus relié à cet ordinateur' });
                setTimeout(() => line.close(), 500);
                return null;
            }
            if (message.nom) appareil.nom = String(message.nom).slice(0, 60);
            appareil.vu = Date.now();
            stockage.setSettings({ appareils: settings.appareils });
            line.send({ type: 'bienvenue', nom: `PC de ${identity.nom}`, id: identity.id });
            return open(appareil, line);
        }
        line.close();
        return null;
    }

    function open(appareil, line) {
        // (le même téléphone reconnecté : l'ancienne connexion s'en va)
        phones.get(appareil.id)?.ligne.close();
        const phone = { appareil, ligne: line, etat: {}, droits: {} };
        phones.set(appareil.id, phone);
        events.emit('connecte', appareil);
        line.send({ type: 'sync' });
        return phone;
    }

    const TYPES = new Set(['etat', 'droits', 'sms-liste', 'sms-recu', 'sms-envoye', 'appels-liste', 'appel', 'contacts', 'notification', 'notification-fin']);
    function receive(phone, message) {
        if (message.type === 'pong' || message.type === 'ping') {
            if (message.type === 'ping') phone.ligne.send({ type: 'pong' });
            return;
        }
        if (message.type === 'etat') phone.etat = { ...phone.etat, ...message };
        if (message.type === 'droits') phone.droits = { ...message };
        if (TYPES.has(message.type)) events.emit(message.type, message, phone.appareil);
    }

    // Découverte : un téléphone qui ne trouve plus l'ordinateur (nouvelle adresse) demande
    // à tout le réseau « ROBBIE-LIEN? <empreinte> » ; l'ordinateur concerné répond son port
    const discovery = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    discovery.on('message', (data, from) => {
        const text = data.toString('utf8').trim();
        if (text === `ROBBIE-LIEN? ${identity.id}`) discovery.send(`ROBBIE-LIEN! ${identity.id} ${port}`, from.port, from.address);
    });
    discovery.on('error', error => console.error('Découverte des téléphones :', error.message));

    function start() {
        return new Promise(resolve => {
            server.once('error', () => {
                // (port déjà pris, par une autre session par exemple : un autre au hasard)
                server.listen(0, () => {
                    port = server.address().port;
                    resolve();
                });
            });
            server.listen(PORT, () => {
                port = server.address().port;
                resolve();
            });
            try {
                discovery.bind(DISCOVERY_PORT);
            } catch {}
        });
    }

    // Pendant qu'un code de liaison est affiché, le téléphone peut télécharger Robbie Lien
    // depuis l'ordinateur (http://adresse:47855/robbie-lien.apk), rien d'autre
    let apkServer = null;
    let apkTimer = null;
    function serveApk() {
        clearTimeout(apkTimer);
        apkTimer = setTimeout(stopApk, CODE_MINUTES * 60000);
        if (apkServer) return Promise.resolve(apkServer.address()?.port);
        return new Promise(resolve => {
            apkServer = http.createServer((request, response) => {
                if (request.url !== '/robbie-lien.apk' || !fs.existsSync(APK)) {
                    response.writeHead(404).end();
                    return;
                }
                response.writeHead(200, { 'Content-Type': 'application/vnd.android.package-archive', 'Content-Length': fs.statSync(APK).size, 'Content-Disposition': 'attachment; filename="robbie-lien.apk"' });
                fs.createReadStream(APK).pipe(response);
            });
            apkServer.once('error', () => apkServer.listen(0, () => resolve(apkServer.address().port)));
            apkServer.listen(APK_PORT, () => resolve(apkServer.address().port));
        });
    }
    function stopApk() {
        clearTimeout(apkTimer);
        apkServer?.close();
        apkServer = null;
    }

    const firstPhone = () => phones.values().next().value || null;

    return {
        events,
        start,
        get port() {
            return port;
        },
        // Code QR de liaison : adresse, port, empreinte et code à usage unique
        async newPairing() {
            const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
            const code = Array.from(crypto.randomBytes(8), b => alphabet[b % alphabet.length]).join('');
            pairing = { code, expire: Date.now() + CODE_MINUTES * 60000 };
            const params = new URLSearchParams({ h: addresses().join(','), p: String(port), e: identity.id, c: code, n: `PC de ${identity.nom}` });
            const apkPort = fs.existsSync(APK) && addresses().length ? await serveApk() : null;
            return { url: `robbie-lien://relier?${params}`, code, expire: pairing.expire, adresses: addresses(), port, apk: apkPort ? `http://${addresses()[0]}:${apkPort}/robbie-lien.apk` : null };
        },
        cancelPairing() {
            pairing = null;
            stopApk();
        },
        // Téléphones reliés, et lequel est joignable en ce moment
        devices: () => stockage.settings().appareils.map(({ jeton, ...a }) => ({ ...a, connecte: phones.has(a.id), etat: phones.get(a.id)?.etat || null, droits: phones.get(a.id)?.droits || null })),
        forget(id) {
            phones.get(id)?.ligne.send({ type: 'oublie' });
            phones.get(id)?.ligne.close();
            stockage.setSettings({ appareils: stockage.settings().appareils.filter(a => a.id !== id) });
        },
        connected: () => Boolean(firstPhone()),
        phone: () => firstPhone(),
        // Envoi au téléphone joignable (faux s'il n'y en a pas)
        send(message) {
            const phone = firstPhone();
            return phone ? phone.ligne.send(message) : false;
        }
    };
}

module.exports = { createLink, addresses };
