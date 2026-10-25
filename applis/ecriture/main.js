// Écriture : l'éditeur de texte de Robbie OS. Documents Word (.docx), export PDF, documents
// récents, enregistrement automatique, et Robbie pour corriger, reformuler ou résumer.
// « electron applis/ecriture [fichier.docx] »
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const docx = require('./docx');

app.setName('robbie-ecriture');
if (process.env.ROBBIE_SANS_GPU) app.disableHardwareAcceleration();
if (!app.requestSingleInstanceLock()) app.quit();

const HOME = os.homedir();
const STORE = path.join(HOME, '.config', 'robbie-os', 'ecriture.json');
const OLLAMA = process.env.ROBBIE_OLLAMA || 'http://127.0.0.1:11434';
const MODEL = process.env.ROBBIE_MODEL || 'qwen3:8b';
const OPENABLE = /\.(docx|txt|md|html?)$/i;

let win = null;

function documentsDir() {
    try {
        const text = fs.readFileSync(path.join(HOME, '.config', 'user-dirs.dirs'), 'utf8');
        const match = text.match(/XDG_DOCUMENTS_DIR="(.+)"/);
        if (match) return match[1].replace('$HOME', HOME);
    } catch {}
    return path.join(HOME, 'Documents');
}

const fileArgument = argv => argv.slice(1).filter(arg => !arg.startsWith('-')).map(arg => path.resolve(decodeURIComponent(arg.replace(/^file:\/\//, ''))))
    .find(arg => arg !== __dirname && OPENABLE.test(arg) && fs.existsSync(arg));

function createWindow() {
    win = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 760,
        minHeight: 500,
        title: 'Écriture',
        transparent: true,
        backgroundColor: '#00000000',
        icon: path.join(__dirname, 'ecriture.svg'),
        webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, spellcheck: true }
    });
    win.removeMenu();
    win.webContents.session.setSpellCheckerLanguages(['fr']);
    win.loadFile(path.join(__dirname, 'index.html'));
    win.webContents.once('did-finish-load', () => {
        const file = fileArgument(process.argv);
        if (file) win.webContents.send('ouvrir', file);
    });
    // (fermer avec des modifications pas encore écrites : la page termine son enregistrement)
    win.on('close', event => {
        if (win.forceClose) return;
        event.preventDefault();
        win.webContents.send('fermeture');
        setTimeout(() => { win.forceClose = true; win.close(); }, 1500);
    });
}

app.on('second-instance', (_event, argv) => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
    const file = fileArgument(argv);
    if (file) win.webContents.send('ouvrir', file);
});

// ---- Documents récents ----
function readStore() {
    try {
        return JSON.parse(fs.readFileSync(STORE, 'utf8'));
    } catch {
        return { recents: [] };
    }
}
function writeStore(store) {
    fs.mkdirSync(path.dirname(STORE), { recursive: true });
    fs.writeFileSync(STORE, JSON.stringify(store, null, 2));
}
function remember(file) {
    const store = readStore();
    store.recents = [file, ...store.recents.filter(f => f !== file)].slice(0, 12);
    writeStore(store);
}
ipcMain.handle('recents', () => readStore().recents.filter(f => fs.existsSync(f)).map(f => ({ chemin: f, nom: path.basename(f).replace(/\.[^.]+$/, ''), modifie: fs.statSync(f).mtimeMs, dossier: path.dirname(f).replace(HOME, '~') })));
ipcMain.handle('oublier', (_event, file) => {
    const store = readStore();
    store.recents = store.recents.filter(f => f !== file);
    writeStore(store);
});

// ---- Ouvrir ----
async function read(file) {
    const ext = path.extname(file).toLowerCase();
    if (ext === '.docx') return { html: await docx.open(file) };
    const text = fs.readFileSync(file, 'utf8');
    if (ext === '.html' || ext === '.htm') return { html: text };
    return { texte: text };
}

ipcMain.handle('lire', async (_event, file) => {
    try {
        const content = await read(String(file));
        remember(String(file));
        return { ok: true, chemin: String(file), nom: path.basename(String(file)), ...content };
    } catch (error) {
        return { ok: false, erreur: error.code === 'ENOENT' ? 'Ce document n’existe plus' : 'Ce document ne peut pas être ouvert' };
    }
});

ipcMain.handle('ouvrir-dialogue', async () => {
    const result = await dialog.showOpenDialog(win, {
        title: 'Ouvrir un document',
        buttonLabel: 'Ouvrir',
        defaultPath: documentsDir(),
        properties: ['openFile'],
        filters: [{ name: 'Documents', extensions: ['docx', 'txt', 'md', 'html'] }]
    });
    return result.canceled ? null : result.filePaths[0];
});

