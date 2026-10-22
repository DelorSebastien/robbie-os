// Robbie OS : l'interface, lancée en plein écran au démarrage de la machine
const { app, BrowserWindow } = require('electron');
const path = require('node:path');

app.whenReady().then(() => {
    const win = new BrowserWindow({
        fullscreen: true,
        frame: false,
        backgroundColor: '#030609',
        icon: path.join(__dirname, '..', 'robbie', 'assets', 'robbie.png'),
        webPreferences: { contextIsolation: true, sandbox: true }
    });

    win.loadFile(path.join(__dirname, 'index.html'));
});

app.on('window-all-closed', () => app.quit());
