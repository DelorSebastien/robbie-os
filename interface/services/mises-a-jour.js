// Mises à jour du système et des applis de Flathub : ce qui attend, la vérification et l'installation
// passent par l'outil « logiciels » de Robbie OS (sudo sans mot de passe pour les administrateurs).
// Son état, /var/lib/robbie-os/mises-a-jour.json, est partagé par l'interface et la Logithèque :
// chacune voit la progression d'une installation lancée par l'autre.
const fs = require('node:fs');
const { spawn } = require('node:child_process');

const TOOL = '/usr/local/lib/robbie-os/logiciels';
const STATE = '/var/lib/robbie-os/mises-a-jour.json';

function read() {
    try {
        const state = JSON.parse(fs.readFileSync(STATE, 'utf8'));
        const system = state.systeme || [];
        const apps = state.applis || [];
        return {
            checked: state.verifie ? state.verifie * 1000 : null,
            system,
            apps,
            count: system.length + apps.length,
            security: system.filter(item => item.securite).length,
            running: state.en_cours || null,
            last: state.dernier ? { ...state.dernier, date: state.dernier.date * 1000 } : null,
            reboot: Boolean(state.redemarrage)
        };
    } catch {
        return { checked: null, system: [], apps: [], count: 0, security: 0, running: null, last: null, reboot: false };
    }
}

// L'état change (vérification, progression, fin) : `callback` reçoit le nouvel état
function watch(callback) {
    let timer = null;
    fs.watchFile(STATE, { interval: 1000 }, () => {
        clearTimeout(timer);
        timer = setTimeout(() => callback(read()), 150);
    });
}

// Lancée à part : l'installation continue même si la fenêtre qui l'a demandée se ferme
function runTool(command) {
    return new Promise(resolve => {
        const child = spawn('sudo', ['-n', TOOL, command], { detached: true, stdio: ['ignore', 'ignore', 'pipe'] });
        let errors = '';
        child.stderr.on('data', data => {
            errors += data;
        });
        child.on('error', error => resolve({ ok: false, error: error.message }));
        child.on('close', code => resolve(code === 0
            ? { ok: true }
            : { ok: false, error: /password|mot de passe/i.test(errors) ? 'Seul un administrateur peut mettre à jour' : errors.trim().split('\n').at(-1) || 'Mise à jour impossible' }));
        child.unref();
    });
}

const install = () => runTool('mettre-a-jour');
const check = () => runTool('verifier');

function restart() {
    spawn('systemctl', ['reboot'], { detached: true, stdio: 'ignore' }).unref();
}

module.exports = { read, watch, install, check, restart };
