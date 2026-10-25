// Ce que la page de l'explorateur (et Photos, affichée dans son cadre) a le droit de demander
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const on = channel => callback => ipcRenderer.on(channel, (_event, data) => callback(data));

// Le cadre de Photos se fait connaître : la photothèque et le thème lui seront envoyés
if (location.pathname.includes('/photos/')) ipcRenderer.send('photos-cadre');

contextBridge.exposeInMainWorld('fichiers', {
    userDirs: () => ipcRenderer.invoke('f-dossiers-perso'),
    list: (dir, hidden) => ipcRenderer.invoke('f-lister', dir, hidden),
    exists: file => ipcRenderer.invoke('f-existe', file),
    thumbnail: file => ipcRenderer.invoke('f-miniature', file),
    icon: names => ipcRenderer.invoke('f-icone', names),
    open: file => ipcRenderer.invoke('f-ouvrir', file),
    terminal: dir => ipcRenderer.invoke('f-terminal', dir),
    setWallpaper: file => ipcRenderer.invoke('f-fond', file),
    copyText: text => ipcRenderer.invoke('f-copier-chemin', text),
    transfer: (sources, destination, move) => ipcRenderer.invoke('f-transferer', sources, destination, move),
    trash: files => ipcRenderer.invoke('f-corbeille', files),
    rename: (file, name) => ipcRenderer.invoke('f-renommer', file, name),
    newFolder: dir => ipcRenderer.invoke('f-nouveau-dossier', dir),
    properties: file => ipcRenderer.invoke('f-proprietes', file),
    trashList: () => ipcRenderer.invoke('f-corbeille-lister'),
    restore: files => ipcRenderer.invoke('f-restaurer', files),
    deleteForever: files => ipcRenderer.invoke('f-supprimer', files),
    emptyTrash: () => ipcRenderer.invoke('f-vider-corbeille'),
    confirm: (title, detail, button) => ipcRenderer.invoke('f-confirmer', title, detail, button),
    devices: () => ipcRenderer.invoke('f-appareils'),
    mount: device => ipcRenderer.invoke('f-monter', device),
    eject: device => ipcRenderer.invoke('f-ejecter', device),
    diskSpace: dir => ipcRenderer.invoke('f-espace', dir),
    bookmarks: () => ipcRenderer.invoke('f-signets'),
    addBookmark: dir => ipcRenderer.invoke('f-signet-ajouter', dir),
    removeBookmark: dir => ipcRenderer.invoke('f-signet-retirer', dir),
    startDrag: files => ipcRenderer.send('f-glisser', files),
    watch: dir => ipcRenderer.send('f-surveiller', dir),
    // (chemin d'un fichier glissé depuis une autre appli)
    pathOf: file => webUtils.getPathForFile(file),
    theme: () => ipcRenderer.invoke('theme'),
    onGo: on('aller'),
    onProgress: on('f-progression'),
    onChange: on('f-change'),
    onDevices: on('f-appareils'),
    onTheme: on('theme')
});

// Le même pont que l'appli Photos (pour son cadre)
contextBridge.exposeInMainWorld('photos', {
    library: () => ipcRenderer.invoke('bibliotheque'),
    thumbnail: file => ipcRenderer.invoke('miniature', file),
    data: () => ipcRenderer.invoke('donnees'),
    favorite: (files, value) => ipcRenderer.invoke('favori', files, value),
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
