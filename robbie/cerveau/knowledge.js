// Connaissances de Robbie : mémoire par le sens (embeddings), Wikipédia et rêves
const EMBED_MODEL = 'paraphrase-multilingual';

// Deux souvenirs plus proches que ce seuil sont considérés comme identiques
const SAME_MEMORY = 0.9;
// Proximité minimale pour qu'un souvenir soit jugé utile à la conversation
const RELEVANT = 0.45;
// Proximité à partir de laquelle deux souvenirs peuvent se contredire
const RELATED = 0.55;

// Catégories de souvenirs : pour celles à valeur unique, le plus récent remplace l'ancien
// (la proximité de sens ne suffit pas à repérer « s'appelle Roby » / « s'appelle Sébastien »)
const CATEGORIES = ['prénom', 'âge', 'ville', 'métier', 'situation', 'anniversaire', 'couple',
    'famille', 'animal', 'goût', 'projet', 'habitude', 'santé', 'autre'];
const SINGLE_CATEGORIES = ['prénom', 'âge', 'ville', 'métier', 'situation', 'anniversaire', 'couple'];

const CATEGORY_PROMPT = `Classe un fait sur l'utilisateur d'un robot dans UNE catégorie :
prénom, âge, ville (où il habite), métier, situation (emploi, études, chômage),
anniversaire, couple, famille, animal, goût, projet, habitude, santé, autre.
Réponds uniquement avec ce JSON : {"category": "..."}`;

// Contrôle d'un nouveau souvenir face aux souvenirs proches
const CHECK_PROMPT = `Tu tiens la mémoire d'un robot de bureau sur son utilisateur.
On te donne un nouveau fait et des faits déjà connus (numérotés).
Réponds uniquement avec ce JSON : {"store": true, "remove": []}

- "store" : false si le nouveau fait est déjà connu (même sens) ou absurde.
- "remove" : numéros des faits connus que le nouveau fait CONTREDIT ou rend obsolètes
  (le nouveau fait est le plus récent : il a raison). Liste vide sinon.
Exemple : nouveau "Le chat de l'utilisateur s'appelle Mochi", connu 1. "Le chat de l'utilisateur s'appelle Tigrou"
-> {"store": true, "remove": [1]}`;

// Grand ménage de la mémoire (pendant le sommeil ou à la demande)
const CLEANUP_PROMPT = `Tu fais le ménage dans la mémoire d'un robot de bureau sur son utilisateur.
Les souvenirs sont numérotés du plus ancien au plus récent.
Réponds uniquement avec ce JSON : {"remove": []}

"remove" contient les numéros des souvenirs à supprimer :
- ceux qui se contredisent (garde le plus récent, au numéro le plus grand) ;
- les doublons (garde le plus précis) ;
- ceux qui parlent du robot et pas de l'utilisateur ;
- les états passagers (« a faim en ce moment », « est fatigué ce soir ») et les phrases vides de sens.
Les habitudes et goûts durables (« ne cuisine pas », « aime le jazz ») sont à GARDER.
Ne supprime rien d'autre : en cas de doute, garde le souvenir.`;

