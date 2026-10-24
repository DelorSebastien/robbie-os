// Ce que la page de la Logithèque a le droit de demander à l'appli
const { contextBridge, ipcRenderer } = require('electron');

const on = channel => callback => ipcRenderer.on(channel, (_event, data) => callback(data));

contextBridge.exposeInMainWorld('logitheque', {
    showcase: () => ipcRenderer.invoke('vitrine'),
    category: (id, page) => ipcRenderer.invoke('categorie', id, page),
    search: query => ipcRenderer.invoke('chercher', query),
    details: (source, id) => ipcRenderer.invoke('fiche', source, id),
    installed: () => ipcRenderer.invoke('installees'),
    isAdmin: () => ipcRenderer.invoke('administrateur'),
    install: (app, password) => ipcRenderer.invoke('installer', app, password),
    uninstall: (app, password) => ipcRenderer.invoke('desinstaller', app, password),
    open: app => ipcRenderer.invoke('ouvrir-appli', app),
    website: url => ipcRenderer.invoke('site', url),
    updates: () => ipcRenderer.invoke('mises-a-jour'),
    installUpdates: () => ipcRenderer.invoke('mettre-a-jour'),
    checkUpdates: () => ipcRenderer.invoke('verifier'),
    restart: () => ipcRenderer.invoke('redemarrer'),
    theme: () => ipcRenderer.invoke('theme'),
    onProgress: on('progression'),
    onUpdates: on('mises-a-jour'),
    onTheme: on('theme'),
    onOpen: on('ouvrir')
});
