// Robbie OS ↔ Robbie OS : chaque ordinateur s'annonce sur le réseau local, et les personnes
// en contact se parlent par une connexion chiffrée dans les deux sens (chacun vérifie le
// certificat de l'autre : son empreinte est son identité). Messages, demandes de contact,
// appels audio et vidéo (la signalisation passe ici, l'image et le son vont en direct).
const dgram = require('node:dgram');
const tls = require('node:tls');
const { EventEmitter } = require('node:events');
const { wrap } = require('./ligne');
const { fingerprint } = require('./identite');
const stockage = require('./stockage');

const PORT = Number(process.env.ROBBIE_RESEAU_PORT ?? 47853);
const ANNOUNCE_PORT = Number(process.env.ROBBIE_RESEAU_ANNONCE ?? 47854);
const GROUP = '239.255.47.54';
const ANNOUNCE_SECONDS = 5;
const ONLINE_SECONDS = 16;

function createNetwork(identity) {
    const events = new EventEmitter();
    const nearby = new Map();       // id → { id, nom, machine, adresse, port, vu }
    const links = new Map();        // id → ligne
    const connecting = new Map();   // id → promesse de ligne
    let port = PORT;

    const contactOf = id => stockage.settings().pairs.find(p => p.id === id);
    const savePeer = (id, changes) => {
        const pairs = stockage.settings().pairs;
        const peer = pairs.find(p => p.id === id);
        const updated = peer ? Object.assign(peer, changes) : { id, ajoute: Date.now(), ...changes };
        stockage.setSettings({ pairs: peer ? pairs : [...pairs, updated] });
        return updated;
    };

    // ---- Connexions ----
    function attach(socket, id) {
        const line = wrap(socket, message => receive(id, message), () => {
            if (links.get(id) === line) {
                links.delete(id);
                events.emit('presence', id);
            }
        });
        // (deux connexions croisées entre les mêmes ordinateurs : on garde la plus récente)
        links.get(id)?.close();
        links.set(id, line);
        line.send({ type: 'bonjour', nom: identity.nom, machine: identity.machine, port });
        events.emit('presence', id);
        events.emit('connecte', id);
        return line;
    }

    const server = tls.createServer({ key: identity.key, cert: identity.cert, requestCert: true, rejectUnauthorized: false, minVersion: 'TLSv1.2' }, socket => {
        const cert = socket.getPeerCertificate(true);
        if (!cert?.raw) return socket.destroy();
        const id = fingerprint(cert.raw);
        if (id === identity.id) return socket.destroy();
        attach(socket, id);
    });

    function connect(id) {
        if (links.has(id)) return Promise.resolve(links.get(id));
        if (connecting.has(id)) return connecting.get(id);
        const peer = nearby.get(id);
        if (!peer || Date.now() - peer.vu > ONLINE_SECONDS * 1000) return Promise.resolve(null);
        const attempt = new Promise(resolve => {
            const socket = tls.connect({ host: peer.adresse, port: peer.port, key: identity.key, cert: identity.cert, rejectUnauthorized: false, minVersion: 'TLSv1.2' }, () => {
                const cert = socket.getPeerCertificate(true);
                // (quelqu'un d'autre à cette adresse : on n'envoie rien)
                if (!cert?.raw || fingerprint(cert.raw) !== id) {
                    socket.destroy();
                    return resolve(null);
                }
                resolve(attach(socket, id));
            });
            socket.setTimeout(8000, () => socket.destroy());
            socket.once('secureConnect', () => socket.setTimeout(0));
            socket.on('error', () => resolve(null));
            socket.on('close', () => resolve(null));
        }).finally(() => connecting.delete(id));
        connecting.set(id, attempt);
        return attempt;
    }

    async function send(id, message) {
        const line = await connect(id);
        return line ? line.send(message) : false;
    }

    // ---- Ce que les autres nous envoient ----
    function receive(id, message) {
        const contact = contactOf(id);
        switch (message.type) {
            case 'bonjour': {
                const known = nearby.get(id);
                if (known) Object.assign(known, { nom: String(message.nom || known.nom).slice(0, 60) });
                if (contact && message.nom && contact.nom !== message.nom) savePeer(id, { nom: String(message.nom).slice(0, 60) });
                if (contact?.etat === 'contact') events.emit('joignable', id);
                return;
            }
            case 'demande':
                if (contact?.etat === 'contact') return send(id, { type: 'accepte' });
                // (deux demandes croisées : le contact est fait des deux côtés)
                if (contact?.etat === 'demande-envoyee') {
                    savePeer(id, { etat: 'contact' });
                    send(id, { type: 'accepte' });
                    return events.emit('contact', contactOf(id));
                }
                savePeer(id, { etat: 'demande-recue', nom: String(message.nom || 'Quelqu’un').slice(0, 60), machine: String(message.machine || '').slice(0, 60) });
                return events.emit('demande', contactOf(id));
            case 'accepte':
                if (contact?.etat !== 'demande-envoyee' && contact?.etat !== 'contact') return;
                savePeer(id, { etat: 'contact' });
                return events.emit('contact', contactOf(id));
            case 'refuse':
            case 'retire':
                if (!contact) return;
                stockage.setSettings({ pairs: stockage.settings().pairs.filter(p => p.id !== id) });
                return events.emit('retire', id);
        }
        // Le reste : seulement entre personnes en contact
        if (contact?.etat !== 'contact') return;
        events.emit(message.type, message, id);
    }

    // ---- Annonces sur le réseau local ----
    const announcer = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    announcer.on('message', (data, from) => {
        let message;
        try {
            message = JSON.parse(data.toString('utf8'));
        } catch {
            return;
        }
        if (message?.robbie !== 1 || !/^[0-9a-f]{64}$/.test(message.id) || message.id === identity.id) return;
        const wasOnline = isOnline(message.id);
        nearby.set(message.id, {
            id: message.id,
            nom: String(message.nom || '').slice(0, 60),
            machine: String(message.machine || '').slice(0, 60),
            adresse: from.address,
            port: Number(message.port) || PORT,
            vu: Date.now()
        });
        if (!wasOnline) {
            events.emit('presence', message.id);
            if (contactOf(message.id)) events.emit('joignable', message.id);
        }
    });
    announcer.on('error', error => console.error('Annonces Robbie OS :', error.message));

    function announce() {
        const data = Buffer.from(JSON.stringify({ robbie: 1, id: identity.id, nom: identity.nom, machine: identity.machine, port }));
        announcer.send(data, ANNOUNCE_PORT, GROUP, () => {});
        announcer.send(data, ANNOUNCE_PORT, '255.255.255.255', () => {});
    }

    // Disparus des annonces : plus en ligne
    setInterval(() => {
        for (const peer of nearby.values()) {
            if (Date.now() - peer.vu > ONLINE_SECONDS * 1000 && !links.has(peer.id) && !peer.parti) {
                peer.parti = true;
                events.emit('presence', peer.id);
            } else if (Date.now() - peer.vu <= ONLINE_SECONDS * 1000) {
                peer.parti = false;
            }
        }
    }, 4000);

    function isOnline(id) {
        if (links.has(id)) return true;
        const peer = nearby.get(id);
        return Boolean(peer && Date.now() - peer.vu <= ONLINE_SECONDS * 1000);
    }

    function start() {
        return new Promise(resolve => {
            const listening = () => {
                port = server.address().port;
                announcer.bind(ANNOUNCE_PORT, () => {
                    try {
                        announcer.setBroadcast(true);
                        announcer.setMulticastLoopback(true);
                        announcer.addMembership(GROUP);
                    } catch (error) {
                        console.error('Groupe des annonces :', error.message);
                    }
                    announce();
                    setInterval(announce, ANNOUNCE_SECONDS * 1000);
                    resolve();
                });
            };
            server.once('error', () => server.listen(0, listening));
            server.listen(PORT, listening);
        });
    }

    return {
        events,
        start,
        isOnline,
        send,
        // Robbie OS à proximité qui ne sont pas encore en contact
        nearby: () => [...nearby.values()].filter(p => isOnline(p.id) && contactOf(p.id)?.etat !== 'contact')
            .map(p => ({ id: p.id, nom: p.nom, machine: p.machine, etat: contactOf(p.id)?.etat || null })),
        peers: () => stockage.settings().pairs.map(p => ({ ...p, enLigne: isOnline(p.id) })),
        peer: id => contactOf(id) || null,
        async request(id) {
            const peer = nearby.get(id);
            if (!peer) return { ok: false, erreur: 'Cet ordinateur n’est plus sur le réseau' };
            savePeer(id, { etat: contactOf(id)?.etat === 'demande-recue' ? 'contact' : 'demande-envoyee', nom: peer.nom, machine: peer.machine });
            const sent = await send(id, { type: contactOf(id).etat === 'contact' ? 'accepte' : 'demande', nom: identity.nom, machine: identity.machine });
            if (contactOf(id).etat === 'contact') events.emit('contact', contactOf(id));
            return sent ? { ok: true, etat: contactOf(id).etat } : { ok: false, erreur: 'Cet ordinateur ne répond pas' };
        },
        async answer(id, accept) {
            const contact = contactOf(id);
            if (contact?.etat !== 'demande-recue') return { ok: false };
            if (accept) {
                savePeer(id, { etat: 'contact' });
                await send(id, { type: 'accepte' });
                events.emit('contact', contactOf(id));
            } else {
                stockage.setSettings({ pairs: stockage.settings().pairs.filter(p => p.id !== id) });
                await send(id, { type: 'refuse' });
            }
            return { ok: true };
        },
        async remove(id) {
            await send(id, { type: 'retire' });
            links.get(id)?.close();
            stockage.setSettings({ pairs: stockage.settings().pairs.filter(p => p.id !== id) });
        }
    };
}

module.exports = { createNetwork };
