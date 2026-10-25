// Photos de Robbie OS : photothèque, albums, visionneuse, diaporama et retouches.
// Lancée par le dock ou en ouvrant une image (« electron applis/photos [fichier] »)
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const bibliotheque = require('./bibliotheque');

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

// ---- Photothèque ----
ipcMain.handle('bibliotheque', () => bibliotheque.scan());
ipcMain.handle('miniature', (_event, file) => bibliotheque.isInLibrary(file) ? bibliotheque.thumbnail(file) : null);
ipcMain.handle('donnees', () => bibliotheque.getStore());
ipcMain.handle('favori', (_event, files, on) => bibliotheque.toggleFavorite(files.filter(bibliotheque.isInLibrary), on));
ipcMain.handle('album-creer', (_event, name) => bibliotheque.createAlbum(name));
ipcMain.handle('album-renommer', (_event, id, name) => bibliotheque.renameAlbum(id, name));
ipcMain.handle('album-supprimer', (_event, id) => bibliotheque.deleteAlbum(id));
ipcMain.handle('album-ajouter', (_event, id, files) => bibliotheque.addToAlbum(id, files.filter(bibliotheque.isInLibrary)));
ipcMain.handle('album-retirer', (_event, id, files) => bibliotheque.removeFromAlbum(id, files));
ipcMain.handle('retouches', (_event, file, edits) => bibliotheque.isInLibrary(file) && bibliotheque.setEdits(file, edits));
ipcMain.handle('copie-retouchee', (_event, file, buffer) => bibliotheque.isInLibrary(file) && bibliotheque.saveCopy(file, buffer));

// Corbeille (on peut toujours récupérer la photo depuis la corbeille de Robbie OS)
ipcMain.handle('corbeille', async (_event, files) => {
    for (const file of files.filter(bibliotheque.isInLibrary)) await shell.trashItem(file).catch(() => {});
    return bibliotheque.scan();
});

ipcMain.handle('afficher-dossier', (_event, file) => bibliotheque.isInLibrary(file) && shell.showItemInFolder(file));

ipcMain.handle('importer', async (_event, folders) => {
    const result = await dialog.showOpenDialog(win, {
        title: folders ? 'Importer un dossier de photos' : 'Importer des photos',
        buttonLabel: 'Importer',
        defaultPath: fs.existsSync('/media') ? '/media' : os.homedir(),
        properties: folders ? ['openDirectory', 'multiSelections'] : ['openFile', 'multiSelections'],
        filters: folders ? [] : [{ name: 'Photos et vidéos', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif', 'tif', 'tiff', 'mp4', 'webm', 'm4v', 'mov'] }]
    });
    if (result.canceled || !result.filePaths.length) return null;
    return bibliotheque.importFiles(result.filePaths);
});

// ---- Thème de Robbie OS (clair, sombre ou automatique), suivi en direct ----
const SETTINGS = path.join(os.homedir(), '.config', 'robbie-os', 'reglages.json');
function readTheme() {
    try {
        const { theme, place, eyeColor } = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
        return { theme: theme || 'sombre', place, accent: eyeColor };
    } catch {
        return { theme: 'sombre' };
    }
}
ipcMain.handle('theme', () => readTheme());

app.whenReady().then(() => {
    createWindow();
    bibliotheque.watch(list => win?.webContents.send('bibliotheque', list));
    fs.watchFile(SETTINGS, { interval: 2000 }, () => win?.webContents.send('theme', readTheme()));
});

app.on('window-all-closed', () => app.quit());
