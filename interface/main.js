// Robbie OS : l'interface, lancée en plein écran au démarrage de la machine
const { app, BrowserWindow, ipcMain, protocol, net } = require('electron');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const systeme = require('./services/systeme');
const applis = require('./services/applis');
const meteo = require('./services/meteo');
const son = require('./services/son');
const notes = require('./services/notes');
const { power } = require('./services/alimentation');
const { createRobbie } = require('./services/robbie');
const fenetres = require('./services/fenetres');
const { createNotifications } = require('./services/notifications');
const reseau = require('./services/reseau');
const luminosite = require('./services/luminosite');
const actions = require('./services/actions');
const parametres = require('./services/parametres');
const verrouillage = require('./services/verrouillage');
const comptes = require('./services/comptes');
const theme = require('./services/theme');
const disposition = require('./services/disposition');
const { spawn } = require('node:child_process');

// Fonds d'écran servis à la page par « fond://image?chemin=… », seulement depuis les dossiers prévus
protocol.registerSchemesAsPrivileged([{ scheme: 'fond', privileges: { standard: true, secure: true } }]);

// Nom de l'appli pour Wayland (règles de fenêtre de labwc)
app.setName('robbie-os');

// Robbie parle sans attendre un premier clic dans la page
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// Chromium refuse par prudence certaines cartes graphiques (celle de VirtualBox par exemple) :
// on l'utilise quand même, c'est bien plus fluide que le dessin par le processeur
app.commandLine.appendSwitch('ignore-gpu-blocklist');

// Machine virtuelle (ROBBIE_SANS_GPU) : sa carte graphique simulée ne marche pas avec Chromium
// (rendu logiciel llvmpipe, pire que le dessin par le processeur de Chromium lui-même)
if (process.env.ROBBIE_SANS_GPU) {
    app.disableHardwareAcceleration();
} else if (process.platform === 'linux') {
    // Sous Wayland, Vulkan n'est pas pris en charge par Chromium : on passe par OpenGL
    app.commandLine.appendSwitch('disable-features', 'Vulkan');
    app.commandLine.appendSwitch('use-angle', 'gl');
}

let win = null;

// Hors de Linux (aperçu sur Windows pendant le développement) : une simple fenêtre
const preview = process.platform !== 'linux';

function createWindow() {
    win = new BrowserWindow({
        ...(preview ? { width: 1600, height: 900, autoHideMenuBar: true, title: 'Robbie OS – aperçu' } : { fullscreen: true, frame: false }),
        backgroundColor: '#02040a',
        icon: path.join(__dirname, '..', 'robbie', 'assets', 'robbie.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            sandbox: true
        }
    });

    // Sans carte graphique (machine virtuelle, vieux PC), l'interface passe en mode léger
    const gpu = app.getGPUFeatureStatus().gpu_compositing || '';
    const light = !gpu.startsWith('enabled');
    console.log(`Carte graphique : ${gpu || 'inconnue'}${light ? ' (mode léger)' : ''}`);

    win.loadFile(path.join(__dirname, 'index.html'), { query: light ? { leger: '1' } : {} });

    // État réel de la carte graphique, une fois Chromium bien démarré
    setTimeout(() => {
        const status = app.getGPUFeatureStatus();
        console.log(`Carte graphique (après démarrage) : composition ${status.gpu_compositing}, WebGL ${status.webgl}, canvas ${status['2d_canvas']}`);
    }, 6000);
}

