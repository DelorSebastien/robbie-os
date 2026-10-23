// Notifications des applis : Robbie OS joue le rôle du service standard de Linux
// (org.freedesktop.Notifications sur le bus D-Bus de la session). Chaque notification reçue
// est transmise à la page, qui l'affiche et la range dans le centre de notifications.
const dbus = require('dbus-next');
const applis = require('./applis');

const { Interface } = dbus.interface;
const NAME = 'org.freedesktop.Notifications';
const PATH = '/org/freedesktop/Notifications';

function appIconByName(name) {
    const wanted = String(name || '').toLowerCase();
    if (!wanted) return null;
    const app = applis.list().find(a => a.name.toLowerCase().startsWith(wanted) || a.id.toLowerCase().startsWith(wanted));
    return app?.icon || null;
}

function createNotifications({ onNotify, onClose }) {
    let nextId = 1;

    class Notifications extends Interface {
        GetCapabilities() {
            return ['body', 'actions', 'icon-static', 'persistence'];
        }

        Notify(appName, replacesId, appIcon, summary, body, actions, hints, expireTimeout) {
            const id = replacesId || nextId++;
            // Les actions arrivent par paires : identifiant, libellé
            const buttons = [];
            for (let i = 0; i + 1 < actions.length; i += 2) buttons.push({ key: actions[i], label: actions[i + 1] });

            onNotify({
                id,
                app: appName || 'Système',
                // Sans icône fournie : celle de l'appli qui a envoyé la notification
                icon: (appIcon && applis.iconData(appIcon)) || appIconByName(appName),
                summary: String(summary || ''),
                // Le corps peut contenir un peu de balisage : on le retire
                body: String(body || '').replace(/<[^>]+>/g, ''),
                actions: buttons,
                urgent: hints?.urgency?.value === 2,
                timeout: expireTimeout,
                time: Date.now()
            });
            return id;
        }

        CloseNotification(id) {
            onClose(id);
            this.NotificationClosed(id, 3);
        }

        GetServerInformation() {
            return ['Robbie OS', 'Robbie OS', '0.2', '1.2'];
        }

        NotificationClosed(id, reason) {
            return [id, reason];
        }

        ActionInvoked(id, key) {
            return [id, key];
        }
    }

    Notifications.configureMembers({
        methods: {
            GetCapabilities: { inSignature: '', outSignature: 'as' },
            Notify: { inSignature: 'susssasa{sv}i', outSignature: 'u' },
            CloseNotification: { inSignature: 'u', outSignature: '' },
            GetServerInformation: { inSignature: '', outSignature: 'ssss' }
        },
        signals: {
            NotificationClosed: { signature: 'uu' },
            ActionInvoked: { signature: 'us' }
        }
    });

    const service = new Notifications(NAME);

    (async () => {
        try {
            const bus = dbus.sessionBus();
            bus.export(PATH, service);
            const reply = await bus.requestName(NAME, dbus.NameFlag.DO_NOT_QUEUE);
            if (reply !== dbus.RequestNameReply.PRIMARY_OWNER) console.error('Notifications : un autre service les reçoit déjà');
            else console.log('Notifications prêtes');
        } catch (error) {
            console.error('Notifications indisponibles :', error.message);
        }
    })();

    return {
        // L'utilisateur a cliqué sur la notification (action "default") ou sur un de ses boutons
        invoke(id, key = 'default') {
            service.ActionInvoked(id, key);
            service.NotificationClosed(id, 2);
        },
        // Fermée par l'utilisateur
        dismiss(id) {
            service.NotificationClosed(id, 2);
        }
    };
}

module.exports = { createNotifications };
