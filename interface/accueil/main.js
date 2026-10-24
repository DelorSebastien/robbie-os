// Écran d'accueil de Robbie OS : choix du compte et mot de passe, avant toute session.
// Lancé par greetd (compte système _greetd), seul à l'écran dans cage.
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const comptes = require('../services/comptes');
const greetd = require('../services/greetd');

app.setName('robbie-os-accueil');
// (le compte _greetd n'a pas de dossier personnel où écrire)
app.setPath('userData', path.join(os.tmpdir(), 'robbie-os-accueil'));
if (process.env.ROBBIE_SANS_GPU) app.disableHardwareAcceleration();

let win = null;

ipcMain.handle('accueil-comptes', async () => {
    const list = await comptes.list();
    return list.map(account => ({
        user: account.user,
        name: account.name,
        role: account.role,
        // Enfant hors de ses horaires : il ne peut pas se connecter maintenant
        blocked: account.role === 'enfant' && !comptes.withinHours(account.rules),
        hours: account.rules?.debut && account.rules?.fin ? `${account.rules.debut} – ${account.rules.fin}` : null
    }));
});

ipcMain.handle('accueil-connexion', async (_event, user, password) => {
    const account = (await comptes.list()).find(a => a.user === user);
    if (!account) return { ok: false, error: 'Compte introuvable' };
    if (account.role === 'enfant' && !comptes.withinHours(account.rules)) {
        return { ok: false, error: `Ce compte n'est utilisable que de ${account.rules.debut} à ${account.rules.fin}` };
    }

    const result = await greetd.login(user, String(password || ''));
    // Session lancée : greetd remplace l'écran d'accueil par la session
    if (result.ok) setTimeout(() => app.quit(), 400);
    return result;
});

ipcMain.handle('accueil-alimentation', (_event, action) => {
    if (!['poweroff', 'reboot'].includes(action)) return false;
    execFile('systemctl', [action], error => {
        if (error) console.error('Alimentation impossible :', error.message);
    });
    return true;
});

app.whenReady().then(() => {
    win = new BrowserWindow({
        fullscreen: true,
        frame: false,
        // (montrée seulement une fois dessinée, sur la couleur de l'écran de démarrage)
        show: false,
        backgroundColor: '#03060e',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            sandbox: true
        }
    });
    win.once('ready-to-show', () => win.show());
    win.loadFile(path.join(__dirname, 'index.html'));
});

app.on('window-all-closed', () => app.quit());
