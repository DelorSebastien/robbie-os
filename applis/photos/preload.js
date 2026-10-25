// Ce que la page de Photos a le droit de demander à l'appli
const { contextBridge, ipcRenderer } = require('electron');

const on = channel => callback => ipcRenderer.on(channel, (_event, data) => callback(data));

contextBridge.exposeInMainWorld('photos', {
    library: () => ipcRenderer.invoke('bibliotheque'),
    thumbnail: file => ipcRenderer.invoke('miniature', file),
    data: () => ipcRenderer.invoke('donnees'),
    favorite: (files, on) => ipcRenderer.invoke('favori', files, on),
    createAlbum: name => ipcRenderer.invoke('album-creer', name),
    renameAlbum: (id, name) => ipcRenderer.invoke('album-renommer', id, name),
    deleteAlbum: id => ipcRenderer.invoke('album-supprimer', id),
    addToAlbum: (id, files) => ipcRenderer.invoke('album-ajouter', id, files),
    removeFromAlbum: (id, files) => ipcRenderer.invoke('album-retirer', id, files),
    setEdits: (file, edits) => ipcRenderer.invoke('retouches', file, edits),
    saveCopy: (file, buffer) => ipcRenderer.invoke('copie-retouchee', file, buffer),
    trash: files => ipcRenderer.invoke('corbeille', files),
    showInFolder: file => ipcRenderer.invoke('afficher-dossier', file),
    importPhotos: folders => ipcRenderer.invoke('importer', folders),
    theme: () => ipcRenderer.invoke('theme'),
    onLibrary: on('bibliotheque'),
    onTheme: on('theme'),
    onOpen: on('ouvrir'),
    onFolder: on('dossier')
});
