// Phrases reconnues : mots-clés des commandes, émotions et petits outils sur le texte
// Mot d'éveil : le robot ne répond que si on l'appelle par son nom
const WAKE_WORD = /\b(robbie|robby|robie|roby|robi|robbi)\b/i;

// Phrases qui lancent ou terminent une partie de jeu de rôle
const GM_START = /(deviens|sois|fais).{0,20}ma[iî]tre du jeu|mode (ma[iî]tre du jeu|jeu de r[ôo]le)|(lance|commence|fai[st]).{0,15}(partie|jeu de r[ôo]le)/i;
const GM_STOP = /fin de (la )?partie|(arr[êe]te|quitte|termine).{0,10}(la )?(partie|jeu)/i;

// Quand le micro a mal compris
const REPEAT_PHRASES = [
    "Pardon, j'ai mal entendu. Tu peux répéter ?",
    "Hein ? Tu peux redire, s'il te plaît ?",
    "Désolé, mes oreilles ont grésillé. Tu répètes ?"
];

// Mots qui coupent la parole au robot
const STOP_WORDS = /\b(stop|arr[êe]te|tais[- ]toi|chut|attends|silence)\b/i;

// Visite guidée : « fais-moi la visite », « présente-toi », puis « suivant », « précédent », « stop »
const TOUR_WORDS = /(fais|faire)[- ]moi (la |une )?visite|visite guid[ée]e|pr[ée]sente[- ]toi|montre[- ]moi (tout )?ce que tu sais faire/i;
const TOUR_NEXT = /suivant|continue|la suite|ensuite|vas-y/i;
const TOUR_PREVIOUS = /pr[ée]c[ée]dent|retour|reviens|en arri[èe]re/i;
const TOUR_STOP = /\b(stop|arr[êe]te|quitte|termine|fin)\b/i;

// « Qu'est-ce que tu vois ? », « regarde mon écran », « aide-moi avec cette erreur »...
const VISION_WORDS = /(regarde|vois|lis|analyse|d[ée]cris).{0,25}([ée]cran|[çc]a|ceci|cette|ce code|cette image)|qu'est-ce que tu vois|tu vois quoi|sur mon [ée]cran|cette erreur|ce bug/i;

// « Tu me vois ? », « qu'est-ce que je tiens ? », « regarde ça » : Robbie regarde par la caméra
const CAMERA_WORDS = /tu me vois|qu'est-ce que je (tiens|porte|montre)|regarde[- ](moi|[çc]a|ce que je)|(de )?quoi j'ai l'air|comment (tu )?me trouves|c'est quoi [çc]a\b|qu'est-ce que c'est que [çc]a|lis[- ](moi )?(ce|cette|l'[ée]tiquette)|devant toi|par ta cam[ée]ra/i;

// Questions de culture générale : réponse appuyée sur Wikipédia
const WIKI_WORDS = /qui (est|[ée]tait|a (invent[ée]|[ée]crit|d[ée]couvert|cr[ée][ée]|fond[ée]|peint|compos[ée]|gagn[ée]))|c'est quoi|qu'est-ce que c'est|qu'est-ce qu'(un|une)|que (signifie|veut dire)|quand (a eu lieu|est (n[ée]|mort|sorti)|a [ée]t[ée])|combien (mesure|p[èe]se|d'habitants)|o[ùu] se trouve|parle-moi d[eu]|explique-moi/i;

