// Emplacements des fichiers de Robbie
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

module.exports = {
    ROOT,
    ICON: path.join(ROOT, 'assets', 'robbie.png'),
    // Scripts Python (voix et micro)
    python: name => path.join(ROOT, 'python', name)
};
