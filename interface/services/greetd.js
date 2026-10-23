// Connexion d'un compte depuis l'écran d'accueil, par greetd (le service qui vérifie le mot de
// passe avec PAM puis lance la session). Protocole : messages JSON précédés de leur longueur
// (entier 32 bits), sur la prise $GREETD_SOCK.
const net = require('node:net');

function request(socket, message) {
    return new Promise((resolve, reject) => {
        let buffer = Buffer.alloc(0);

        const onData = chunk => {
            buffer = Buffer.concat([buffer, chunk]);
            if (buffer.length < 4) return;
            const length = buffer.readUInt32LE(0);
            if (buffer.length < 4 + length) return;
            socket.off('data', onData);
            try {
                resolve(JSON.parse(buffer.subarray(4, 4 + length).toString('utf8')));
            } catch (error) {
                reject(error);
            }
        };

        socket.on('data', onData);
        const body = Buffer.from(JSON.stringify(message), 'utf8');
        const header = Buffer.alloc(4);
        header.writeUInt32LE(body.length, 0);
        socket.write(Buffer.concat([header, body]));
    });
}

// Ouvre la session de `user` avec `password`. Résultat : { ok } ou { ok: false, error }
async function login(user, password, command = ['/usr/local/bin/robbie-os-session']) {
    const path = process.env.GREETD_SOCK;
    if (!path) return { ok: false, error: 'Écran d\'accueil lancé hors de greetd' };

    const socket = net.createConnection(path);
    await new Promise((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('error', reject);
    });

    try {
        let reply = await request(socket, { type: 'create_session', username: user });

        // PAM pose ses questions (le mot de passe) ; un compte sans mot de passe (invité) n'en pose pas
        let answered = false;
        while (reply.type === 'auth_message') {
            const secret = reply.auth_message_type === 'secret' || reply.auth_message_type === 'visible';
            reply = await request(socket, {
                type: 'post_auth_message_response',
                response: secret && !answered ? password : null
            });
            if (secret) answered = true;
        }

        if (reply.type === 'error') {
            await request(socket, { type: 'cancel_session' }).catch(() => {});
            return { ok: false, error: reply.error_type === 'auth_error' ? 'Mot de passe incorrect' : (reply.description || 'Connexion impossible') };
        }

        reply = await request(socket, { type: 'start_session', cmd: command, env: [] });
        if (reply.type !== 'success') return { ok: false, error: reply.description || 'Session impossible à démarrer' };
        return { ok: true };
    } finally {
        socket.end();
    }
}

module.exports = { login };
