// Robbie OS : l'interface, lancée en plein écran au démarrage de la machine
const { app, BrowserWindow, ipcMain } = require('electron');
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

// Nom de l'appli pour Wayland (règles de fenêtre de labwc)
app.setName('robbie-os');

// Robbie parle sans attendre un premier clic dans la page
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

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
}

// Raccourci clavier global : labwc envoie SIGUSR2 (touche Super), on ouvre la palette.
// Le numéro du processus est noté pour que labwc sache à qui l'envoyer.
if (!preview) {
    const PID_FILE = path.join(os.homedir(), '.cache', 'robbie-os.pid');
    fs.mkdirSync(path.dirname(PID_FILE), { recursive: true });
    fs.writeFileSync(PID_FILE, String(process.pid));
    process.on('SIGUSR2', () => win?.webContents.send('shortcut', 'palette'));
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
ipcMain.on('robbie-panneau', (_event, open) => robbie?.setPanelOpen(open));

app.whenReady().then(() => {
    createWindow();
    robbie = createRobbie({ send: (channel, data) => win?.webContents.send(channel, data) });
});
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => robbie?.stop());
