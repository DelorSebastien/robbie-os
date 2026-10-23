// État de la machine : processeur, mémoire, disque, température, réseau
const os = require('node:os');
const fs = require('node:fs');

const read = file => {
    try {
        return fs.readFileSync(file, 'utf8');
    } catch {
        return '';
    }
};

// Le processeur se mesure entre deux relevés
let lastCpu = null;

function cpuPercent() {
    const now = os.cpus().reduce((total, cpu) => {
        const times = Object.values(cpu.times);
        total.all += times.reduce((a, b) => a + b, 0);
        total.idle += cpu.times.idle;
        return total;
    }, { all: 0, idle: 0 });

    const previous = lastCpu;
    lastCpu = now;
    if (!previous || now.all === previous.all) return 0;

    return Math.round(100 * (1 - (now.idle - previous.idle) / (now.all - previous.all)));
}

// Mémoire vraiment disponible (le cache du système compte comme libre)
function memory() {
    const info = Object.fromEntries(read('/proc/meminfo').split('\n')
        .map(line => line.match(/^(\w+):\s+(\d+)/))
        .filter(Boolean)
        .map(([, key, value]) => [key, Number(value) * 1024]));

    const total = info.MemTotal || os.totalmem();
    const available = info.MemAvailable ?? os.freemem();
    return { total, used: total - available };
}

function disk() {
    try {
        const stats = fs.statfsSync('/');
        const total = stats.blocks * stats.bsize;
        return { total, used: total - stats.bavail * stats.bsize };
    } catch {
        return { total: 0, used: 0 };
    }
}

// Température la plus chaude parmi les capteurs (aucune dans une machine virtuelle)
function temperature() {
    const files = [];

    for (const zone of safeList('/sys/class/thermal')) {
        if (zone.startsWith('thermal_zone')) files.push(`/sys/class/thermal/${zone}/temp`);
    }
    for (const hwmon of safeList('/sys/class/hwmon')) {
        for (const name of safeList(`/sys/class/hwmon/${hwmon}`)) {
            if (/^temp\d+_input$/.test(name)) files.push(`/sys/class/hwmon/${hwmon}/${name}`);
        }
    }

    const values = files.map(file => Number(read(file)) / 1000).filter(value => value > 0 && value < 130);
    return values.length ? Math.round(Math.max(...values)) : null;
}

function safeList(folder) {
    try {
        return fs.readdirSync(folder);
    } catch {
        return [];
    }
}

// Débit réseau (octets par seconde) entre deux relevés
let lastNet = null;

function network() {
    const totals = read('/proc/net/dev').split('\n').slice(2)
        .map(line => line.trim().split(/[:\s]+/))
        .filter(([name]) => name && name !== 'lo')
        .reduce((sum, fields) => ({ rx: sum.rx + Number(fields[1]), tx: sum.tx + Number(fields[9]) }), { rx: 0, tx: 0 });

    const now = { ...totals, time: Date.now() };
    const previous = lastNet;
    lastNet = now;
    if (!previous) return { down: 0, up: 0 };

    const seconds = (now.time - previous.time) / 1000 || 1;
    return {
        down: Math.max(0, (now.rx - previous.rx) / seconds),
        up: Math.max(0, (now.tx - previous.tx) / seconds)
    };
}

function snapshot() {
    return {
        cpu: cpuPercent(),
        memory: memory(),
        disk: disk(),
        temperature: temperature(),
        network: network(),
        uptime: os.uptime(),
        hostname: os.hostname()
    };
}

module.exports = { snapshot };
