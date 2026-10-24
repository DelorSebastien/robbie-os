// Place réservée par labwc autour des fenêtres agrandies : la barre latérale (à gauche ou à droite)
// et le dock (sauf si les fenêtres agrandies prennent tout l'écran), dans la copie de sa
// configuration propre à la personne (voir installer-session.sh)
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');

const RC = path.join(os.homedir(), '.config', 'robbie-os', 'labwc', 'rc.xml');
const margins = (side, fullScreen) => {
    const bottom = fullScreen ? 10 : 120;
    return side === 'gauche'
        ? `<margin top="10" bottom="${bottom}" left="78" right="10" />`
        : `<margin top="10" bottom="${bottom}" left="10" right="78" />`;
};

function applyLayout(side, fullScreen) {
    let xml;
    try {
        xml = fs.readFileSync(RC, 'utf8');
    } catch {
        return;
    }
    const updated = xml.replace(/<margin [^>]*\/>/, margins(side, fullScreen));
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

module.exports = { applyLayout };
