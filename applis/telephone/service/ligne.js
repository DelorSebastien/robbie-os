// Messages JSON, un par ligne, sur une connexion (chiffrée ou locale)
const MAX_LINE = 24 * 1024 * 1024;

function wrap(socket, onMessage, onClose) {
    let buffer = '';
    let closed = false;
    socket.setEncoding('utf8');
    socket.on('data', chunk => {
        buffer += chunk;
        if (buffer.length > MAX_LINE) {
            socket.destroy();
            return;
        }
        let end;
        while ((end = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, end);
            buffer = buffer.slice(end + 1);
            if (!line.trim()) continue;
            let message;
            try {
                message = JSON.parse(line);
            } catch {
                continue;
            }
            if (message && typeof message === 'object') onMessage(message);
        }
    });
    const close = () => {
        if (closed) return;
        closed = true;
        onClose?.();
    };
    socket.on('close', close);
    socket.on('error', close);
    return {
        socket,
        send(message) {
            if (closed || socket.destroyed) return false;
            socket.write(JSON.stringify(message) + '\n');
            return true;
        },
        close() {
            socket.destroy();
        },
        get closed() {
            return closed;
        }
    };
}

module.exports = { wrap };
