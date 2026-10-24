// Logithèque de Robbie OS : vitrine de Flathub, catégories, recherche (Flathub et Debian),
// fiches avec captures, installation en un clic, applis installées et mises à jour.
// Lancée par le dock, ou sur ses mises à jour (« electron applis/logitheque --mises-a-jour »)
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const catalogue = require('./catalogue');
const logiciels = require('./logiciels');
const misesAJour = require('../../interface/services/mises-a-jour');
const applis = require('../../interface/services/applis');

// Nom de l'appli pour Wayland (le dock la reconnaît, labwc lui met sa barre de titre)
app.setName('robbie-logitheque');
if (process.env.ROBBIE_SANS_GPU) app.disableHardwareAcceleration();

// Une seule fenêtre : la rouvrir la ramène devant
if (!app.requestSingleInstanceLock()) app.quit();

let win = null;
const wantsUpdates = argv => argv.includes('--mises-a-jour');

function createWindow() {
    win = new BrowserWindow({
        width: 1200,
        height: 780,
        minWidth: 760,
        minHeight: 520,
        title: 'Logithèque',
        transparent: true,
        backgroundColor: '#00000000',
        icon: path.join(__dirname, 'logitheque.svg'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            sandbox: true
        }
    });
    win.removeMenu();
    win.loadFile(path.join(__dirname, 'index.html'));
    win.webContents.once('did-finish-load', () => {
        if (wantsUpdates(process.argv)) win.webContents.send('ouvrir', 'mises-a-jour');
    });
    // (les liens des fiches s'ouvrent dans le navigateur)
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (/^https?:\/\//.test(url)) shell.openExternal(url);
        return { action: 'deny' };
    });
}

app.on('second-instance', (_event, argv) => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
    if (wantsUpdates(argv)) win.webContents.send('ouvrir', 'mises-a-jour');
});

// Icône d'une appli de Debian : celle du thème d'icônes (le catalogue n'en fournit pas)
const withIcon = list => list.map(item => item.source === 'debian' && !item.iconData ? { ...item, iconData: applis.iconData(item.iconName) } : item);

// ---- Catalogue ----
ipcMain.handle('vitrine', () => catalogue.showcase());
ipcMain.handle('categorie', (_event, id, page) => catalogue.category(String(id), Number(page) || 1));
ipcMain.handle('chercher', async (_event, query) => {
    const results = await catalogue.search(String(query));
    return { ...results, debian: withIcon(results.debian) };
});
ipcMain.handle('fiche', async (_event, source, id) => {
    const card = await catalogue.details(source === 'debian' ? 'debian' : 'flathub', String(id));
    return withIcon([card])[0];
});

// ---- Installées, installer, désinstaller, ouvrir ----
const isApp = item => item && ['flathub', 'debian'].includes(item.source) && /^[\w.+-]+$/.test(item.id || '');
const appOf = item => ({ source: item.source, id: item.id, desktop: typeof item.desktop === 'string' ? item.desktop : undefined });

ipcMain.handle('installees', async () => withIcon(await logiciels.installed()));
ipcMain.handle('administrateur', () => logiciels.isAdmin());

// La progression revient à la page par « progression » (une clé par appli : source/id)
for (const [channel, action] of [['installer', logiciels.install], ['desinstaller', logiciels.uninstall]]) {
    ipcMain.handle(channel, (_event, item, password) => {
        if (!isApp(item)) return { ok: false, error: 'Appli inconnue' };
        const key = `${item.source}/${item.id}`;
        return action(appOf(item), String(password || ''), progress => win?.webContents.send('progression', { key, ...progress }));
    });
}
ipcMain.handle('ouvrir-appli', (_event, item) => isApp(item) && logiciels.open(appOf(item)));
ipcMain.handle('site', (_event, url) => /^https?:\/\//.test(url) && shell.openExternal(url));

// ---- Mises à jour ----
ipcMain.handle('mises-a-jour', () => misesAJour.read());
ipcMain.handle('mettre-a-jour', () => misesAJour.install());
ipcMain.handle('verifier', () => misesAJour.check());
ipcMain.handle('redemarrer', () => misesAJour.restart());

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
    misesAJour.watch(state => win?.webContents.send('mises-a-jour', state));
    fs.watchFile(SETTINGS, { interval: 2000 }, () => win?.webContents.send('theme', readTheme()));
});

app.on('window-all-closed', () => app.quit());