// Raccourci clavier global : labwc envoie SIGUSR2 (touche Super), on ouvre la palette.
// Le numéro du processus est noté pour que labwc sache à qui l'envoyer.
if (!preview) {
    const PID_FILE = path.join(os.homedir(), '.cache', 'robbie-os.pid');
    fs.mkdirSync(path.dirname(PID_FILE), { recursive: true });
    fs.writeFileSync(PID_FILE, String(process.pid));
    process.on('SIGUSR2', () => win?.webContents.send('shortcut', 'palette'));

    // Autres raccourcis (Super+A, Super+N…) : labwc écrit leur nom dans ce fichier
    const COMMAND_FILE = path.join(os.homedir(), '.cache', 'robbie-os.commande');
    fs.writeFileSync(COMMAND_FILE, '');
    fs.watch(COMMAND_FILE, () => {
        const name = fs.readFileSync(COMMAND_FILE, 'utf8').trim();
        if (!name) return;
        fs.writeFileSync(COMMAND_FILE, '');
        // (le verrouillage se fait ici : il doit marcher même si la page ne répond plus)
        if (name === 'verrouiller') verrouillage.lock();
        else if (/^[a-z-]+$/.test(name)) win?.webContents.send('shortcut', name);
    });
}

ipcMain.handle('system', () => systeme.snapshot());
ipcMain.handle('apps', () => applis.list());
ipcMain.handle('launch', (_event, id) => applis.launch(id));
ipcMain.handle('icon', (_event, name) => applis.iconData(String(name)));
ipcMain.handle('open-location', (_event, location) => /^(trash|file):\/\//.test(location) && applis.openLocation(location));
ipcMain.handle('weather', () => meteo.current(notes.getSettings().place));
ipcMain.handle('volume', () => son.volume());
ipcMain.handle('set-volume', (_event, level) => son.setVolume(level));
ipcMain.handle('toggle-mute', () => son.toggleMute());
ipcMain.handle('music', () => son.music());
ipcMain.handle('music-command', (_event, command) => son.musicCommand(command));
ipcMain.handle('notes', () => notes.getNotes());
ipcMain.handle('set-notes', (_event, list) => notes.setNotes(list));
ipcMain.handle('settings', () => notes.getSettings());
ipcMain.handle('set-settings', (_event, changes) => notes.setSettings(changes));
ipcMain.handle('power', (_event, action) => power(action));

// Robbie : cerveau, voix, oreille et actions
let robbie = null;
ipcMain.handle('robbie-demander', (_event, text) => robbie?.ask(text));
ipcMain.handle('robbie-confirmer', (_event, action) => robbie?.confirm(action));
ipcMain.on('robbie-parle', (_event, speaking) => robbie?.setSpeaking(speaking));
ipcMain.on('robbie-panneau', (_event, open) => {
    robbie?.setPanelOpen(open);
    setForeground('robbie', open);
});

// Le bureau reste sous les fenêtres (règle de labwc), sauf quand un panneau est ouvert :
// il passe alors devant, puis repasse dessous. labwc n'a pas de commande pour ça,
// on lui envoie des touches réservées à cet usage (voir rc.xml)
const openPanels = { panneau: false, robbie: false };
let inFront = false;
let foregroundTimer = null;
function setForeground(kind, open) {
    openPanels[kind] = Boolean(open);
    // (passer d'un panneau à l'autre ferme puis rouvre : on attend un peu avant de décider)
    clearTimeout(foregroundTimer);
    foregroundTimer = setTimeout(() => {
        const wanted = openPanels.panneau || openPanels.robbie;
        if (preview || wanted === inFront) return;
        inFront = wanted;
        spawn('wtype', ['-k', wanted ? 'XF86Launch8' : 'XF86Launch9'], { stdio: 'ignore' })
            .on('error', error => console.error('Premier plan impossible :', error.message));
    }, 120);
}
ipcMain.on('panneau', (_event, open) => setForeground('panneau', open));

// Fenêtres ouvertes : suivies pour le dock, et ramenées au premier plan sur demande
ipcMain.handle('fenetres', () => fenetres.list());
ipcMain.handle('fenetre-focus', (_event, appId) => fenetres.focus(String(appId)));

// Barre latérale et coin : agenda, contacts, réseau, luminosité, capture d'écran
ipcMain.handle('agenda', () => notes.getAgenda());
ipcMain.handle('set-agenda', (_event, agenda) => notes.setAgenda(agenda));
ipcMain.handle('contacts', () => notes.getContacts());
ipcMain.handle('set-contacts', (_event, list) => notes.setContacts(list));
ipcMain.handle('reseau', () => reseau.status());
ipcMain.handle('wifi', () => reseau.wifiNetworks());
ipcMain.handle('wifi-connecter', (_event, ssid, password) => reseau.connectWifi(ssid, password));
ipcMain.handle('luminosite', () => luminosite.get());
ipcMain.handle('set-luminosite', (_event, percent) => luminosite.set(percent));
ipcMain.handle('capture', () => actions.execute({ type: 'screenshot' }));

// Réglages : fonds d'écran, voix, écran, informations, ville de la météo
ipcMain.handle('fonds', () => parametres.wallpapers());
ipcMain.handle('voix', () => parametres.voices());
ipcMain.handle('ecrans', () => parametres.displays());
ipcMain.handle('set-resolution', (_event, name, width, height) => parametres.setResolution(name, width, height));
ipcMain.handle('systeme-infos', () => parametres.systemInfo());
ipcMain.handle('chercher-ville', (_event, name) => parametres.searchCity(String(name)));
ipcMain.on('robbie-voix-recharger', () => robbie?.reloadVoice());
ipcMain.on('robbie-oreille-recharger', () => robbie?.reloadEars());
ipcMain.on('verrouiller', () => verrouillage.lock());

// Comptes : qui est connecté, liste, modifications (mot de passe administrateur demandé),
// déconnexion (retour à l'écran d'accueil)
const ACCOUNT_COMMANDS = ['creer', 'rang', 'nom', 'motdepasse', 'supprimer', 'invite', 'enfant'];
ipcMain.handle('moi', () => comptes.me());
ipcMain.handle('comptes', () => comptes.list());
ipcMain.handle('compte-modifier', (_event, args, password, input) => {
    if (!Array.isArray(args) || !ACCOUNT_COMMANDS.includes(args[0])) return { ok: false, error: 'Modification inconnue' };
    return comptes.change(args, String(password || ''), String(input || ''));
});
ipcMain.on('deconnexion', () => {
    robbie?.stop();
    // labwc --exit ferme la session ; l'écran d'accueil revient
    spawn('labwc', ['--exit'], { detached: true, stdio: 'ignore' }).unref();
});
ipcMain.on('inactivite-recharger', () => verrouillage.watchIdle());
ipcMain.on('theme', (_event, name) => !preview && theme.apply(String(name)));
ipcMain.on('barre', (_event, side) => !preview && disposition.applySidebar(String(side)));

// Notifications des applis
let notifications = null;
ipcMain.on('notification-action', (_event, id, key) => notifications?.invoke(id, key));
ipcMain.on('notification-fermer', (_event, id) => notifications?.dismiss(id));

app.whenReady().then(() => {
    protocol.handle('fond', request => {
        const file = new URL(request.url).searchParams.get('chemin') || '';
        if (!parametres.isWallpaper(file)) return new Response('', { status: 403 });
        return net.fetch(pathToFileURL(file).toString());
    });

    createWindow();
    const send = (channel, data) => win?.webContents.send(channel, data);
    robbie = createRobbie({ send });
    if (!preview) {
        fenetres.watch(list => send('fenetres', list));
        verrouillage.watchIdle();
        notifications = createNotifications({
            onNotify: notification => send('notification', notification),
            onClose: id => send('notification-close', id)
        });
    }
});
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => {
    robbie?.stop();
    verrouillage.stop();
});

// Fin de session (déconnexion, extinction) : Robbie s'arrête proprement, avec son oreille et sa voix
for (const signal of ['SIGTERM', 'SIGHUP', 'SIGINT']) {
    process.on(signal, () => {
        robbie?.stop();
        verrouillage.stop();
        app.quit();
    });
}
