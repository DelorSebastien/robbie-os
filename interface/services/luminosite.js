// Luminosité de l'écran (portables) : brightnessctl ; null s'il n'y a pas d'écran réglable
const { execFile } = require('node:child_process');

const run = args => new Promise(resolve => {
    execFile('brightnessctl', args, { timeout: 3000 }, (error, stdout) => resolve(error ? null : stdout));
});

// Sortie -m : « appareil,classe,actuel,pourcentage%,maximum »
async function get() {
    const output = await run(['-m', '--class=backlight']);
    const match = output?.split('\n')[0]?.match(/,(\d+)%,/);
    return match ? Number(match[1]) : null;
}

async function set(percent) {
    const value = Math.max(5, Math.min(100, Math.round(percent)));
    await run(['--class=backlight', 'set', `${value}%`]);
    return get();
}

module.exports = { get, set };
