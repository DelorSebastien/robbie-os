// Ce que l'écran d'accueil a le droit de demander : la liste des comptes, se connecter, éteindre
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('accueil', {
    accounts: () => ipcRenderer.invoke('accueil-comptes'),
    login: (user, password) => ipcRenderer.invoke('accueil-connexion', user, password),
    power: action => ipcRenderer.invoke('accueil-alimentation', action)
});
