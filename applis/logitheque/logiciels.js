// Ce qui est installé, et les installations : Flathub avec flatpak (pour tous les comptes
// quand on est administrateur, sinon pour soi seul), Debian avec l'outil « logiciels » de Robbie OS
// (lancé par sudo, avec le mot de passe de l'administrateur)
const fs = require('node:fs');
const { execFile, spawn } = require('node:child_process');
const applis = require('../../interface/services/applis');

const TOOL = '/usr/local/lib/robbie-os/logiciels';
const FLATHUB = 'https://dl.flathub.org/repo/flathub.flatpakrepo';
// (paquets de Robbie OS lui-même : jamais proposés à la désinstallation)
const PROTECTED = /^(robbie|thunar|foot|mousepad|labwc|greetd|gtklock|plymouth|network-manager|pipewire)/;

// (la sortie est gardée même en cas d'erreur : dpkg-query en signale une dès qu'un fichier
// n'appartient à aucun paquet, mais répond pour les autres)
const run = (command, args, timeout = 30000) => new Promise(resolve => {
    execFile(command, args, { timeout, maxBuffer: 8 * 1024 * 1024 }, (_error, stdout) => resolve(stdout || ''));
});

let adminCache = null;
async function isAdmin() {
    if (adminCache === null) adminCache = (await run('id', ['-Gn'])).split(/\s+/).includes('sudo');
    return adminCache;
}

// ---- Installées ----

async function flatpaks() {
    const output = await run('flatpak', ['list', '--app', '--columns=application,name,version,size,installation']);
    return output.split('\n').filter(Boolean).map(line => {
        const [id, name, version, size, installation] = line.split('\t');
        return { source: 'flathub', id, name: name || id, version: version || '', size: size || '', installation, desktop: id };
    });
}

// Applis Debian : celles qui ont un lanceur, et le paquet qui l'a installé
async function debianApps() {
    applis.refresh();
    const desktop = applis.list().filter(app => fs.existsSync(`/usr/share/applications/${app.id}.desktop`));
    if (!desktop.length) return [];
    const owners = await run('dpkg-query', ['-S', ...desktop.map(app => `/usr/share/applications/${app.id}.desktop`)]);
    const byFile = new Map(owners.split('\n').filter(Boolean).map(line => {
        const [packages, file] = line.split(': ');
        return [file, packages.split(',')[0].trim().replace(/:\w+$/, '')];
    }));
    return desktop.map(app => ({ app, package: byFile.get(`/usr/share/applications/${app.id}.desktop`) }))
        .filter(({ package: name }) => name)
        .map(({ app, package: name }) => ({
            source: 'debian',
            id: name,
            name: app.name,
            summary: app.description,
            iconData: app.icon,
            desktop: app.id,
            removable: !PROTECTED.test(name)
        }));
}

async function installed() {
    const [flat, debian] = await Promise.all([flatpaks(), debianApps()]);
    applis.refresh();
    const icons = new Map(applis.list().map(app => [app.id, app.icon]));
    return [
        ...flat.map(app => ({ ...app, iconData: icons.get(app.id) || null, removable: true })),
        // (un paquet peut installer plusieurs lanceurs : un seul par paquet)
        ...debian.filter((app, i, all) => all.findIndex(other => other.id === app.id) === i)
    ].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

// ---- Installer, désinstaller ----

// Une commande qui parle de sa progression : `parse` y lit un pourcentage, `onProgress` le reçoit
function withProgress(command, args, { input, parse, onProgress }) {
    return new Promise(resolve => {
        const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, LC_ALL: 'C.UTF-8' } });
        let output = '';
        let errors = '';
        const read = data => String(data).split(/[\r\n]+/).forEach(line => {
            const found = parse(line);
            if (found) onProgress(found);
        });
        child.stdout.on('data', data => {
            output += data;
            read(data);
        });
        child.stderr.on('data', data => {
            errors += data;
            read(data);
        });
        child.on('error', error => resolve({ ok: false, error: error.message }));
        child.on('close', code => resolve(code === 0 ? { ok: true } : { ok: false, error: errors || output }));
        child.stdin.end(input || '');
    });
}

