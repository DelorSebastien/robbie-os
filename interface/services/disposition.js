// Barre latérale à gauche ou à droite : labwc réserve sa place (les fenêtres agrandies ne passent
// pas dessous) dans la copie de sa configuration propre à la personne (voir installer-session.sh)
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');

const RC = path.join(os.homedir(), '.config', 'robbie-os', 'labwc', 'rc.xml');
const MARGINS = {
    droite: '<margin top="10" bottom="120" left="10" right="78" />',
    gauche: '<margin top="10" bottom="120" left="78" right="10" />'
};

function applySidebar(side) {
    let xml;
    try {
        xml = fs.readFileSync(RC, 'utf8');
    } catch {
        return;
    }
    const updated = xml.replace(/<margin [^>]*\/>/, MARGINS[side] || MARGINS.droite);
    if (updated === xml) return;
    fs.writeFileSync(RC, updated);
    // labwc (celui de ce compte) relit sa configuration quand il reçoit SIGHUP ; mais il ne
    // recalcule la place laissée aux fenêtres qu'au prochain changement d'écran : on réapplique
    // donc la position de chaque écran, sans rien y changer
    execFile('pkill', ['-HUP', '-x', '-U', String(os.userInfo().uid), 'labwc'], () => {
        setTimeout(refreshOutputs, 400);
    });
}

function refreshOutputs() {
    execFile('wlr-randr', [], { timeout: 5000 }, (error, stdout) => {
        if (error) return;
        let name = null;
        for (const line of stdout.split('\n')) {
            if (/^\S/.test(line)) name = line.split(' ')[0];
            const position = line.match(/^\s+Position: (-?\d+),(-?\d+)/);
            if (name && position) execFile('wlr-randr', ['--output', name, '--pos', `${position[1]},${position[2]}`], () => {});
        }
    });
}

module.exports = { applySidebar };