// Filtre de forme : un souvenir doit être un fait sur l'utilisateur,
// pas une phrase à la première personne, pas un fait sur Robbie lui-même
function isValidFact(text) {
    const fact = text.trim();

    if (fact.length < 12 || fact.length > 220) return false;
    if (/\.\.\.|…/.test(fact) || fact.split(/\s+/).length < 3) return false;
    // Texte à trous (« [nom de l'utilisateur] ») ou fuite des consignes
    if (/[[\]{}<>]|\bjson\b|\bphrases?\b.*\banaly|\br[ée]ponses?\b.*\bg[ée]n[ée]r/i.test(fact)) return false;
    if (!/l'utilisateur/i.test(fact)) return false;
    if (/(^|\s)(je|j'|moi|nous)\b/i.test(fact)) return false;
    if (/\b(robbie|robby|roby|robi|robot)\b/i.test(fact) && !/(cr[ée]|construi|d[ée]velopp|travaille sur|programm)/i.test(fact)) return false;
    if (/(demande|s'enquiert|pose (une|des) questions?|veut savoir|dit au|parle au)/i.test(fact)) return false;

    return true;
}

const DREAM_PROMPT = `Tu es Robbie, un petit robot de bureau qui dort et rêve.
À partir de la conversation de la journée, réponds uniquement avec ce JSON :
{"memories": ["..."], "dream": "..."}

- "memories" : 0 à 5 informations DURABLES et importantes sur l'utilisateur apprises
  dans la conversation (goûts, proches, travail, projets, habitudes), en phrases courtes
  à la troisième personne (« L'utilisateur... »). Rien de passager, rien de déjà connu.
  Seulement ce que l'utilisateur a clairement affirmé sur lui-même avec « je » :
  jamais ce que Robbie a dit, jamais un mot incompréhensible, jamais de texte à trous.
- "dream" : un rêve court (2 à 3 phrases), poétique et drôle, raconté à la première
  personne et au passé (« J'ai rêvé que... »), inspiré de ce que vous vous êtes dit.
  Tu tutoies l'utilisateur.`;

function cosine(a, b) {
    let dot = 0;
    let na = 0;
    let nb = 0;

    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }

    return dot / (Math.sqrt(na * nb) || 1);
}

function createKnowledge({ ollamaUrl, memory, save }) {
    memory.memories ??= [];

    // Requête au modèle de langage (fournie au démarrage de l'application)
    let chat = null;

    async function embed(texts) {
        const response = await fetch(ollamaUrl.replace('/api/chat', '/api/embed'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: EMBED_MODEL, input: texts, keep_alive: '30m' }),
            signal: AbortSignal.timeout(60000)
        });

        if (!response.ok) throw new Error(`Embeddings : ${response.status}`);
        return (await response.json()).embeddings;
    }

    // Ajout d'un souvenir, après filtrage (renvoie true s'il est enregistré)
    async function add(text, kind = 'fact') {
        if (kind === 'fact' && !isValidFact(text)) {
            console.log('Souvenir refusé (forme) :', text);
            return false;
        }

        const [vector] = await embed([text]);
        const similar = memory.memories.find(m => cosine(m.vector, vector) > SAME_MEMORY);

        // Quasi identique : on garde la formulation la plus récente
        if (similar) {
            Object.assign(similar, { text, date: Date.now() });
            save();
            return false;
        }

        let category = 'autre';

        if (kind === 'fact' && chat) {
            try {
                const result = await chat([
                    { role: 'system', content: CATEGORY_PROMPT },
                    { role: 'user', content: text }
                ], 0);

                if (CATEGORIES.includes(result.category)) category = result.category;
            } catch (error) {
                console.error('Erreur catégorie :', error.message);
            }

            // Autres contradictions : souvenirs de même catégorie ou proches par le sens
            const related = memory.memories
                .filter(m => m.kind === 'fact')
                .map(m => ({ memory: m, score: cosine(m.vector, vector) + (m.category === category ? 0.2 : 0) }))
                .filter(result => result.score > RELATED)
                .sort((a, b) => b.score - a.score)
                .slice(0, 5)
                .map(result => result.memory);

            if (related.length) {
                try {
                    const verdict = await chat([
                        { role: 'system', content: CHECK_PROMPT },
                        {
                            role: 'user',
                            content: `Nouveau fait : ${text}\nFaits connus :\n${related.map((m, i) => `${i + 1}. ${m.text}`).join('\n')}`
                        }
                    ], 0.1);

                    // Déjà connu : rien n'est enregistré, et surtout rien n'est effacé
                    if (verdict.store === false) {
                        console.log('Souvenir refusé (déjà connu) :', text);
                        return false;
                    }

                    const outdated = (Array.isArray(verdict.remove) ? verdict.remove : [])
                        .map(n => related[Number(n) - 1])
                        .filter(Boolean);

                    outdated.forEach(m => {
                        console.log('Souvenir remplacé :', m.text);
                        remove(m.id);
                    });
                } catch (error) {
                    console.error('Erreur contrôle mémoire :', error.message);
                }
            }
        }

        // Catégorie à valeur unique (prénom, ville...) : l'ancien souvenir est remplacé
        if (SINGLE_CATEGORIES.includes(category)) {
            memory.memories
                .filter(m => m.kind === 'fact' && m.category === category)
                .forEach(m => {
                    console.log(`Souvenir remplacé (${category}) :`, m.text);
                    remove(m.id);
                });
        }

        memory.memories.push({ id: Date.now() + Math.random(), text, kind, category, date: Date.now(), vector });
        save();
        return true;
    }

    // « Oublie que j'ai un chat » : efface le souvenir le plus proche du sujet
    // (et ceux presque aussi proches, sans toucher au reste)
    async function forgetAbout(subject) {
        const facts = memory.memories.filter(m => m.kind === 'fact');
        if (!facts.length) return [];

        const [vector] = await embed([`L'utilisateur ${subject}`]);
        const scored = facts
            .map(m => ({ memory: m, score: cosine(vector, m.vector) }))
            .sort((a, b) => b.score - a.score);

        const best = scored[0].score;
        if (best < 0.5) return [];

        const matches = scored.filter(r => r.score > best - 0.05).map(r => r.memory);
        matches.forEach(m => remove(m.id));
        return matches.map(m => m.text);
    }

    // Grand ménage : faux, doublons, contradictions, faits sur le robot
    async function cleanup() {
        const facts = memory.memories.filter(m => m.kind === 'fact');

        // Filtre de forme d'abord (sans le modèle)
        const invalid = facts.filter(m => !isValidFact(m.text));
        invalid.forEach(m => remove(m.id));

        // Catégories à valeur unique : seul le souvenir le plus récent est gardé
        const outdated = [];

        SINGLE_CATEGORIES.forEach(category => {
            const same = memory.memories
                .filter(m => m.kind === 'fact' && m.category === category)
                .sort((a, b) => b.date - a.date);

            same.slice(1).forEach(m => outdated.push(m));
        });

        outdated.forEach(m => remove(m.id));

        const remaining = memory.memories
            .filter(m => m.kind === 'fact')
            .sort((a, b) => a.date - b.date);

        let removed = [...invalid, ...outdated].map(m => m.text);

        if (chat && remaining.length > 1) {
            for (let start = 0; start < remaining.length; start += 40) {
                const batch = remaining.slice(start, start + 40);

                const result = await chat([
                    { role: 'system', content: CLEANUP_PROMPT },
                    { role: 'user', content: batch.map((m, i) => `${i + 1}. ${m.text}`).join('\n') }
                ], 0.1);

                // (les catégories à valeur unique sont déjà gérées : le plus récent est gardé)
                const doomed = (Array.isArray(result.remove) ? result.remove : [])
                    .map(n => batch[Number(n) - 1])
                    .filter(m => m && !SINGLE_CATEGORIES.includes(m.category));

                doomed.forEach(m => remove(m.id));
                removed = removed.concat(doomed.map(m => m.text));
            }
        }

        if (removed.length) console.log(`Mémoire nettoyée : ${removed.length} souvenir(s) supprimé(s)`, removed);
        return removed;
    }

    // Souvenirs les plus proches du sens de la phrase
    async function search(query, count = 6, kind = null) {
        const pool = memory.memories.filter(m => !kind || m.kind === kind);
        if (!pool.length || !query.trim()) return [];

        const [vector] = await embed([query]);

        return pool
            .map(m => ({ memory: m, score: cosine(vector, m.vector) }))
            .filter(result => result.score > RELEVANT)
            .sort((a, b) => b.score - a.score)
            .slice(0, count)
            .map(result => result.memory);
    }

    const list = () => memory.memories
        .map(({ id, text, kind, date }) => ({ id, text, kind, date }))
        .sort((a, b) => b.date - a.date);

    function remove(id) {
        memory.memories = memory.memories.filter(m => m.id !== id);
        save();
    }

    function clear() {
        memory.memories = [];
        save();
    }


    // Wikipédia (résumé de l'article le plus pertinent)
    async function wikipedia(question) {
        const query = question
            .replace(/\b(robbie|robby|robie|roby|robi)\b/gi, '')
            .replace(/[?!.,]/g, ' ')
            .trim();

        if (!query) return null;

        const options = { signal: AbortSignal.timeout(5000), headers: { 'User-Agent': 'Robbie/1.0 (robot de bureau)' } };

        const search = await fetch(
            `https://fr.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=1&format=json`,
            options
        ).then(response => response.json());

        const title = search.query?.search?.[0]?.title;
        if (!title) return null;

        const page = await fetch(
            `https://fr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
            options
        ).then(response => response.json());

        const extract = String(page.extract || '').slice(0, 900);
        return extract ? { title: page.title || title, extract } : null;
    }


    // Rêve : tri de la journée pendant le sommeil
    async function dream(chat, conversation) {
        const result = await chat([
            { role: 'system', content: DREAM_PROMPT },
            {
                role: 'user',
                content: `Ce que tu sais déjà :\n${list().slice(0, 20).map(m => `- ${m.text}`).join('\n') || '(rien)'}\n\n` +
                    `Conversation de la journée :\n${conversation}`
            }
        ], 0.9);

        const memories = (Array.isArray(result.memories) ? result.memories : [])
            .filter(text => typeof text === 'string' && text.trim())
            .slice(0, 5);

        let added = 0;
        for (const text of memories) {
            if (await add(text.trim(), 'fact').catch(() => false)) added++;
        }

        // Le sommeil sert aussi à faire le ménage dans la mémoire
        const removed = await cleanup().catch(() => []);

        return {
            dream: typeof result.dream === 'string' ? result.dream.trim() : '',
            added,
            removed: removed.length
        };
    }

    return {
        add,
        search,
        list,
        remove,
        clear,
        wikipedia,
        dream,
        forgetAbout,
        cleanup,
        setChat: fn => { chat = fn; }
    };
}

module.exports = { createKnowledge, EMBED_MODEL };
