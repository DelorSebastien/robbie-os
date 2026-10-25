// Ce que la page d'Écriture a le droit de demander à l'appli
const { contextBridge, ipcRenderer } = require('electron');

const on = channel => callback => ipcRenderer.on(channel, (_event, data) => callback(data));

contextBridge.exposeInMainWorld('ecriture', {
    recents: () => ipcRenderer.invoke('recents'),
    forget: file => ipcRenderer.invoke('oublier', file),
    read: file => ipcRenderer.invoke('lire', file),
    openDialog: () => ipcRenderer.invoke('ouvrir-dialogue'),
    freeName: title => ipcRenderer.invoke('nom-libre', title),
    save: (file, doc) => ipcRenderer.invoke('enregistrer', file, doc),
    saveAsDialog: suggestion => ipcRenderer.invoke('enregistrer-sous', suggestion),
    rename: (file, name) => ipcRenderer.invoke('renommer', file, name),
    showInFolder: file => ipcRenderer.invoke('afficher-dossier', file),
    pdf: (html, suggestion, page) => ipcRenderer.invoke('pdf', html, suggestion, page),
    robbie: (task, text) => ipcRenderer.invoke('robbie', task, text),
    theme: () => ipcRenderer.invoke('theme'),
    canClose: () => ipcRenderer.send('peut-fermer'),
    onOpen: on('ouvrir'),
    onClosing: on('fermeture'),
    onTheme: on('theme')
});
