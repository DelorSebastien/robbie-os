// Fenêtres ouvertes (protocole wlr-foreign-toplevel de labwc, via wlrctl) :
// la liste sert au dock (point sous les applis ouvertes) et un clic ramène la fenêtre,
// même réduite
const { execFile } = require('node:child_process');

const OWN_APP_ID = 'robbie-os';

function run(args) {
    return new Promise(resolve => {
        execFile('wlrctl', args, { timeout: 3000 }, (error, stdout) => resolve(error ? null : stdout));
    });
}

// « app_id: titre » par ligne
async function list() {
    const output = await run(['toplevel', 'list']);
    if (output == null) return [];

    return output.split('\n')
        .map(line => line.match(/^([^:]+):\s?(.*)$/))
        .filter(Boolean)
        .map(([, appId, title]) => ({ appId: appId.trim(), title: title.trim() }))
        .filter(window => window.appId && window.appId !== OWN_APP_ID);
}

// Ramène au premier plan (et fait réapparaître si réduite) la fenêtre de cette appli
async function focus(appId) {
    return (await run(['toplevel', 'focus', `app_id:${appId}`])) != null;
}

// Surveillance : `onChange(liste)` à chaque ouverture ou fermeture de fenêtre
function watch(onChange, interval = 1500) {
    let last = '';
    const timer = setInterval(async () => {
        const windows = await list();
        const key = JSON.stringify(windows);
        if (key === last) return;
        last = key;
        onChange(windows);
    }, interval);
    return () => clearInterval(timer);
}

// L'appli de la fenêtre active (celle qui a le clavier)
async function active() {
    const output = await run(['toplevel', 'list', 'state:active']);
    return output?.match(/^([^:]+):/)?.[1].trim() || null;
}

module.exports = { list, focus, watch, active };
