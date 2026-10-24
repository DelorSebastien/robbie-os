// Mises à jour disponibles : une notification propose « Installer » (en un clic) ou « Plus tard ».
// « Plus tard » laisse tranquille pendant un jour ; les mises à jour attendent dans la Logithèque
// (onglet Mises à jour, ouvert aussi par un clic sur la notification ou depuis les Réglages).
// Seuls les administrateurs sont prévenus : eux seuls peuvent les installer.
const path = require('node:path');
const { spawn } = require('node:child_process');
const misesAJour = require('./mises-a-jour');
const applis = require('./applis');
const notes = require('./notes');

const LOGITHEQUE = path.join(__dirname, '..', '..', 'applis', 'logitheque');
const LATER = 24 * 3600 * 1000;

function openUpdates() {
    spawn(process.execPath, [LOGITHEQUE, '--mises-a-jour'], { detached: true, stdio: 'ignore' }).unref();
}

const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;

function watch(notifications) {
    const icon = applis.iconData(path.join(LOGITHEQUE, 'logitheque.svg'));
    let shown = null;
    // (vérification déjà proposée : on ne la repropose pas à chaque changement du fichier)
    let proposedFor = null;
    let installing = false;

    const show = (notification, onAction) => {
        shown = notifications.post({ app: 'Mises à jour', icon, replaces: shown, ...notification }, key => {
            shown = null;
            onAction?.(key);
        });
    };

    async function install() {
        installing = true;
        show({ summary: 'Installation des mises à jour…', body: 'Tu peux continuer à travailler. La progression est dans la Logithèque.' }, key => {
            if (key === 'default') openUpdates();
        });
        const result = await misesAJour.install();
        installing = false;
        const state = misesAJour.read();
        if (!result.ok) {
            show({ summary: 'Mises à jour incomplètes', body: result.error, actions: [{ key: 'voir', label: 'Voir' }] }, key => {
                if (key === 'voir' || key === 'default') openUpdates();
            });
        } else if (state.reboot) {
            show({
                summary: 'Mises à jour installées',
                body: 'Redémarre l’ordinateur pour terminer.',
                actions: [{ key: 'redemarrer', label: 'Redémarrer' }, { key: 'plus-tard', label: 'Plus tard' }]
            }, key => {
                if (key === 'redemarrer') misesAJour.restart();
            });
        } else {
            show({ summary: 'Mises à jour installées', body: 'Robbie OS est à jour.' });
        }
    }

    function propose(state) {
        if (installing || state.running || !state.count || proposedFor === state.checked) return;
        if (Date.now() < (notes.getSettings().updatesLater || 0)) return;
        proposedFor = state.checked;
        const security = state.security ? `Dont ${plural(state.security, 'correctif')} de sécurité. ` : '';
        show({
            summary: `${plural(state.count, 'mise')} à jour disponible${state.count > 1 ? 's' : ''}`,
            body: `${security}Installe-les maintenant, ou plus tard depuis la Logithèque.`,
            actions: [{ key: 'installer', label: 'Installer' }, { key: 'plus-tard', label: 'Plus tard' }]
        }, key => {
            if (key === 'installer') install();
            else if (key === 'plus-tard') notes.setSettings({ updatesLater: Date.now() + LATER });
            else if (key === 'default') openUpdates();
        });
    }

    misesAJour.watch(propose);
    // (au début de la session, une fois le bureau en place)
    setTimeout(() => propose(misesAJour.read()), 20000);
    // (« Plus tard » écoulé : la proposition revient, même sans nouvelle vérification)
    setInterval(() => {
        const later = notes.getSettings().updatesLater;
        if (later && Date.now() >= later) {
            notes.setSettings({ updatesLater: 0 });
            proposedFor = null;
            propose(misesAJour.read());
        }
    }, 3600 * 1000);
}

module.exports = { watch, openUpdates };
