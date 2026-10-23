// Emplacements des fichiers de Robbie
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '..');

// Python de Robbie : celui de son environnement (.venv à la racine de Robbie OS),
// sinon celui du système
const VENV_PYTHON = path.join(ROOT, '..', '.venv', 'bin', 'python');
const PYTHON = fs.existsSync(VENV_PYTHON) ? VENV_PYTHON : (process.platform === 'win32' ? 'python' : 'python3');

module.exports = {
    ROOT,
    PYTHON,
    ICON: path.join(ROOT, 'assets', 'robbie.png'),
    // Scripts Python (voix et micro)
    python: name => path.join(ROOT, 'python', name)
};
