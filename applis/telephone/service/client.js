// Parler au service du téléphone (depuis l'interface ou l'appli Téléphone) : des demandes
// avec réponse, et les nouvelles qu'il envoie (message reçu, appel, état). Reconnexion seule.
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const SOCKET = process.env.ROBBIE_TELEPHONE_SOCKET || path.join(process.env.XDG_RUNTIME_DIR || os.tmpdir(), 'robbie-telephone.sock');

function connectService(role) {
    const events = new EventEmitter();
    const waiting = new Map();
    let socket = null;
    let connected = false;
    let buffer = '';
    let next = 1;
    let stopped = false;

    function open() {
        if (stopped) return;
        socket = net.connect(SOCKET);
        socket.setEncoding('utf8');
        socket.on('connect', () => {
            connected = true;
            socket.write(JSON.stringify({ role }) + '\n');
            events.emit('connecte');
        });
        socket.on('data', chunk => {
            buffer += chunk;
            let end;
            while ((end = buffer.indexOf('\n')) >= 0) {
                const line = buffer.slice(0, end);
                buffer = buffer.slice(end + 1);
                let message;
                try {
                    message = JSON.parse(line);
                } catch {
                    continue;
                }
                if (message.ev) events.emit(message.ev, message.d);
                else if (waiting.has(message.id)) {
                    const { resolve, reject } = waiting.get(message.id);
                    waiting.delete(message.id);
                    if (message.e) reject(new Error(message.e));
                    else resolve(message.r);
                }
            }
        });
        socket.on('error', () => {});
        socket.on('close', () => {
            const was = connected;
            connected = false;
            buffer = '';
            for (const { reject } of waiting.values()) reject(new Error('Service du téléphone injoignable'));
            waiting.clear();
            if (was) events.emit('deconnecte');
            setTimeout(open, was ? 300 : 1500);
        });
    }

    function call(method, ...args) {
        if (!connected) return Promise.reject(new Error('Service du téléphone injoignable'));
        const id = next++;
        return new Promise((resolve, reject) => {
            waiting.set(id, { resolve, reject });
            socket.write(JSON.stringify({ id, m: method, a: args }) + '\n');
        });
    }

    open();
    return {
        events,
        call,
        get connected() {
            return connected;
        },
        close() {
            stopped = true;
            socket?.destroy();
        }
    };
}

module.exports = { connectService, SOCKET };
