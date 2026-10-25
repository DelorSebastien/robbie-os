// Fichiers : l'explorateur de Robbie OS. Dossiers, corbeille, clés USB, et Photos dans la même
// fenêtre (la photothèque, les albums et la visionneuse de l'appli Photos y sont affichés).
// « electron applis/fichiers [dossier] » ; un dossier ouvert ailleurs arrive dans la fenêtre déjà ouverte
const { app, BrowserWindow, ipcMain, shell, dialog, clipboard, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const ops = require('./operations');
const bibliotheque = require('../photos/bibliotheque');

// Nom de l'appli pour Wayland (le dock la reconnaît, labwc lui met sa barre de titre)
app.setName('robbie-fichiers');
if (process.env.ROBBIE_SANS_GPU) app.disableHardwareAcceleration();

if (!app.requestSingleInstanceLock()) app.quit();

let win = null;
// Le cadre de Photos dans la fenêtre : la photothèque et le thème lui sont envoyés
let photosFrame = null;

// (« corbeille », ou un dossier / fichier, éventuellement en adresse file://)
const folderArgument = argv => {
    const args = argv.slice(1).filter(arg => !arg.startsWith('-'));
    if (args.some(arg => arg === 'corbeille' || arg.startsWith('trash:'))) return 'corbeille';
    return args.map(arg => path.resolve(decodeURIComponent(arg.replace(/^file:\/\//, '')))).find(arg => arg !== __dirname && fs.existsSync(arg));
};

function createWindow() {
    win = new BrowserWindow({
        width: 1180,
        height: 740,
        minWidth: 720,
        minHeight: 460,
        title: 'Fichiers',
        transparent: true,
        backgroundColor: '#00000000',
        icon: path.join(__dirname, 'fichiers.svg'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            sandbox: true,
            // (Photos est affichée dans un cadre : elle a besoin du même pont)
            nodeIntegrationInSubFrames: true
        }
    });
    win.removeMenu();
    win.loadFile(path.join(__dirname, 'index.html'));
    win.webContents.once('did-finish-load', () => {
        const target = folderArgument(process.argv);
        if (target) win.webContents.send('aller', target);
    });
}

app.on('second-instance', (_event, argv) => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
    const target = folderArgument(argv);
    if (target) win.webContents.send('aller', target);
});

// ---- Photos, dans la fenêtre ----
require('../photos/ipc').register({
    getWindow: () => win,
    send: (channel, data) => {
        try {
            photosFrame?.send(channel, data);
        } catch {}
    }
});
ipcMain.on('photos-cadre', event => {
    photosFrame = event.senderFrame;
});

// ---- Dossiers ----
const safe = fn => async (...args) => {
    try {
        return { ok: true, valeur: await fn(...args) };
    } catch (error) {
        return { ok: false, erreur: errorText(error) };
    }
};
function errorText(error) {
    if (error.code === 'EACCES' || error.code === 'EPERM') return 'Tu n’as pas le droit de faire ça ici';
    if (error.code === 'ENOENT') return 'Ce fichier ou ce dossier n’existe plus';
    if (error.code === 'ENOSPC') return 'Plus assez de place sur le disque';
    if (error.code === 'EEXIST') return 'Un élément porte déjà ce nom';
    return error.message || 'Opération impossible';
}

ipcMain.handle('f-dossiers-perso', () => ops.userDirs());
ipcMain.handle('f-lister', safe((_event, dir, hidden) => ops.list(String(dir), Boolean(hidden))));
ipcMain.handle('f-existe', (_event, file) => {
    try {
        return fs.statSync(String(file)).isDirectory() ? 'dossier' : 'fichier';
    } catch {
        return null;
    }
});
ipcMain.handle('f-miniature', async (_event, file) => {
    const thumb = await bibliotheque.thumbnail(String(file)).catch(() => null);
    return thumb ? 'file://' + thumb.split('/').map(encodeURIComponent).join('/') : null;
});
ipcMain.handle('f-icone', (_event, names) => ops.iconData([].concat(names)));

// Ouvrir un fichier avec son appli habituelle
ipcMain.handle('f-ouvrir', async (_event, file) => {
    const error = await shell.openPath(String(file));
    return error ? { ok: false, erreur: 'Aucune appli ne sait ouvrir ce fichier' } : { ok: true };
});
ipcMain.handle('f-terminal', (_event, dir) => {
    spawn('foot', ['--working-directory', String(dir)], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
});
ipcMain.handle('f-fond', (_event, file) => {
    spawn('/usr/local/lib/robbie-os/fond', [String(file)], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
});
ipcMain.handle('f-copier-chemin', (_event, text) => clipboard.writeText(String(text)));

// Copier ou déplacer : la progression revient à la page (« f-progression »)
let nextJob = 1;
ipcMain.handle('f-transferer', async (_event, sources, destination, move) => {
    const job = nextJob++;
    let last = 0;
    try {
        const results = await ops.transfer(sources.map(String), String(destination), Boolean(move), (done, total, name) => {
            const now = Date.now();
            if (now - last < 120 && done < total) return;
            last = now;
            win?.webContents.send('f-progression', { job, fait: done, total, nom: name, deplacer: Boolean(move) });
        });
        return { ok: true, valeur: results };
    } catch (error) {
        win?.webContents.send('f-progression', { job, fini: true });
        return { ok: false, erreur: errorText(error) };
    }
});

ipcMain.handle('f-corbeille', safe(async (_event, files) => {
    for (const file of files) await shell.trashItem(String(file));
}));
ipcMain.handle('f-renommer', safe(async (_event, file, name) => {
    const clean = String(name).trim();
    if (!clean || clean.includes('/') || clean === '.' || clean === '..') throw new Error('Ce nom n’est pas possible');
    const target = path.join(path.dirname(String(file)), clean);
    if (target !== file && fs.existsSync(target)) throw Object.assign(new Error(), { code: 'EEXIST' });
    await fs.promises.rename(String(file), target);
    return target;
}));
ipcMain.handle('f-nouveau-dossier', safe(async (_event, dir) => {
    const target = ops.freeName(String(dir), 'Nouveau dossier');
    await fs.promises.mkdir(target);
    return target;
}));
ipcMain.handle('f-proprietes', safe((_event, file) => ops.properties(String(file))));

// Corbeille
ipcMain.handle('f-corbeille-lister', safe(() => ops.trashList()));
ipcMain.handle('f-restaurer', safe((_event, files) => ops.restore(files.map(String))));
ipcMain.handle('f-supprimer', safe((_event, files) => ops.deleteForever(files.map(String))));
ipcMain.handle('f-vider-corbeille', safe(() => ops.emptyTrash()));
ipcMain.handle('f-confirmer', async (_event, title, detail, button) => {
    const { response } = await dialog.showMessageBox(win, { type: 'warning', message: String(title), detail: String(detail || ''), buttons: ['Annuler', String(button)], defaultId: 1, cancelId: 0 });
    return response === 1;
});

// Disques et clés USB, signets, place libre
ipcMain.handle('f-appareils', () => ops.devices());
ipcMain.handle('f-monter', (_event, device) => ops.mount(String(device)));
ipcMain.handle('f-ejecter', (_event, device) => ops.eject(String(device)));
ipcMain.handle('f-espace', (_event, dir) => ops.diskSpace(String(dir)));
ipcMain.handle('f-signets', () => ops.bookmarks());
ipcMain.handle('f-signet-ajouter', (_event, dir) => ops.addBookmark(String(dir)));
ipcMain.handle('f-signet-retirer', (_event, dir) => ops.removeBookmark(String(dir)));

// Glisser des fichiers vers une autre appli (navigateur, courrier…)
ipcMain.on('f-glisser', (event, files) => {
    const icon = nativeImage.createFromDataURL(ops.iconData(['text-x-generic', 'unknown']) || 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=');
    event.sender.startDrag({ files: files.map(String), icon: icon.isEmpty() ? nativeImage.createEmpty() : icon.resize({ width: 48 }) });
});

// Le dossier affiché change sur le disque : la page relit
let watcher = null;
ipcMain.on('f-surveiller', (_event, dir) => {
    watcher?.close();
    watcher = null;
    let timer = null;
    try {
        watcher = fs.watch(String(dir), () => {
            clearTimeout(timer);
            timer = setTimeout(() => win?.webContents.send('f-change'), 250);
        });
    } catch {}
});

// Les clés USB branchées ou retirées : la barre latérale suit
let lastDevices = '';
setInterval(async () => {
    const list = JSON.stringify(await ops.devices());
    if (list !== lastDevices) {
        lastDevices = list;
        win?.webContents.send('f-appareils');
    }
}, 3000);

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
