// L'identité de cet ordinateur pour le téléphone : une clé et un certificat créés une fois
// (openssl). Les téléphones et les autres Robbie OS reconnaissent l'ordinateur à l'empreinte
// de ce certificat : personne ne peut se faire passer pour lui, et tout passe chiffré.
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DIR } = require('./stockage');

const KEY = path.join(DIR, 'cle.pem');
const CERT = path.join(DIR, 'certificat.pem');

// Nom affiché chez les autres : le nom complet de la personne, sinon son identifiant
function displayName() {
    if (process.env.ROBBIE_NOM) return process.env.ROBBIE_NOM;
    try {
        const line = fs.readFileSync('/etc/passwd', 'utf8').split('\n').find(l => l.startsWith(`${os.userInfo().username}:`));
        const full = line?.split(':')[4]?.split(',')[0]?.trim();
        if (full) return full;
    } catch {}
    const name = os.userInfo().username;
    return name.charAt(0).toUpperCase() + name.slice(1);
}

function create() {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes',
        '-keyout', KEY, '-out', CERT, '-days', '7300', '-subj', '/CN=Robbie OS'], { stdio: 'ignore' });
    fs.chmodSync(KEY, 0o600);
}

// Empreinte d'un certificat : 64 caractères hexadécimaux
const fingerprint = cert => new crypto.X509Certificate(cert).fingerprint256.replace(/:/g, '').toLowerCase();

function load() {
    if (!fs.existsSync(KEY) || !fs.existsSync(CERT)) create();
    const cert = fs.readFileSync(CERT);
    return {
        key: fs.readFileSync(KEY),
        cert,
        id: fingerprint(cert),
        nom: displayName(),
        machine: os.hostname()
    };
}

module.exports = { load, fingerprint, displayName };
