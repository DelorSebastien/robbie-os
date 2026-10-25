// Photos de Robbie OS : photothèque, albums, visionneuse, diaporama et retouches.
// Lancée par le dock ou en ouvrant une image (« electron applis/photos [fichier] »)
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

// Nom de l'appli pour Wayland (le dock la reconnaît, labwc lui met sa barre de titre)
app.setName('robbie-photos');
if (process.env.ROBBIE_SANS_GPU) app.disableHardwareAcceleration();

// Une seule fenêtre : ouvrir une autre image la montre dans celle déjà ouverte
if (!app.requestSingleInstanceLock()) app.quit();

let win = null;
const imageArgument = argv => argv.slice(1).map(arg => path.resolve(arg)).find(arg => /\.(jpe?g|png|webp|gif|bmp|avif|tiff?|mp4|webm|m4v|mov|ogv)$/i.test(arg) && fs.existsSync(arg));
// Un dossier (clic droit › « Voir dans Photos » dans l'explorateur) : ses photos et vidéos
const folderArgument = argv => argv.slice(1).filter(arg => !arg.startsWith('-')).map(arg => path.resolve(arg)).find(arg => {
    try {
        return arg !== __dirname && fs.statSync(arg).isDirectory();
    } catch {
        return false;
    }
});
function openArguments(argv) {
    const file = imageArgument(argv);
    if (file) win.webContents.send('ouvrir', file);
    const folder = folderArgument(argv);
    if (folder) win.webContents.send('dossier', folder);
}

function createWindow() {
    win = new BrowserWindow({
        width: 1180,
        height: 760,
        minWidth: 720,
        minHeight: 480,
        title: 'Photos',
        transparent: true,
        backgroundColor: '#00000000',
        icon: path.join(__dirname, 'photos.svg'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            sandbox: true
        }
    });
    win.removeMenu();
    win.loadFile(path.join(__dirname, 'index.html'));
    win.webContents.once('did-finish-load', () => {
        openArguments(process.argv);
    });
}

app.on('second-instance', (_event, argv) => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
    openArguments(argv);
});

// ---- Photothèque, albums, importation, thème : partagés avec l'explorateur ----
require('./ipc').register({ getWindow: () => win, send: (channel, data) => win?.webContents.send(channel, data) });

app.whenReady().then(createWindow);

app.on('window-all-closed', () => app.quit());
