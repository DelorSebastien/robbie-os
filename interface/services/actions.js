// Actions de Robbie sur le système, demandées par son cerveau (champ "action" de sa réponse).
// Garde-fous : rien n'est jamais supprimé ni écrasé, le rangement s'annule,
// et éteindre ou redémarrer demande toujours une confirmation.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn, execFileSync } = require('node:child_process');
const applis = require('./applis');
const son = require('./son');
const { power } = require('./alimentation');

const normalize = text => String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function run(command, args) {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' });
    child.on('error', error => console.error(`${command} :`, error.message));
    child.unref();
}

// Dossiers personnels (noms français de Linux : Téléchargements, Documents…)
const FOLDERS = {
    telechargements: 'DOWNLOAD',
    documents: 'DOCUMENTS',
    images: 'PICTURES',
    photos: 'PICTURES',
    musique: 'MUSIC',
    videos: 'VIDEOS',
    bureau: 'DESKTOP'
};

function userFolder(name) {
    const key = Object.keys(FOLDERS).find(k => normalize(name).includes(k));
    if (!key) return os.homedir();

    try {
        const folder = execFileSync('xdg-user-dir', [FOLDERS[key]], { encoding: 'utf8' }).trim();
        if (folder && folder !== os.homedir()) {
            fs.mkdirSync(folder, { recursive: true });
            return folder;
        }
    } catch {
        // xdg-user-dir absent : noms par défaut
    }

    const fallback = { DOWNLOAD: 'Téléchargements', DOCUMENTS: 'Documents', PICTURES: 'Images', MUSIC: 'Musique', VIDEOS: 'Vidéos', DESKTOP: 'Bureau' };
    const folder = path.join(os.homedir(), fallback[FOLDERS[key]]);
    fs.mkdirSync(folder, { recursive: true });
    return folder;
}

// Appli la plus proche du nom demandé (« firefox », « le navigateur », « fichiers »…)
const SYNONYMS = {
    navigateur: 'firefox', internet: 'firefox', web: 'firefox',
    fichiers: 'thunar', explorateur: 'thunar', dossiers: 'thunar',
    terminal: 'foot', console: 'foot',
    editeur: 'mousepad', 'bloc-notes': 'mousepad', texte: 'mousepad',
    images: 'ristretto', photos: 'ristretto'
};

function findApp(name) {
    const wanted = normalize(name);
    const target = SYNONYMS[wanted] || wanted;
    const apps = applis.list();

    return apps.find(app => normalize(app.name) === target || normalize(app.id) === target)
        || apps.find(app => normalize(app.id).includes(target) || normalize(app.name).includes(target))
        || apps.find(app => normalize(app.keywords).includes(target) || normalize(app.description).includes(target));
}

// ---- Rangement des téléchargements par type, avec journal pour tout annuler ----
const TYPES = {
    Images: /\.(png|jpe?g|gif|webp|bmp|svg|heic|avif)$/i,
    Documents: /\.(pdf|docx?|odt|txt|md|rtf|xlsx?|ods|csv|pptx?|odp|epub)$/i,
    Vidéos: /\.(mp4|mkv|avi|mov|webm|m4v)$/i,
    Musique: /\.(mp3|flac|ogg|wav|m4a|opus|aac)$/i,
    Archives: /\.(zip|rar|7z|tar|gz|xz|bz2|tgz)$/i,
    Programmes: /\.(deb|appimage|sh|run|exe|msi)$/i
};

const JOURNAL = path.join(os.homedir(), '.config', 'robbie-os', 'dernier-rangement.json');

function organizeDownloads() {
    const folder = userFolder('téléchargements');
    const moves = [];

    for (const name of fs.readdirSync(folder)) {
        const source = path.join(folder, name);
        if (!fs.statSync(source).isFile() || name.startsWith('.')) continue;

        const type = Object.keys(TYPES).find(key => TYPES[key].test(name)) || 'Autres';
        const targetFolder = path.join(folder, type);
        const target = path.join(targetFolder, name);
        if (fs.existsSync(target)) continue;

        fs.mkdirSync(targetFolder, { recursive: true });
        fs.renameSync(source, target);
        moves.push({ from: source, to: target });
    }

    fs.mkdirSync(path.dirname(JOURNAL), { recursive: true });
    fs.writeFileSync(JOURNAL, JSON.stringify(moves, null, 2));
    return moves.length;
}