// « Mon anniversaire c'est le 12 mars », « je suis né le 3 juin »
const BIRTHDAY_WORDS = /(?:mon anniversaire (?:c'est|est|tombe)|je suis n[ée]e?)\s+le\s+(\d{1,2})(?:er)?\s+(janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[ûu]t|septembre|octobre|novembre|d[ée]cembre)/i;
const MONTHS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];

// « Qu'est-ce que tu sais sur moi ? »
// « Quoi de neuf ? » : Robbie raconte les notifications du téléphone
const NEWS_WORDS = /quoi de neuf|mes notifications|(j'ai|ai-je|il y a) (des|de nouveaux|des nouveaux) messages|qui m'a (écrit|envoyé|appelé)|des nouvelles\s*\?/i;

const MEMORY_WORDS = /(que|qu'est-ce que|quoi) tu (sais|connais|retiens) (sur|de) moi|tu te souviens de quoi/i;

// « J'habite à Lyon », « je vis au Mans », « ma ville c'est Nantes »...
const HOME_WORDS = /(?:j'habite|je vis|je suis bas[ée]e?|ma ville (?:c'est|est))\s+(?:(?:à|a|au|aux|en|sur|dans|vers)\s+)?([\p{L}'-]+(?:[ -][\p{L}'-]+){0,2})/iu;
const WEATHER_WORDS = /m[ée]t[ée]o|quel temps|temps qu'il|temp[ée]rature|pleuvoir|pluie|il pleut|neige|parapluie|fait (chaud|froid|beau)/i;


const EMOTIONS = [
    'happy', 'sad', 'angry', 'curious', 'shocked', 'neutral',
    'love', 'tired', 'suspicious', 'shy', 'dizzy',
    'proud', 'excited', 'scared', 'mocking', 'laughing'
];

// Un souvenir ne vient que d'une affirmation à la première personne
// (« Jugey Ming. », « t'es mal barré » ou une question ne disent rien sur l'utilisateur)
const FIRST_PERSON = /(^|[^a-zà-ÿ])((je|moi|mon|ma|mes|me)(?![a-zà-ÿ])|[jm]['’])/i;
const QUESTION = /\?\s*$|^(est-ce|qu'est-ce|comment|pourquoi|quand|où|quel|quelle|quels|quelles|combien|qui)(?![a-zà-ÿ])/i;

// Une action ne part que si la phrase demande vraiment quelque chose
// (« Non, j'ai dit du gaming » ne doit pas lancer de musique)
const ACTION_WORDS = /\b(mets?|remets?|lance|joue|ouvre|monte|baisse|coupe|r[ée]gle|passe|change|reviens|reprends|d[ée]marre|programme|rappelle|r[ée]veille|annule|oublie|arr[êe]te|stop|pause|suivante?|pr[ée]c[ée]dente?|volume|son|musique|chanson|minuteurs?|chrono|alarme|rappels?|pomodoro|concentration|[ée]couter|peux|pourrais|veux|voudrais|aimerais|besoin|fais)\b/i;

// Ordres simples compris sans l'IA : le petit modèle les confond
// (« arrête le minuteur » devenait « annule le rangement », « mode sommeil » une concentration)
const SLEEP_WORDS = /(fais|va faire) (un |ton |gros )?dodo|va (te coucher|dormir|au lit)|(mets|passe)[- ]toi en (mode )?(veille|sommeil)|endors[- ]toi|(?<!\p{L})(dors|repose[- ]toi)( un peu| maintenant)?\s*[.!]?$|bonne nuit/iu;
const TIMER_WORDS = /minuteurs?|chronos?|comptes? [àa] rebours|rappels?|alarmes?|sonnerie/i;
const CANCEL_WORDS = /(?<!\p{L})(arr[êe]t|annul|coup|stop|supprim|enl[èe]v|effac|vir|retir)/iu;
const CREATE_WORDS = /(?<!\p{L})(mets?|lance|programme|ajoute|cr[ée]e|rappelle)(?!\p{L})/iu;
const FOCUS_WORDS = /concentration|pomodoro/i;
const LIST_WORDS = /quels?|combien|liste|reste|en cours|montre/i;

function quickCommand(text) {
    if (SLEEP_WORDS.test(text)) return { type: 'sleep' };

    if (FOCUS_WORDS.test(text) && CANCEL_WORDS.test(text)) return { type: 'stop_focus' };

    if (TIMER_WORDS.test(text) && CANCEL_WORDS.test(text) && !CREATE_WORDS.test(text)) {
        // « Annule le minuteur des pâtes » → « pâtes » ; « arrête tous les minuteurs » → tout
        const all = /(?<!\p{L})(tous|toutes|tout)(?!\p{L})/iu.test(text);
        const label = text.match(/(?:minuteur|rappel|alarme|chrono)s?\s+(?:des?|du|de la|pour|d')\s*([^.!?]+)/i)?.[1].trim();
        return { type: 'cancel_timer', label: all ? 'tout' : label || '' };
    }

    if (TIMER_WORDS.test(text) && LIST_WORDS.test(text) && !CREATE_WORDS.test(text)) return { type: 'timers' };

    return null;
}

function canAct(text) {
    return ACTION_WORDS.test(text);
}

function canRemember(text) {
    return FIRST_PERSON.test(text) && !QUESTION.test(text.trim());
}


// Mots significatifs d'une phrase (sans accents ni ponctuation)
function words(text) {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 2);
}

// La phrase contient-elle une vraie demande en plus du nom du robot ?
function hasRequest(text) {
    const rest = text
        .replace(new RegExp(WAKE_WORD, 'gi'), '')
        .replace(new RegExp(STOP_WORDS, 'gi'), '')
        .replace(/(?<!\p{L})(h[ée]|eh|dis|ok|oh|allez|bon|alors|oui)(?!\p{L})/giu, '');

    return /\p{L}{2,}/u.test(rest);
}

module.exports = {
    NEWS_WORDS,
    WAKE_WORD,
    GM_START,
    GM_STOP,
    REPEAT_PHRASES,
    STOP_WORDS,
    TOUR_WORDS,
    TOUR_NEXT,
    TOUR_PREVIOUS,
    TOUR_STOP,
    VISION_WORDS,
    CAMERA_WORDS,
    WIKI_WORDS,
    BIRTHDAY_WORDS,
    MONTHS,
    MEMORY_WORDS,
    HOME_WORDS,
    WEATHER_WORDS,
    EMOTIONS,
    FIRST_PERSON,
    QUESTION,
    TIMER_WORDS,
    quickCommand,
    canAct,
    canRemember,
    words,
    hasRequest
};
