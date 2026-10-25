// Téléphone : l'interface lance le service du téléphone pour toute la session (liaisons avec le
// téléphone Android et les autres Robbie OS), montre les appels qui arrivent et prévient des
// nouveaux messages, des appels manqués et des demandes de contact.
const path = require('node:path');
const { spawn } = require('node:child_process');
const applis = require('./applis');
const fenetres = require('./fenetres');
const { connectService } = require('../../applis/telephone/service/client');

const APP = path.join(__dirname, '..', '..', 'applis', 'telephone');
const MAX_RESTARTS = 5;

let child = null;
let stopped = false;
let restarts = 0;
let client = null;

function startService() {
    if (stopped) return;
    child = spawn(process.execPath, [path.join(APP, 'service')], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['ignore', 'inherit', 'inherit'] });
    child.on('exit', code => {
        child = null;
        if (stopped || code === 0) return;
        // (arrêté de lui-même : relancé, quelques fois seulement)
        if (++restarts <= MAX_RESTARTS) setTimeout(startService, 2000 * restarts);
        else console.error('Le service du téléphone s’est arrêté plusieurs fois');
    });
}

// Ouvrir l'appli Téléphone (sur une conversation, un appel…)
function openApp(...args) {
    spawn(process.execPath, [APP, ...args], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
}

// Ce que la page peut demander au service
const ALLOWED = new Set(['etat', 'decrocher', 'raccrocher', 'micro', 'appel', 'appareils', 'nouvelleLiaison', 'annulerLiaison', 'oublierAppareil', 'proches', 'pairs', 'demanderContact', 'repondreDemande', 'retirerPair', 'appeler']);

function start({ send, notifications }) {
    startService();
    client = connectService('interface');
    const icon = applis.iconData(path.join(APP, 'telephone.svg'));
    const appInFront = async () => (await fenetres.active().catch(() => null)) === 'robbie-telephone';
    const shown = new Map();      // conversation → notification (une seule par personne)

    for (const event of ['etat', 'appel', 'appel-fin', 'telephone-relie', 'pairs', 'contacts']) {
        client.events.on(event, data => send('telephone', event, data));
    }
    client.events.on('connecte', () => send('telephone', 'connecte', null));

    client.events.on('message', async ({ message, personne }) => {
        if (message.sens !== 'recu' || !notifications || (await appInFront())) return;
        const who = message.canal === 'robbie' ? `robbie:${message.adresse}` : message.adresse;
        const id = notifications.post({
            replaces: shown.get(personne.cle),
            app: 'Téléphone',
            icon,
            summary: personne.nom,
            body: message.texte || (message.piece ? `Fichier : ${message.piece.nom}` : ''),
            actions: [{ key: 'repondre', label: 'Répondre' }]
        }, key => {
            shown.delete(personne.cle);
            if (key === 'repondre' || key === 'default') openApp('--message', who);
        });
        shown.set(personne.cle, id);
    });
    client.events.on('lus', ({ cle }) => {
        if (shown.has(cle)) {
            notifications?.close(shown.get(cle));
            shown.delete(cle);
        }
    });

    client.events.on('appel-fin', ({ raison, personne }) => {
        if ((raison !== 'manque' && raison !== 'perdu-sonne') || !notifications) return;
        notifications.post({ app: 'Téléphone', icon, summary: 'Appel manqué', body: personne.nom, actions: [{ key: 'rappeler', label: 'Rappeler' }, { key: 'ecrire', label: 'Écrire' }] }, key => {
            const who = personne.robbie ? `robbie:${personne.robbie}` : personne.telephone;
            if (key === 'rappeler') openApp('--appeler', who);
            if (key === 'ecrire' || key === 'default') openApp('--message', who);
        });
    });

    client.events.on('demande', peer => {
        notifications?.post({ app: 'Téléphone', icon, summary: `${peer.nom} veut être en contact`, body: `Sur Robbie OS (${peer.machine || 'ordinateur à proximité'}) : messages et appels d’ordinateur à ordinateur.`, actions: [{ key: 'accepter', label: 'Accepter' }, { key: 'refuser', label: 'Refuser' }] }, key => {
            if (key === 'accepter') client.call('repondreDemande', peer.id, true).catch(() => {});
            if (key === 'refuser') client.call('repondreDemande', peer.id, false).catch(() => {});
        });
    });

    // Notifications des autres applis du téléphone (si Robbie Lien les partage)
    const phoneNotifications = new Map();
    client.events.on('notification-telephone', data => {
        if (!notifications) return;
        const id = notifications.post({ replaces: phoneNotifications.get(data.id), app: data.app, icon, summary: data.titre || data.app, body: data.texte }, () => phoneNotifications.delete(data.id));
        phoneNotifications.set(data.id, id);
    });
    client.events.on('notification-telephone-fin', data => {
        if (phoneNotifications.has(data.id)) notifications?.close(phoneNotifications.get(data.id));
        phoneNotifications.delete(data.id);
    });
}

async function call(method, args) {
    if (!ALLOWED.has(method) || !client) return { erreurService: 'Demande refusée' };
    try {
        return await client.call(method, ...[].concat(args || []));
    } catch (error) {
        return { erreurService: error.message };
    }
}

function stop() {
    stopped = true;
    client?.close();
    child?.kill('SIGTERM');
}

module.exports = { start, stop, call, openApp };