function undoOrganize() {
    let moves = [];
    try {
        moves = JSON.parse(fs.readFileSync(JOURNAL, 'utf8'));
    } catch {
        return 0;
    }

    let restored = 0;
    for (const move of moves.reverse()) {
        if (fs.existsSync(move.to) && !fs.existsSync(move.from)) {
            fs.renameSync(move.to, move.from);
            restored++;
        }
    }

    // Dossiers de rangement devenus vides
    const folder = userFolder('téléchargements');
    for (const type of [...Object.keys(TYPES), 'Autres']) {
        const sub = path.join(folder, type);
        try {
            if (fs.readdirSync(sub).length === 0) fs.rmdirSync(sub);
        } catch {
            // dossier absent
        }
    }

    fs.rmSync(JOURNAL, { force: true });
    return restored;
}

// Exécution d'une action. Résultat : { done, say? } ; say remplace la phrase de Robbie
// quand l'action n'a pas pu se faire. Les actions sensibles renvoient { confirm }.
async function execute(action, account = null) {
    if (!action || typeof action !== 'object') return { done: false };

    // Compte enfant : seulement ses applis autorisées, et pas d'extinction ni de redémarrage
    const child = account?.role === 'enfant';
    if (child && action.type === 'power') return { done: false, say: 'Demande à un adulte pour éteindre l\'ordinateur.' };

    try {
        switch (action.type) {
            case 'open_app': {
                const app = findApp(action.name);
                if (!app) return { done: false, say: `Je ne trouve pas d'appli qui s'appelle « ${action.name} ».` };
                if (child && !(account.rules?.apps || []).includes(app.id)) {
                    return { done: false, say: `${app.name} n'est pas autorisée sur ton compte. Demande à un adulte !` };
                }
                applis.launch(app.id);
                return { done: true };
            }

            case 'volume': {
                if (typeof action.mute === 'boolean') {
                    const current = await son.volume();
                    if (current && current.muted !== action.mute) await son.toggleMute();
                } else {
                    const current = await son.volume();
                    const level = typeof action.level === 'number' ? action.level
                        : (current?.level ?? 50) + (action.change === 'down' ? -15 : 15);
                    await son.setVolume(level);
                }
                return { done: true };
            }

            case 'music':
                await son.musicCommand(action.command);
                return { done: true };

            case 'open_folder':
                applis.openLocation(userFolder(action.folder));
                return { done: true };

            case 'search': {
                const query = encodeURIComponent(action.query || '');
                run('xdg-open', [action.engine === 'youtube'
                    ? `https://www.youtube.com/results?search_query=${query}`
                    : `https://duckduckgo.com/?q=${query}`]);
                return { done: true };
            }

            case 'website': {
                const site = String(action.site || '').trim();
                if (!site) return { done: false };
                run('xdg-open', [/^https?:\/\//.test(site) ? site : `https://${site}`]);
                return { done: true };
            }

            case 'screenshot': {
                const folder = userFolder('images');
                const file = path.join(folder, `Capture ${new Date().toISOString().slice(0, 19).replace('T', ' ').replace(/:/g, '-')}.png`);
                // Petit délai : le temps que le panneau de Robbie se ferme
                setTimeout(() => run('grim', [file]), 600);
                return { done: true, file };
            }

            case 'organize_downloads': {
                const count = organizeDownloads();
                return count
                    ? { done: true, say: `C'est rangé : ${count} fichier${count > 1 ? 's' : ''} classé${count > 1 ? 's' : ''} par type. Je peux tout remettre comme avant si tu veux.` }
                    : { done: true, say: 'Tes téléchargements sont déjà bien rangés, il n\'y a rien à classer.' };
            }

            case 'undo_organize': {
                const count = undoOrganize();
                return { done: true, say: count ? `C'est fait, j'ai remis ${count} fichier${count > 1 ? 's' : ''} à leur place.` : 'Il n\'y a aucun rangement à annuler.' };
            }

            case 'logout':
                setTimeout(() => run('labwc', ['--exit']), 1800);
                return { done: true };

            case 'lock':
                // (petit délai : le temps que Robbie dise sa phrase)
                setTimeout(() => require('./verrouillage').lock(), 1500);
                return { done: true };

            case 'power':
                // Jamais sans confirmation : c'est le panneau qui demandera
                if (!['suspend', 'reboot', 'poweroff'].includes(action.command)) return { done: false };
                return { done: false, confirm: { type: 'power', command: action.command } };

            default:
                return { done: false };
        }
    } catch (error) {
        console.error('Action impossible :', action, error.message);
        return { done: false, say: 'Oups, je n\'ai pas réussi à faire ça.' };
    }
}

// Action confirmée par l'utilisateur dans le panneau
function confirm(action) {
    if (action?.type === 'power') return power(action.command);
    return false;
}

module.exports = { execute, confirm };
