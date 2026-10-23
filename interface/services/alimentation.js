// Éteindre, redémarrer, mettre en veille (systemd, sans mot de passe pour l'utilisateur connecté)
const { execFile } = require('node:child_process');

const ACTIONS = {
    poweroff: ['systemctl', ['poweroff']],
    reboot: ['systemctl', ['reboot']],
    suspend: ['systemctl', ['suspend']]
};

function power(action) {
    const command = ACTIONS[action];
    if (!command) return false;

    execFile(...command, error => {
        if (error) console.error(`Action impossible (${action}) :`, error.message);
    });
    return true;
}

module.exports = { power };
