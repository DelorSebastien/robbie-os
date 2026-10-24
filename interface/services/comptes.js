// Comptes de Robbie OS : liste, rang de chacun (administrateur, standard, enfant, invité),
// et modifications. Les modifications passent par l'outil /usr/local/lib/robbie-os/comptes,
// lancé avec sudo et le mot de passe de l'administrateur (demandé à chaque fois).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile, spawn } = require('node:child_process');

const TOOL = '/usr/local/lib/robbie-os/comptes';
const CHILDREN = '/etc/robbie-os/enfants';

const run = (command, args) => new Promise(resolve => {
    execFile(command, args, { timeout: 5000 }, (error, stdout) => resolve(error ? '' : stdout));
});

function roleOf(user, groups) {
    if (user === 'invite') return 'invite';
    if (groups.includes('sudo')) return 'admin';
    if (groups.includes('robbie-enfant')) return 'enfant';
    return 'standard';
}

// Règles d'un enfant : applis autorisées et horaires (null s'il n'en a pas)
function childRules(user) {
    try {
        return JSON.parse(fs.readFileSync(path.join(CHILDREN, `${user}.json`), 'utf8'));
    } catch {
        return null;
    }
}

// Comptes des personnes (UID 1000 à 59999)
async function list() {
    const passwd = await run('getent', ['passwd']);
    const groupFile = await run('getent', ['group']);
    const members = name => (groupFile.split('\n').find(line => line.startsWith(`${name}:`)) || '').split(':')[3]?.split(',').filter(Boolean) || [];
    const admins = members('sudo');
    const children = members('robbie-enfant');

    return passwd.split('\n').filter(Boolean).map(line => line.split(':'))
        .filter(([, , uid, , , , shell]) => Number(uid) >= 1000 && Number(uid) < 60000 && !/nologin|false/.test(shell))
        .map(([user, , uid, , gecos, home]) => {
            const groups = [admins.includes(user) && 'sudo', children.includes(user) && 'robbie-enfant'].filter(Boolean);
            const role = roleOf(user, groups);
            return {
                user,
                uid: Number(uid),
                name: (gecos || '').split(',')[0] || user,
                home,
                role,
                rules: role === 'enfant' ? childRules(user) : null
            };
        })
        .sort((a, b) => (a.role === 'invite') - (b.role === 'invite') || a.uid - b.uid);
}

// Le compte de la personne connectée
async function me() {
    const user = os.userInfo().username;
    const account = (await list()).find(a => a.user === user);
    return account || { user, name: user, role: 'standard', rules: null };
}

// Le mot de passe administrateur est-il bon ? (vérifié seul : en cas d'erreur, sudo réessaierait
// sinon avec les lignes suivantes, comme le nouveau mot de passe d'un compte)
function checkAdmin(password) {
    return new Promise(resolve => {
        const child = spawn('sudo', ['-k', '-S', '-p', '', 'true'], { stdio: ['pipe', 'ignore', 'ignore'] });
        child.on('error', () => resolve(false));
        child.on('close', code => resolve(code === 0));
        child.stdin.end(`${password}\n`);
    });
}

// Une modification : `password` = mot de passe de l'administrateur, `input` = ce que l'outil lit
// sur son entrée (nouveau mot de passe, règles d'un enfant)
async function change(args, password, input = '') {
    if (!(await checkAdmin(password))) return { ok: false, error: 'Mot de passe administrateur incorrect' };

    return new Promise(resolve => {
        // (sudo -k : on vérifie le mot de passe à chaque fois, sans se souvenir d'avant)
        const child = spawn('sudo', ['-k', '-S', '-p', '', TOOL, ...args.map(String)], { stdio: ['pipe', 'pipe', 'pipe'] });
        let errors = '';
        let output = '';
        child.stdout.on('data', data => {
            output += data;
        });
        child.stderr.on('data', data => {
            errors += data;
        });
        child.on('error', error => resolve({ ok: false, error: error.message }));
        child.on('close', code => {
            const message = errors.replace(/\[sudo\][^\n]*\n?/g, '').trim();
            // (« plus-tard » : un compte ouvert change d'identifiant au prochain démarrage)
            if (code === 0) return resolve({ ok: true, later: output.includes('plus-tard') });
            if (/incorrect|Sorry, try again|essayez de nouveau|n'est pas dans le fichier sudoers|not in the sudoers/i.test(errors)) {
                return resolve({ ok: false, error: 'Mot de passe administrateur incorrect' });
            }
            resolve({ ok: false, error: message || 'Modification impossible' });
        });
        child.stdin.write(`${password}\n${input}`);
        child.stdin.end();
    });
}

// Modifier son propre compte, sans être administrateur : `current` = son mot de passe actuel,
// vérifié par l'outil ; `input` = la suite de l'entrée (le nouveau mot de passe)
const MINE = ['motdepasse', 'nom', 'identifiant'];
function changeMine(args, current, input = '') {
    if (!MINE.includes(args[0])) return Promise.resolve({ ok: false, error: 'Modification inconnue' });
    return new Promise(resolve => {
        const child = spawn('sudo', ['-n', TOOL, 'moi', ...args.map(String)], { stdio: ['pipe', 'pipe', 'pipe'] });
        let output = '';
        let errors = '';
        child.stdout.on('data', data => {
            output += data;
        });
        child.stderr.on('data', data => {
            errors += data;
        });
        child.on('error', error => resolve({ ok: false, error: error.message }));
        child.on('close', code => {
            if (code === 0) return resolve({ ok: true, later: output.includes('plus-tard') });
            resolve({ ok: false, error: errors.replace(/\[sudo\][^\n]*\n?/g, '').trim() || 'Modification impossible' });
        });
        child.stdin.end(`${current}\n${input}`);
    });
}

// Un enfant peut-il utiliser l'ordinateur maintenant ? (horaires « debut » et « fin », HH:MM)
function withinHours(rules, date = new Date()) {
    if (!rules?.debut || !rules?.fin) return true;
    const minutes = date.getHours() * 60 + date.getMinutes();
    const toMinutes = text => {
        const [h, m] = String(text).split(':').map(Number);
        return h * 60 + (m || 0);
    };
    const start = toMinutes(rules.debut);
    const end = toMinutes(rules.fin);
    return start <= end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

module.exports = { list, me, change, changeMine, childRules, withinHours };
