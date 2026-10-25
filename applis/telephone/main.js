// Téléphone : les SMS et les appels du téléphone Android relié (appli Robbie Lien), et les
// messages et appels audio ou vidéo entre ordinateurs Robbie OS. Le service du téléphone
// (service/) tient les liaisons ; l'appli les montre, et ouvre la fenêtre d'appel.
// « electron applis/telephone [--appeler numéro] [--message numéro] [--appel id] »
const { app, BrowserWindow, ipcMain, dialog, shell, session, desktopCapturer } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { connectService } = require('./service/client');

app.setName('robbie-telephone');
if (process.env.ROBBIE_SANS_GPU) app.disableHardwareAcceleration();
if (!app.requestSingleInstanceLock()) app.quit();
// Appels entre Robbie OS : les adresses du réseau local restent visibles pour WebRTC (Chromium les
// cache derrière des noms .local que le réseau ne sait pas toujours résoudre)
app.commandLine.appendSwitch('disable-features', 'WebRtcHideLocalIpsWithMdns');

const HOME = os.homedir();
const ROOT = path.join(__dirname, '..', '..');
const SETTINGS = path.join(HOME, '.config', 'robbie-os', 'reglages.json');

let win = null;
const callWindows = new Map();   // id de l'appel → fenêtre
let pendingRequest = null;

// ---- Le service (lancé par l'interface ; sinon par l'appli elle-même) ----
const service = connectService('appli');
let serviceStarted = false;
setTimeout(() => {
    if (service.connected || serviceStarted) return;
    serviceStarted = true;
    spawn(process.execPath, [path.join(__dirname, 'service')], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, detached: true, stdio: 'ignore' }).unref();
}, 1200);

const EVENTS = ['etat', 'message', 'message-modifie', 'conversations', 'lus', 'appels', 'appel', 'appel-fin', 'presence', 'contacts', 'pairs', 'demande', 'telephone-relie', 'signal'];
for (const event of EVENTS) {
    service.events.on(event, data => {
        win?.webContents.send('service', event, data);
        for (const callWin of callWindows.values()) callWin.webContents.send('service', event, data);
    });
}
service.events.on('connecte', () => win?.webContents.send('service', 'connecte', null));
service.events.on('ouvrir-appel', ({ id }) => openCall(id));

// Ce que les pages peuvent demander au service
const ALLOWED = new Set(['etat', 'conversations', 'messages', 'envoyer', 'lire', 'supprimerConversation', 'personne', 'appels', 'appeler', 'decrocher', 'raccrocher', 'micro', 'appel', 'appelConnecte', 'signal', 'signauxEnAttente', 'favoris', 'setFavoris', 'appareils', 'proches', 'pairs', 'demanderContact', 'repondreDemande', 'suggestions', 'nouvelleLiaison', 'annulerLiaison', 'oublierAppareil', 'supprimerMessage']);
ipcMain.handle('service', async (_event, method, args) => {
    if (!ALLOWED.has(method)) return { erreurService: 'Demande refusée' };
    try {
        return await service.call(method, ...[].concat(args || []));
    } catch (error) {
        return { erreurService: error.message };
    }
});

// ---- Contacts de Robbie OS (le même fichier que la barre latérale) ----
const CONTACTS = path.join(HOME, '.config', 'robbie-os', 'contacts.json');
ipcMain.handle('contacts', () => {
    try {
        const list = JSON.parse(fs.readFileSync(CONTACTS, 'utf8'));
        return Array.isArray(list) ? list : [];
    } catch {
        return [];
    }
});
ipcMain.handle('ajouter-contact', (_event, contact) => {
    let list = [];
    try {
        list = JSON.parse(fs.readFileSync(CONTACTS, 'utf8'));
    } catch {}
    const entry = { name: String(contact?.name || '').trim().slice(0, 80), phone: String(contact?.phone || '').slice(0, 40), email: '', note: '', ...(contact?.robbie ? { robbie: String(contact.robbie) } : {}) };
    if (!entry.name) return { ok: false };
    list.push(entry);
    fs.mkdirSync(path.dirname(CONTACTS), { recursive: true });
    fs.writeFileSync(`${CONTACTS}.tmp`, JSON.stringify(list, null, 2));
    fs.renameSync(`${CONTACTS}.tmp`, CONTACTS);
    return { ok: true };
});

