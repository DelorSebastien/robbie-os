// Téléphone : la fenêtre d'appel de Robbie OS (image et son en direct entre Robbie OS, partage
// d'écran, sous-titres). Les messages, le journal et le clavier sont dans le tiroir Contacts de la
// barre latérale ; le service du téléphone (service/) tient les liaisons.
// « electron applis/telephone --appel id » ; un lien tel: ou sms: (ou --appeler, --message) est
// passé au tiroir Contacts.
const { app, BrowserWindow, ipcMain, session, desktopCapturer } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { connectService } = require('./service/client');

app.setName('robbie-telephone');
if (process.env.ROBBIE_SANS_GPU) app.disableHardwareAcceleration();
if (!app.requestSingleInstanceLock()) app.quit();
// Appels entre Robbie OS : les adresses du réseau local restent visibles pour WebRTC (Chromium les
// cache derrière des noms .local que le réseau ne sait pas toujours résoudre)
app.commandLine.appendSwitch('disable-features', 'WebRtcHideLocalIpsWithMdns');

const ROOT = path.join(__dirname, '..', '..');
const callWindows = new Map();   // id de l'appel → fenêtre

// ---- Le service (lancé par l'interface) ----
const service = connectService('appli');
for (const event of ['appel', 'appel-fin', 'signal']) {
    service.events.on(event, data => {
        for (const callWin of callWindows.values()) callWin.webContents.send('service', event, data);
    });
}
service.events.on('ouvrir-appel', ({ id }) => openCall(id));

// Ce que la fenêtre d'appel peut demander au service
const ALLOWED = new Set(['appel', 'raccrocher', 'micro', 'appelConnecte', 'signal', 'signauxEnAttente']);
ipcMain.handle('service', async (_event, method, args) => {
    if (!ALLOWED.has(method)) return { erreurService: 'Demande refusée' };
    try {
        return await service.call(method, ...[].concat(args || []));
    } catch (error) {
        return { erreurService: error.message };
    }
});

// Une demande pour le tiroir Contacts : passée par le service à l'interface
function toDrawer(request) {
    const sendIt = () => service.call('ouvrirTiroir', request).catch(() => {}).finally(quitIfIdle);
    if (service.connected) sendIt();
    else {
        service.events.once('connecte', sendIt);
        setTimeout(quitIfIdle, 4000);
    }
}
const quitIfIdle = () => !callWindows.size && app.quit();

// Ce qu'on demande en lançant l'appli : une fenêtre d'appel, appeler un numéro, écrire à quelqu'un
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
    return {};
}

function handle(request) {
    if (request.appel) openCall(request.appel);
    else toDrawer(request);
}

// Fenêtre d'appel (Robbie OS : image et son en direct, sous-titres)
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
        service.call('appel', id).then(call => call && service.call('raccrocher', id)).catch(() => {}).finally(quitIfIdle);
    });
}

ipcMain.on('fermer-appel', event => BrowserWindow.fromWebContents(event.sender)?.close());
// (pendant un appel : écrire à la personne, dans le tiroir Contacts)
ipcMain.on('ouvrir-conversation', (_event, who) => service.call('ouvrirTiroir', { message: String(who) }).catch(() => {}));

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

app.on('second-instance', (_event, argv) => handle(requestOf(argv)));

app.whenReady().then(() => {
    // Caméra et micro pour les appels ; partage d'écran : l'écran choisi par le système
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback(['media', 'display-capture'].includes(permission)));
    session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
        desktopCapturer.getSources({ types: ['screen'] }).then(sources => callback(sources[0] ? { video: sources[0] } : {})).catch(() => callback({}));
    }, { useSystemPicker: true });
    handle(requestOf(process.argv));
});
// (sans fenêtre d'appel, l'appli ne reste pas ouverte)
app.on('window-all-closed', () => {});
