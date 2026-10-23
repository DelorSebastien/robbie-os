// Robbie dans Robbie OS : son cerveau (Ollama), sa voix (Piper), son oreille (Whisper)
// et ses actions sur le système. La page reçoit tout par `send(canal, données)`.
const { createOllama } = require('../../robbie/cerveau/ollama');
const { OS_PROMPT } = require('../../robbie/cerveau/prompts');
const { createSpeech, cleanForSpeech } = require('../../robbie/cerveau/speech');
const { createMicrophone } = require('../../robbie/cerveau/microphone');
const actions = require('./actions');
const meteo = require('./meteo');
const notes = require('./notes');

const MODEL = process.env.ROBBIE_MODEL || 'qwen3:8b';
const WAKE_WORD = /\b(robbie|robby|robie|roby|robi|robbi|ruby)\b/i;
const EMOTIONS = ['happy', 'sad', 'angry', 'curious', 'shocked', 'love', 'tired', 'suspicious', 'shy',
    'dizzy', 'proud', 'excited', 'scared', 'mocking', 'laughing', 'neutral'];

// Après une réponse, on peut continuer à lui parler sans redire « Robbie » pendant ce temps
const CONVERSATION_SECONDS = 12;

function createRobbie({ send }) {
    const ollama = createOllama({ settings: { get: () => ({ brain: MODEL }) } });
    const speech = createSpeech();
    const history = [];

    let busy = false;
    let speaking = false;
    let listeningUntil = 0;
    let panelOpen = false;

    // Contexte du moment : date, heure, météo de la ville choisie
    async function context() {
        const now = new Date();
        const lines = [
            `Nous sommes le ${now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.`,
            `Il est ${now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}.`
        ];

        try {
            const w = await meteo.current(notes.getSettings().place);
            lines.push(`Météo à ${w.city} : ${w.temperature}° (ressenti ${w.feelsLike}°), ${w.label.toLowerCase()}, `
                + `entre ${w.min}° et ${w.max}° aujourd'hui, vent ${w.wind} km/h.`);
        } catch {
            lines.push('Météo indisponible (pas d\'internet).');
        }

        return lines.join('\n');
    }

    async function ask(text, { fromVoice = false } = {}) {
        const question = String(text || '').trim();
        if (!question || busy) return;

        busy = true;
        send('robbie-question', { text: question, fromVoice });
        send('robbie-etat', 'reflechit');

        let reply;
        try {
            const messages = [
                { role: 'system', content: `${OS_PROMPT}\n\nContexte :\n${await context()}` },
                ...history.slice(-12),
                { role: 'user', content: question }
            ];
            reply = await ollama.chat(messages, 0.7);
        } catch (error) {
            console.error('Cerveau de Robbie :', error.message);
            reply = {
                emotion: 'dizzy',
                text: 'Je n\'arrive pas à joindre mon cerveau. Vérifie qu\'Ollama est bien lancé.',
                action: null
            };
        }

        const emotion = EMOTIONS.includes(reply.emotion) ? reply.emotion : 'neutral';
        let answer = String(reply.text || '').trim() || 'Hmm, je n\'ai pas compris.';

        // Action demandée : exécutée, ou proposée à confirmer
        const result = reply.action ? await actions.execute(reply.action) : { done: false };
        if (result.say) answer = result.say;

        history.push({ role: 'user', content: question }, { role: 'assistant', content: JSON.stringify({ emotion, text: answer }) });
        if (history.length > 24) history.splice(0, history.length - 24);

        send('robbie-reponse', { text: answer, emotion, confirm: result.confirm || null });
        busy = false;
        listeningUntil = Date.now() + CONVERSATION_SECONDS * 1000;

        say(answer);
    }

    // Robbie parle : la page joue le son et anime sa bouche.
    // Son oreille est coupée pendant ce temps, sinon il s'entendrait dans les haut-parleurs
    // et se répondrait à lui-même.
    let lastSaid = '';

    async function say(text) {
        const clean = cleanForSpeech(text);
        if (!clean) return send('robbie-etat', 'pret');

        lastSaid = clean;
        muteEars(true);

        try {
            const audio = await speech.synthesize(clean);
            send('robbie-voix', audio.toString('base64'));
        } catch (error) {
            console.error('Voix de Robbie :', error.message);
            muteEars(false);
            send('robbie-etat', 'pret');
        }
    }

    let unmuteTimer = null;

    function muteEars(muted) {
        clearTimeout(unmuteTimer);
        if (muted) {
            microphone?.listen('aucun');
        } else {
            // (un court délai : l'écho de sa voix dans la pièce)
            unmuteTimer = setTimeout(() => microphone?.listen('pc'), 600);
        }
    }

    // Phrase entendue qui ressemble trop à ce que Robbie vient de dire : c'est son écho
    const words = text => new Set(String(text).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[a-z]{3,}/g) || []);

    function isEcho(text) {
        const heard = words(text);
        const said = words(lastSaid);
        if (heard.size === 0 || said.size === 0) return false;
        const common = [...heard].filter(word => said.has(word)).length;
        return common / heard.size >= 0.6;
    }

    // Oreille : « Robbie, … » déclenche une question ; juste après une réponse, inutile de redire son nom
    let microphone = null;

    function startMicrophone() {
        microphone = createMicrophone({
            onHeard: heard => {
                // (Whisper ajoute parfois des « … » sur les silences)
                const text = heard.replace(/…|\.{3,}/g, ' ').replace(/\s+/g, ' ').trim();
                if (speaking || busy || !text || isEcho(text)) return;

                const named = WAKE_WORD.test(text);
                const inConversation = Date.now() < listeningUntil;
                if (!named && !inConversation) return;

                const request = text.replace(new RegExp(WAKE_WORD.source, 'gi'), '').replace(/^[\s,.!?]+|[\s,]+$/g, '');
                if (!request || request.length < 2) {
                    send('robbie-ouvrir', null);
                    listeningUntil = Date.now() + CONVERSATION_SECONDS * 1000;
                    send('robbie-reponse', { text: 'Oui ?', emotion: 'curious', confirm: null });
                    say('Oui ?');
                    return;
                }

                send('robbie-ouvrir', null);
                ask(request, { fromVoice: true });
            },
            onVoiceActive: () => {
                if (!speaking) send('robbie-ecoute', null);
            },
            onProblem: problem => {
                console.error('Micro :', problem.title, problem.detail);
                send('robbie-micro', { ok: false, ...problem });
            }
        });
        microphone.setVocabulary(['Robbie', 'Robbie OS', 'Firefox', 'Thunar', 'téléchargements']);
    }

    // (l'aperçu sur Windows n'a ni Whisper ni micro configuré : on n'écoute que sous Linux)
    if (process.platform === 'linux') startMicrophone();

    // Le modèle met une trentaine de secondes à se charger la première fois :
    // on le réveille dès le démarrage plutôt qu'à la première question
    // (plusieurs essais : au démarrage, le réseau n'est pas toujours encore prêt)
    async function wakeBrain(attempt = 1) {
        try {
            await ollama.chat([{ role: 'user', content: 'Réponds {"ok": true}' }], 0);
            console.log(`Cerveau de Robbie prêt (${MODEL})`);
        } catch (error) {
            if (attempt < 6) setTimeout(() => wakeBrain(attempt + 1), 10000);
            else console.error('Cerveau de Robbie injoignable :', error.message);
        }
    }
    wakeBrain();

    return {
        ask,
        // La page signale quand Robbie parle : son micro ignore alors sa propre voix
        setSpeaking(value) {
            speaking = Boolean(value);
            if (!speaking) {
                muteEars(false);
                listeningUntil = Date.now() + CONVERSATION_SECONDS * 1000;
                send('robbie-etat', 'pret');
            }
        },
        setPanelOpen(value) {
            panelOpen = Boolean(value);
            if (panelOpen) listeningUntil = Date.now() + CONVERSATION_SECONDS * 1000;
        },
        confirm(action) {
            const ok = actions.confirm(action);
            return ok;
        },
        stop() {
            speech.stop();
            microphone?.stop();
        }
    };
}

module.exports = { createRobbie };
