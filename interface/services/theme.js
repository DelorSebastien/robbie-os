// Thème clair ou sombre pour les fenêtres des applis (GTK) et leurs barres de titre (labwc).
// L'interface choisit (Réglages › Apparence, ou automatiquement selon le soleil) et nous prévient.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');

const THEMES = {
    sombre: { gtk: 'Robbie', scheme: 'prefer-dark' },
    clair: { gtk: 'Robbie-Clair', scheme: 'prefer-light' }
};

// labwc lit le thème « Robbie » de rc.xml (commun à tous les comptes) ; un dossier du même nom
// dans ~/.local/share/themes passe avant celui du système : en clair, c'est un lien vers Robbie-Clair
const USER_THEME = path.join(os.homedir(), '.local', 'share', 'themes', 'Robbie');
const LIGHT_THEME = '/usr/share/themes/Robbie-Clair';

let current = null;

function apply(name) {
    const theme = THEMES[name] ? name : 'sombre';
    if (theme === current) return;
    current = theme;

    const { gtk, scheme } = THEMES[theme];
    execFile('gsettings', ['set', 'org.gnome.desktop.interface', 'gtk-theme', gtk], () => {});
    execFile('gsettings', ['set', 'org.gnome.desktop.interface', 'color-scheme', scheme], () => {});

    try {
        fs.rmSync(USER_THEME, { force: true, recursive: false });
        if (theme === 'clair') {
            fs.mkdirSync(path.dirname(USER_THEME), { recursive: true });
            fs.symlinkSync(LIGHT_THEME, USER_THEME);
        }
    } catch (error) {
        console.error('Thème de la barre de titre :', error.message);
    }
    applyTerminal(theme);
    // labwc (celui de ce compte) relit sa configuration et son thème quand il reçoit SIGHUP
    execFile('pkill', ['-HUP', '-x', '-U', String(os.userInfo().uid), 'labwc'], () => {});
}

// Terminal (foot) : en clair, un petit réglage du compte reprend la version claire ; en sombre,
// on l'enlève et foot prend la configuration du système. (Les terminaux déjà ouverts gardent
// leurs couleurs ; un réglage foot écrit par la personne elle-même n'est jamais touché.)
const FOOT = path.join(os.homedir(), '.config', 'foot', 'foot.ini');
const FOOT_MARK = '# Réglage de Robbie OS (thème clair)';

function applyTerminal(theme) {
    try {
        const ours = !fs.existsSync(FOOT) || fs.readFileSync(FOOT, 'utf8').startsWith(FOOT_MARK);
        if (!ours) return;
        if (theme === 'clair') {
            fs.mkdirSync(path.dirname(FOOT), { recursive: true });
            fs.writeFileSync(FOOT, `${FOOT_MARK}\ninclude=/etc/xdg/foot/robbie-clair.ini\n`);
        } else {
            fs.rmSync(FOOT, { force: true });
        }
    } catch (error) {
        console.error('Thème du terminal :', error.message);
    }
}

module.exports = { apply };