// ---- Enregistrer ----
// Un nouveau document reçoit un nom libre dans Documents, tiré de son titre
ipcMain.handle('nom-libre', (_event, title) => {
    const base = String(title || 'Sans titre').replace(/[\\/:*?"<>|\n\r]+/g, ' ').trim().slice(0, 60) || 'Sans titre';
    const dir = documentsDir();
    fs.mkdirSync(dir, { recursive: true });
    let target = path.join(dir, `${base}.docx`);
    for (let n = 2; fs.existsSync(target); n++) target = path.join(dir, `${base} (${n}).docx`);
    return target;
});

ipcMain.handle('enregistrer', async (_event, file, doc) => {
    try {
        const target = String(file);
        if (/\.txt$/i.test(target)) fs.writeFileSync(target, doc.texte || '');
        else await docx.save(target, doc);
        remember(target);
        return { ok: true, chemin: target, nom: path.basename(target) };
    } catch (error) {
        return { ok: false, erreur: error.code === 'EACCES' ? 'Tu n’as pas le droit d’écrire ici' : 'L’enregistrement a échoué' };
    }
});

ipcMain.handle('enregistrer-sous', async (_event, suggestion) => {
    const result = await dialog.showSaveDialog(win, {
        title: 'Enregistrer le document',
        buttonLabel: 'Enregistrer',
        defaultPath: path.join(documentsDir(), `${String(suggestion || 'Sans titre')}.docx`),
        filters: [{ name: 'Document Word', extensions: ['docx'] }, { name: 'Texte brut', extensions: ['txt'] }]
    });
    return result.canceled ? null : result.filePath;
});

// Renommer le document (depuis son nom en haut de la fenêtre)
ipcMain.handle('renommer', (_event, file, name) => {
    const clean = String(name).replace(/[\\/:*?"<>|\n\r]+/g, ' ').trim();
    if (!clean) return { ok: false, erreur: 'Ce nom n’est pas possible' };
    const target = path.join(path.dirname(String(file)), clean + path.extname(String(file)));
    if (target === file) return { ok: true, chemin: target };
    if (fs.existsSync(target)) return { ok: false, erreur: 'Un document porte déjà ce nom' };
    fs.renameSync(String(file), target);
    const store = readStore();
    store.recents = store.recents.map(f => (f === file ? target : f));
    writeStore(store);
    return { ok: true, chemin: target, nom: path.basename(target) };
});

ipcMain.handle('afficher-dossier', (_event, file) => shell.showItemInFolder(String(file)));

// ---- PDF : la page imprime son document dans une fenêtre invisible ----
ipcMain.handle('pdf', async (_event, html, suggestion, page) => {
    const result = await dialog.showSaveDialog(win, {
        title: 'Exporter en PDF',
        buttonLabel: 'Exporter',
        defaultPath: path.join(documentsDir(), `${String(suggestion || 'Sans titre')}.pdf`),
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });
    if (result.canceled) return { ok: false, annule: true };
    const printer = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
    try {
        await printer.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(String(html)), { baseURLForDataURL: 'file://' + __dirname + '/' });
        const margin = (page?.margin || 2.5) / 2.54;
        const pdf = await printer.webContents.printToPDF({
            pageSize: 'A4',
            landscape: page?.orientation === 'paysage',
            margins: { top: margin, bottom: margin, left: margin, right: margin },
            printBackground: true
        });
        fs.writeFileSync(result.filePath, pdf);
        return { ok: true, chemin: result.filePath };
    } catch {
        return { ok: false, erreur: 'L’export PDF a échoué' };
    } finally {
        printer.destroy();
    }
});

// ---- Robbie : corriger, reformuler, résumer, traduire un passage ----
const TASKS = {
    corriger: 'Corrige l’orthographe, la grammaire et la ponctuation de ce texte, sans changer son sens ni son style. Réponds uniquement par le texte corrigé.',
    reformuler: 'Reformule ce texte pour qu’il soit plus clair et plus fluide, en gardant son sens et sa langue. Réponds uniquement par le texte reformulé.',
    resumer: 'Résume ce texte en quelques phrases, dans sa langue. Réponds uniquement par le résumé.',
    anglais: 'Traduis ce texte en anglais. Réponds uniquement par la traduction.',
    formel: 'Réécris ce texte dans un registre plus formel et professionnel, en gardant son sens. Réponds uniquement par le texte réécrit.',
    continuer: 'Écris la suite de ce texte (un ou deux paragraphes), dans le même style et la même langue. Réponds uniquement par la suite.'
};
ipcMain.handle('robbie', async (_event, task, text) => {
    if (!TASKS[task]) return { ok: false, erreur: 'Demande inconnue' };
    try {
        const response = await fetch(`${OLLAMA}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(120000),
            body: JSON.stringify({
                model: MODEL,
                stream: false,
                keep_alive: '30m',
                ...(/qwen3|deepseek-r1/i.test(MODEL) ? { think: false } : {}),
                options: { temperature: task === 'continuer' ? 0.7 : 0.2 },
                messages: [{ role: 'system', content: TASKS[task] }, { role: 'user', content: String(text).slice(0, 12000) }]
            })
        });
        if (!response.ok) throw new Error();
        const data = await response.json();
        const answer = String(data.message?.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
        return answer ? { ok: true, texte: answer } : { ok: false, erreur: 'Robbie n’a rien répondu' };
    } catch {
        return { ok: false, erreur: 'Robbie ne répond pas (son cerveau est-il allumé ?)' };
    }
});

// ---- Thème de Robbie OS ----
const SETTINGS = path.join(HOME, '.config', 'robbie-os', 'reglages.json');
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
    fs.watchFile(SETTINGS, { interval: 2000 }, () => win?.webContents.send('theme', readTheme()));
});
app.on('window-all-closed', () => app.quit());
ipcMain.on('peut-fermer', () => {
    if (!win) return;
    win.forceClose = true;
    win.close();
});