// ---- Fichiers joints ----
ipcMain.handle('choisir-fichier', async () => {
    const result = await dialog.showOpenDialog(win, { title: 'Joindre un fichier', buttonLabel: 'Joindre', defaultPath: HOME, properties: ['openFile'] });
    return result.canceled ? null : result.filePaths[0];
});
const PIECES = path.join(process.env.ROBBIE_TELEPHONE_DIR || path.join(HOME, '.local', 'share', 'robbie-os', 'telephone'), 'pieces');
ipcMain.handle('ouvrir-piece', (_event, file) => {
    const target = path.resolve(String(file));
    if (path.dirname(target) === PIECES) shell.openPath(target);
});

// Codes QR (liaison du téléphone, installation de Robbie Lien)
ipcMain.handle('qr', (_event, text) => require('qrcode').toDataURL(String(text).slice(0, 1000), { margin: 1, width: 440, errorCorrectionLevel: 'M' }));

// ---- Thème de Robbie OS ----
function readTheme() {
    try {
        const { theme, eyeColor } = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
        return { theme: theme || 'sombre', accent: eyeColor };
    } catch {
        return { theme: 'sombre' };
    }
}
ipcMain.handle('theme', () => readTheme());

// ---- Fenêtres ----
// Ce qu'on demande en lançant l'appli : appeler un numéro, écrire à quelqu'un, une fenêtre d'appel
function requestOf(argv) {
    // (Electron range ses options en premier : la valeur est le premier argument suivant qui n'est
    // pas le dossier de l'appli)
    const value = flag => {
        const at = argv.indexOf(flag);
        if (at < 0) return null;
        const found = argv.slice(at + 1).find(arg => !arg.startsWith('--') && path.resolve(arg) !== __dirname);
        return found ? String(found) : null;
    };
    if (value('--appel')) return { appel: value('--appel') };
    if (value('--appeler')) return { appeler: value('--appeler'), video: argv.includes('--video') };
    if (value('--message')) return { message: value('--message') };
    const url = argv.find(arg => /^(tel|sms|smsto):/i.test(arg));
    if (url) {
        const number = decodeURIComponent(url.replace(/^[a-z]+:(\/\/)?/i, '').split('?')[0]);
        return /^tel:/i.test(url) ? { appeler: number } : { message: number };
    }
    return null;
}

function handle(request) {
    if (!request) return;
    if (request.appel) return openCall(request.appel);
    // (fenêtre pas encore prête : la demande attend la fin du chargement)
    if (!win || win.webContents.isLoading()) return (pendingRequest = request);
    win.webContents.send('demande', request);
}

function createWindow() {
    win = new BrowserWindow({
        width: 1120,
        height: 700,
        minWidth: 760,
        minHeight: 520,
        title: 'Téléphone',
        transparent: true,
        backgroundColor: '#00000000',
        icon: path.join(__dirname, 'telephone.svg'),
        webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, spellcheck: true }
    });
    win.removeMenu();
    win.webContents.session.setSpellCheckerLanguages(['fr']);
    win.loadFile(path.join(__dirname, 'index.html'));
    win.webContents.once('did-finish-load', () => {
        if (pendingRequest) win.webContents.send('demande', pendingRequest);
        pendingRequest = null;
    });
    win.on('closed', () => {
        win = null;
    });
}

// Fenêtre d'appel (Robbie OS : image et son en direct, sous-titres ; téléphone : son sur le téléphone)
function openCall(id) {
    if (callWindows.has(id)) {
        callWindows.get(id).focus();
        return;
    }
    const callWin = new BrowserWindow({
        width: 1120,
        height: 700,
        minWidth: 560,
        minHeight: 400,
        title: 'Appel',
        backgroundColor: '#02060d',
        icon: path.join(__dirname, 'telephone.svg'),
        webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true }
    });
    callWin.removeMenu();
    callWin.loadFile(path.join(__dirname, 'appel.html'), { query: { id } });
    callWindows.set(id, callWin);
    const contentsId = callWin.webContents.id;
    if (process.env.ROBBIE_DEBUG) callWin.webContents.on('console-message', (_e, _level, message) => console.log('[appel]', message));
    callWin.on('closed', () => {
        callWindows.delete(id);
        stopSubtitles(contentsId);
        // (fenêtre fermée pendant l'appel : on raccroche)
        service.call('appel', id).then(call => call && call.canal === 'robbie' && service.call('raccrocher', id)).catch(() => {});
        if (!win && !callWindows.size) app.quit();
    });
}

