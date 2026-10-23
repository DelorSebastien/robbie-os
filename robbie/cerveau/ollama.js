// Ollama : le « cerveau » de Robbie (modèles de langage locaux)
// Requêtes au modèle, et vérification qu'Ollama tourne (lancé au besoin)
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

// Adresse d'Ollama : sur cette machine par défaut, ou ailleurs (ROBBIE_OLLAMA), par exemple
// l'Ollama de Windows vu depuis une machine virtuelle (http://10.0.2.2:11434)
const OLLAMA = process.env.ROBBIE_OLLAMA || 'http://127.0.0.1:11434';
const OLLAMA_URL = `${OLLAMA}/api/chat`;

// Taille de la mémoire de travail du modèle (en jetons)
const CONTEXT_SIZE = 8192;

// Modèle du maître du jeu : plus fiable que Gemma 4B pour le récit et les règles,
// et il tient entièrement dans 8 Go de carte graphique (environ 3 s par réponse).
// gemma3:12b écrit mieux mais est trop gros pour 8 Go (environ 22 s par réponse).
const GM_MODEL = 'qwen3:8b';

// Les modèles qui « réfléchissent » (qwen3...) répondent directement
const noThinking = model => (/qwen3|deepseek-r1/i.test(model) ? { think: false } : {});

// Lecture du champ "text" d'un JSON encore incomplet (réponse en flux)
function extractText(json) {
    const start = json.match(/"text"\s*:\s*"/);
    if (!start) return { text: '', complete: false };

    const escapes = { n: ' ', t: ' ', r: '', '"': '"', '\\': '\\', '/': '/' };
    let i = start.index + start[0].length;
    let text = '';

    while (i < json.length) {
        const char = json[i];

        if (char === '"') return { text, complete: true };

        if (char === '\\') {
            if (i + 1 >= json.length) break;

            const next = json[i + 1];

            if (next === 'u') {
                if (i + 6 > json.length) break;
                text += String.fromCharCode(parseInt(json.slice(i + 2, i + 6), 16));
                i += 6;
            } else {
                text += escapes[next] ?? next;
                i += 2;
            }
            continue;
        }

        text += char;
        i++;
    }

    return { text, complete: false };
}

function createOllama({ settings }) {
    // Cerveau de Robbie (réglable : Gemma 3 4B par défaut, voir settings.js)
    const aiModel = () => settings.get().brain;

    // Requête JSON simple
    async function chat(messages, temperature = 0.8, model = aiModel()) {
        const response = await fetch(OLLAMA_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model,
                messages,
                format: 'json',
                stream: false,
                keep_alive: '30m',
                // Contexte élargi : sinon Ollama coupe le début du prompt (les consignes)
                // dès que la partie s'allonge
                options: { temperature, num_ctx: CONTEXT_SIZE },
                ...noThinking(model)
            }),
            signal: AbortSignal.timeout(120000)
        });

        if (!response.ok) throw new Error(`Ollama : ${response.status}`);

        const data = await response.json();
        return JSON.parse(data.message?.content || '{}');
    }

    // Modèles installés, ou null si Ollama ne répond pas
    async function installedModels() {
        try {
            const response = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(3000) });
            if (!response.ok) return null;
            return (await response.json()).models.map(model => model.name);
        } catch {
            return null;
        }
    }

    // Modèles nécessaires absents (null si Ollama ne répond pas)
    async function missingModels(required) {
        const installed = await installedModels();
        if (!installed) return null;

        return [...new Set(required)].filter(name => !installed.some(model => model === name || model === `${name}:latest`));
    }

    // Lancement d'Ollama s'il ne tourne pas : l'application installée, sinon « ollama serve »
    let starting = null;

    function ensureRunning() {
        starting ??= (async () => {
            if (await installedModels()) return true;

            console.log('Ollama ne répond pas : je le lance');
            const appPath = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama app.exe');
            const child = fs.existsSync(appPath)
                ? spawn(appPath, [], { detached: true, stdio: 'ignore' })
                : spawn('ollama', ['serve'], { detached: true, stdio: 'ignore', windowsHide: true });

            child.on('error', error => console.error('Lancement d\'Ollama impossible :', error.message));
            child.unref();

            for (let i = 0; i < 25; i++) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                if (await installedModels()) return true;
            }

            return false;
        })().finally(() => {
            starting = null;
        });

        return starting;
    }

    return { aiModel, chat, installedModels, missingModels, ensureRunning };
}

module.exports = { createOllama, extractText, noThinking, OLLAMA_URL, CONTEXT_SIZE, GM_MODEL };
