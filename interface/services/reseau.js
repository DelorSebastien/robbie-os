// Réseau : état de la connexion (filaire ou Wi-Fi) et réseaux Wi-Fi (NetworkManager, via nmcli)
const { execFile } = require('node:child_process');

const run = (command, args, timeout = 8000) => new Promise(resolve => {
    execFile(command, args, { timeout }, (error, stdout) => resolve(error ? null : stdout));
});

// nmcli -t sépare les champs par « : » (les « : » dans les valeurs sont échappés par « \: »)
const fields = line => line.split(/(?<!\\):/).map(value => value.replace(/\\:/g, ':'));

async function status() {
    const devices = (await run('nmcli', ['-t', '-f', 'DEVICE,TYPE,STATE,CONNECTION', 'device'])) || '';
    const list = devices.split('\n').filter(Boolean).map(fields)
        .map(([device, type, state, connection]) => ({ device, type, state, connection }))
        .filter(d => d.type === 'ethernet' || d.type === 'wifi');

    // Adresse IP et route par défaut : connecté à internet ou pas
    const route = (await run('ip', ['-4', 'route', 'show', 'default'])) || '';
    const online = /default via/.test(route);
    const wifi = list.find(d => d.type === 'wifi');

    return {
        online,
        ethernet: list.some(d => d.type === 'ethernet') && /dev\s+(en|eth)/.test(route),
        wifi: wifi ? { device: wifi.device, connected: wifi.state === 'connected' || wifi.state === 'connecté', network: wifi.connection } : null
    };
}

async function wifiNetworks() {
    const output = await run('nmcli', ['-t', '-f', 'IN-USE,SSID,SIGNAL,SECURITY', 'device', 'wifi', 'list', '--rescan', 'auto'], 15000);
    if (!output) return [];

    const seen = new Set();
    return output.split('\n').filter(Boolean).map(fields)
        .map(([inUse, ssid, signal, security]) => ({ ssid, signal: Number(signal) || 0, secured: Boolean(security && security !== '--'), active: inUse === '*' }))
        .filter(n => n.ssid && !seen.has(n.ssid) && seen.add(n.ssid))
        .sort((a, b) => b.active - a.active || b.signal - a.signal);
}

async function connectWifi(ssid, password) {
    const args = ['device', 'wifi', 'connect', String(ssid)];
    if (password) args.push('password', String(password));
    return (await run('nmcli', args, 30000)) != null;
}

module.exports = { status, wifiNetworks, connectWifi };
