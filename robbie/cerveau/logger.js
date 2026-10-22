// Journal : tout ce qui s'affiche dans la console est aussi écrit dans un fichier
// (%APPDATA%\robot\logs\robbie-AAAA-MM-JJ.log, gardé 7 jours), pour comprendre un bug
// même quand Robbie est lancé par son icône, sans console
const fs = require('node:fs');
const path = require('node:path');
const util = require('node:util');

const KEEP_DAYS = 7;

function installLogger(app) {
    const folder = path.join(app.getPath('userData'), 'logs');
    fs.mkdirSync(folder, { recursive: true });

    // Ménage : journaux de plus d'une semaine
    for (const name of fs.readdirSync(folder)) {
        const file = path.join(folder, name);
        if (Date.now() - fs.statSync(file).mtimeMs > KEEP_DAYS * 86400000) fs.rmSync(file, { force: true });
    }

    // Un fichier par jour (date locale)
    const current = () => path.join(folder, `robbie-${new Date().toLocaleDateString('sv-SE')}.log`);

    function write(level, args) {
        const time = new Date().toLocaleTimeString('fr-FR');

        try {
            fs.appendFileSync(current(), `${time} ${level}${util.format(...args)}\n`);
        } catch {
            // Disque plein ou fichier verrouillé : la console suffit
        }
    }

    for (const [method, level] of [['log', ''], ['info', ''], ['warn', 'ATTENTION '], ['error', 'ERREUR ']]) {
        const original = console[method].bind(console);

        console[method] = (...args) => {
            original(...args);
            write(level, args);
        };
    }

    // Une erreur imprévue est notée au lieu de faire planter Robbie
    process.on('uncaughtException', error => console.error('Plantage évité :', error?.stack || error));
    process.on('unhandledRejection', error => console.error('Promesse rejetée :', error?.stack || error));

    console.log(`--- Démarrage de Robbie (journal : ${current()}) ---`);
    return { folder, current };
}

module.exports = { installLogger };
