// Ce que les pages du Téléphone ont le droit de demander à l'appli
const { contextBridge, ipcRenderer } = require('electron');

const on = channel => callback => ipcRenderer.on(channel, (_event, ...data) => callback(...data));

contextBridge.exposeInMainWorld('telephone', {
    // Le service : conversations, messages, appels, téléphone relié, Robbie OS (voir service/index.js)
    service: (method, ...args) => ipcRenderer.invoke('service', method, args),
    onService: on('service'),
    contacts: () => ipcRenderer.invoke('contacts'),
    addContact: contact => ipcRenderer.invoke('ajouter-contact', contact),
    chooseFile: () => ipcRenderer.invoke('choisir-fichier'),
    openPiece: file => ipcRenderer.invoke('ouvrir-piece', file),
    qr: text => ipcRenderer.invoke('qr', text),
    theme: () => ipcRenderer.invoke('theme'),
    onTheme: on('theme'),
    onRequest: on('demande'),
    // Fenêtre d'appel
    closeCall: () => ipcRenderer.send('fermer-appel'),
    openConversation: who => ipcRenderer.send('ouvrir-conversation', who),
    subtitles: on => ipcRenderer.invoke('sous-titres', on),
    subtitlesAudio: chunk => ipcRenderer.send('sous-titres-son', chunk),
    onSubtitle: on('sous-titre')
});
