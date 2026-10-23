// Ce que la page a le droit de demander au système (rien d'autre)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('os', {
    system: () => ipcRenderer.invoke('system'),
    apps: () => ipcRenderer.invoke('apps'),
    launch: id => ipcRenderer.invoke('launch', id),
    icon: name => ipcRenderer.invoke('icon', name),
    openLocation: location => ipcRenderer.invoke('open-location', location),
    weather: () => ipcRenderer.invoke('weather'),
    volume: () => ipcRenderer.invoke('volume'),
    setVolume: level => ipcRenderer.invoke('set-volume', level),
    toggleMute: () => ipcRenderer.invoke('toggle-mute'),
    music: () => ipcRenderer.invoke('music'),
    musicCommand: command => ipcRenderer.invoke('music-command', command),
    notes: () => ipcRenderer.invoke('notes'),
    setNotes: list => ipcRenderer.invoke('set-notes', list),
    settings: () => ipcRenderer.invoke('settings'),
    setSettings: changes => ipcRenderer.invoke('set-settings', changes),
    power: action => ipcRenderer.invoke('power', action),
    onShortcut: callback => ipcRenderer.on('shortcut', (_event, name) => callback(name))
});

// Robbie : lui parler, et recevoir ses réponses, sa voix et son état
const ROBBIE_EVENTS = ['robbie-question', 'robbie-reponse', 'robbie-voix', 'robbie-etat', 'robbie-ecoute', 'robbie-ouvrir', 'robbie-micro'];

contextBridge.exposeInMainWorld('robbieApi', {
    ask: text => ipcRenderer.invoke('robbie-demander', text),
    confirm: action => ipcRenderer.invoke('robbie-confirmer', action),
    setSpeaking: speaking => ipcRenderer.send('robbie-parle', speaking),
    setPanelOpen: open => ipcRenderer.send('robbie-panneau', open),
    on: (channel, callback) => {
        if (ROBBIE_EVENTS.includes(channel)) ipcRenderer.on(channel, (_event, data) => callback(data));
    }
});
