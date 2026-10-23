// Son (PipeWire, via wpctl) et musique en cours (tout lecteur compatible MPRIS, via playerctl)
const { execFile } = require('node:child_process');

const run = (command, args) => new Promise(resolve => {
    execFile(command, args, { timeout: 3000 }, (error, stdout) => resolve(error ? null : stdout.trim()));
});

const SINK = '@DEFAULT_AUDIO_SINK@';

async function volume() {
    // Réponse de la forme « Volume: 0.40 » ou « Volume: 0.40 [MUTED] »
    const output = await run('wpctl', ['get-volume', SINK]);
    const match = output?.match(/Volume:\s*([\d.]+)/);
    if (!match) return null;

    return { level: Math.round(Number(match[1]) * 100), muted: output.includes('MUTED') };
}

async function setVolume(level) {
    const value = Math.max(0, Math.min(100, Math.round(level)));
    await run('wpctl', ['set-volume', SINK, `${value}%`]);
    if (value > 0) await run('wpctl', ['set-mute', SINK, '0']);
    return volume();
}

async function toggleMute() {
    await run('wpctl', ['set-mute', SINK, 'toggle']);
    return volume();
}

// Morceau en cours : null quand aucun lecteur ne joue
async function music() {
    const SEP = '␟';
    const output = await run('playerctl', ['metadata', '--format',
        ['{{status}}', '{{title}}', '{{artist}}', '{{album}}', '{{position}}', '{{mpris:length}}', '{{mpris:artUrl}}', '{{playerName}}'].join(SEP)]);
    if (!output) return null;

    const [status, title, artist, album, position, length, art, player] = output.split(SEP);
    if (!title) return null;

    return {
        playing: status === 'Playing',
        title,
        artist,
        album,
        // playerctl donne les durées en microsecondes
        position: Number(position) / 1e6 || 0,
        length: Number(length) / 1e6 || 0,
        art: art?.startsWith('https://') ? art : '',
        player
    };
}

const MUSIC_COMMANDS = { toggle: 'play-pause', next: 'next', previous: 'previous' };

async function musicCommand(command) {
    if (MUSIC_COMMANDS[command]) await run('playerctl', [MUSIC_COMMANDS[command]]);
    return music();
}

module.exports = { volume, setVolume, toggleMute, music, musicCommand };
