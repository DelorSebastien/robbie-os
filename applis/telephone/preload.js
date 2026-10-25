// Ce que la fenêtre d'appel a le droit de demander à l'appli
const { contextBridge, ipcRenderer } = require('electron');

const on = channel => callback => ipcRenderer.on(channel, (_event, ...data) => callback(...data));

contextBridge.exposeInMainWorld('telephone', {
    // Le service : l'appel, sa signalisation, le micro (voir service/index.js)
    service: (method, ...args) => ipcRenderer.invoke('service', method, args),
    onService: on('service'),
    closeCall: () => ipcRenderer.send('fermer-appel'),
    openConversation: who => ipcRenderer.send('ouvrir-conversation', who),
    subtitles: on => ipcRenderer.invoke('sous-titres', on),
    subtitlesAudio: chunk => ipcRenderer.send('sous-titres-son', chunk),
    onSubtitle: on('sous-titre')
});
