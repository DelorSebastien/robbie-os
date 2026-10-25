// Ce que la page de Photos demande au système : photothèque, albums, retouches, importation,
// thème. Partagé par l'appli Photos et par l'explorateur, qui l'affiche dans sa fenêtre.
const { ipcMain, dialog, shell } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const bibliotheque = require('./bibliotheque');

const SETTINGS = path.join(os.homedir(), '.config', 'robbie-os', 'reglages.json');

function readTheme() {
    try {
        const { theme, place, eyeColor } = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
        return { theme: theme || 'sombre', place, accent: eyeColor };
    } catch {
        return { theme: 'sombre' };
    }
}

// `getWindow()` : la fenêtre (pour les boîtes de dialogue) ; `send(canal, données)` : prévient la page
function register({ getWindow, send }) {
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
        const result = await dialog.showOpenDialog(getWindow(), {
            title: folders ? 'Importer un dossier de photos' : 'Importer des photos',
            buttonLabel: 'Importer',
            defaultPath: fs.existsSync('/media') ? '/media' : os.homedir(),
            properties: folders ? ['openDirectory', 'multiSelections'] : ['openFile', 'multiSelections'],
            filters: folders ? [] : [{ name: 'Photos et vidéos', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif', 'tif', 'tiff', 'mp4', 'webm', 'm4v', 'mov'] }]
        });
        if (result.canceled || !result.filePaths.length) return null;
        return bibliotheque.importFiles(result.filePaths);
    });

    // Thème de Robbie OS (clair, sombre ou automatique), suivi en direct
    ipcMain.handle('theme', () => readTheme());

    bibliotheque.watch(list => send('bibliotheque', list));
    fs.watchFile(SETTINGS, { interval: 2000 }, () => send('theme', readTheme()));
}

module.exports = { register, readTheme };