ipcMain.on('fermer-appel', event => BrowserWindow.fromWebContents(event.sender)?.close());
// (pendant un appel : écrire à la personne, dans la fenêtre principale)
ipcMain.on('ouvrir-conversation', (_event, who) => {
    if (!win) createWindow();
    else win.focus();
    handle({ message: String(who) });
});

// ---- Sous-titres : l'oreille de Robbie (Whisper) écoute le son de l'autre personne ----
const VENV = path.join(ROOT, '.venv', 'bin', 'python');
const PYTHON = fs.existsSync(VENV) ? VENV : 'python3';
const subtitles = new Map();     // fenêtre → processus Python
function stopSubtitles(id) {
    subtitles.get(id)?.kill();
    subtitles.delete(id);
}
ipcMain.handle('sous-titres', (event, on) => {
    const id = event.sender.id;
    stopSubtitles(id);
    if (!on) return { ok: true };
    const child = spawn(PYTHON, [path.join(ROOT, 'robbie', 'python', 'sous_titres.py')], {
        env: { ...process.env, PYTHONUNBUFFERED: '1', ...(fs.existsSync(path.join(ROOT, 'modeles')) ? { HF_HOME: path.join(ROOT, 'modeles'), HF_HUB_OFFLINE: '1' } : {}) },
        stdio: ['pipe', 'pipe', 'pipe']
    });
    let buffer = '';
    let errors = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
        buffer += chunk;
        let end;
        while ((end = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, end);
            buffer = buffer.slice(end + 1);
            try {
                const data = JSON.parse(line);
                if (!event.sender.isDestroyed()) event.sender.send('sous-titre', data);
            } catch {}
        }
    });
    child.stderr.on('data', chunk => (errors = (errors + chunk).slice(-2000)));
    child.on('exit', code => {
        if (subtitles.get(id) !== child) return;
        subtitles.delete(id);
        if (code && !event.sender.isDestroyed()) {
            console.error('Sous-titres :', errors);
            event.sender.send('sous-titre', { erreur: /No module named/.test(errors) ? 'L’oreille de Robbie n’est pas installée' : 'Les sous-titres se sont arrêtés' });
        }
    });
    child.stdin.on('error', () => {});
    subtitles.set(id, child);
    return { ok: true };
});
// Le son de l'autre personne, en morceaux (16 kHz, 16 bits)
ipcMain.on('sous-titres-son', (event, chunk) => {
    const child = subtitles.get(event.sender.id);
    if (child && chunk) child.stdin.write(Buffer.from(chunk));
});

app.on('second-instance', (_event, argv) => {
    const request = requestOf(argv);
    if (request?.appel) return openCall(request.appel);
    if (!win) createWindow();
    else {
        if (win.isMinimized()) win.restore();
        win.focus();
    }
    handle(request);
});

app.whenReady().then(() => {
    // Caméra et micro pour les appels ; partage d'écran : l'écran choisi par le système
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback(['media', 'display-capture', 'notifications'].includes(permission)));
    session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
        desktopCapturer.getSources({ types: ['screen'] }).then(sources => callback(sources[0] ? { video: sources[0] } : {})).catch(() => callback({}));
    }, { useSystemPicker: true });
    const request = requestOf(process.argv);
    // (lancée seulement pour un appel : pas de fenêtre principale)
    if (request?.appel) openCall(request.appel);
    else {
        createWindow();
        handle(request);
    }
    fs.watchFile(SETTINGS, { interval: 2000 }, () => {
        for (const w of BrowserWindow.getAllWindows()) w.webContents.send('theme', readTheme());
    });
});
app.on('window-all-closed', () => app.quit());