// flatpak ne montre sa progression que dans un terminal : il en reçoit un faux (script).
// Il avance étape par étape (« Installing 2/4… 45% ») : on en fait un pourcentage d'ensemble
function flatpak(args, onProgress) {
    let step = [1, 1];
    const parse = line => {
        const clean = line.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '');
        const steps = clean.match(/(\d+)\/(\d+)…/);
        if (steps) step = [Number(steps[1]), Number(steps[2])];
        const percent = clean.match(/(\d{1,3})%/);
        if (!percent || !/Installing|Uninstalling|Updating/.test(clean)) return null;
        const overall = Math.round(((step[0] - 1) + Number(percent[1]) / 100) / step[1] * 100);
        return { percent: Math.min(99, overall), text: /Uninstalling/.test(clean) ? 'Désinstallation…' : `Installation${step[1] > 1 ? ` (${step[0]} sur ${step[1]})` : ''}…` };
    };
    // (les arguments sont sûrs : identifiants vérifiés, sans espace ni guillemet)
    return withProgress('script', ['-qefc', `flatpak ${args.join(' ')}`, '/dev/null'], { parse, onProgress });
}

const toolProgress = line => {
    const match = line.match(/^progression (\d+) (.*)$/);
    return match ? { percent: Number(match[1]), text: match[2] } : null;
};

// Messages de sudo et de l'outil, rendus lisibles
function toolError(errors) {
    if (/incorrect|Sorry, try again|essayez de nouveau|not in the sudoers|n'est pas dans le fichier sudoers/i.test(errors)) {
        return 'Mot de passe administrateur incorrect';
    }
    return errors.replace(/\[sudo\][^\n]*\n?/g, '').trim().split('\n').at(-1) || 'Opération impossible';
}

async function install(app, password, onProgress) {
    if (app.source === 'flathub') {
        const scope = (await isAdmin()) ? '--system' : '--user';
        if (scope === '--user') await run('flatpak', ['remote-add', '--user', '--if-not-exists', 'flathub', FLATHUB]);
        const result = await flatpak(['install', '-y', scope, 'flathub', app.id], onProgress);
        return result.ok ? result : { ok: false, error: /not found|No remote refs/i.test(result.error) ? 'Introuvable sur Flathub' : "L'installation n'a pas abouti" };
    }

    if (!(await isAdmin())) return { ok: false, error: 'Seul un administrateur peut installer un logiciel de Debian' };
    const result = await withProgress('sudo', ['-k', '-S', '-p', '', TOOL, 'installer', app.id], { input: `${password}\n`, parse: toolProgress, onProgress });
    return result.ok ? result : { ok: false, error: toolError(result.error) };
}

async function uninstall(app, password, onProgress) {
    if (app.source === 'flathub') {
        const where = (await flatpaks()).find(item => item.id === app.id)?.installation;
        const result = await flatpak(['uninstall', '-y', where === 'user' ? '--user' : '--system', app.id], onProgress);
        return result.ok ? result : { ok: false, error: "La désinstallation n'a pas abouti" };
    }

    if (!(await isAdmin())) return { ok: false, error: 'Seul un administrateur peut désinstaller un logiciel de Debian' };
    const result = await withProgress('sudo', ['-k', '-S', '-p', '', TOOL, 'desinstaller', app.id], { input: `${password}\n`, parse: toolProgress, onProgress });
    return result.ok ? result : { ok: false, error: toolError(result.error) };
}

// Ouvrir une appli installée (par son lanceur, comme le dock)
async function open(app) {
    applis.refresh();
    const desktop = app.desktop || (await installed()).find(item => item.source === app.source && item.id === app.id)?.desktop;
    if (desktop && applis.launch(desktop)) return true;
    if (app.source === 'flathub') {
        spawn('flatpak', ['run', app.id], { detached: true, stdio: 'ignore' }).unref();
        return true;
    }
    return false;
}

module.exports = { installed, install, uninstall, open, isAdmin };
