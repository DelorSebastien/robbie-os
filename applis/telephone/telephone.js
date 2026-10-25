// Téléphone : la liste des conversations et des appels, le fil d'une conversation, le clavier.
// Tout passe par le service du téléphone (window.telephone.service).
(() => {
    const api = window.telephone;
    const $ = id => document.getElementById(id);
    const escape = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const normalize = text => String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const numberKey = number => String(number || '').replace(/[^\d]/g, '').slice(-9);

    // Couleur d'une personne : tirée de son nom (la même que dans la barre latérale)
    const COLORS = ['#ff6fa8', '#ffb35c', '#5aa8ff', '#b57bff', '#5ee8a8', '#ff8a5c', '#5ee7ff', '#ffd25c', '#7f9dff', '#9fe0a0'];
    const colorOf = name => COLORS[[...String(name)].reduce((sum, c) => sum + c.charCodeAt(0), 0) % COLORS.length];
    const initials = name => /^[+\d\s.-]+$/.test(name) ? String(name).replace(/[^\d]/g, '').slice(0, 2) : String(name).split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('');
    const avatar = (name, style = '') => `<span class="av" style="--c:${colorOf(name)};${style}">${escape(initials(name) || '?')}</span>`;
    const firstName = name => (/^[+\d\s.-]+$/.test(name) ? name : String(name).split(' ')[0]);

    // Numéros français lisibles : 06 12 34 56 78
    function formatNumber(number) {
        const text = String(number || '').trim();
        const digits = text.replace(/[^\d+]/g, '');
        if (/^0\d{9}$/.test(digits)) return digits.replace(/(\d{2})(?=\d)/g, '$1 ');
        // (+33 6 12… et 0033 6 12… s'écrivent comme on les dit : 06 12…)
        if (/^(\+|00)33\d{9}$/.test(digits)) return `0${digits.slice(-9)}`.replace(/(\d{2})(?=\d)/g, '$1 ');
        return text;
    }
    // Pendant la frappe : par paires
    const typing = digits => digits.replace(/[^\d+*#]/g, '').replace(/^(\+\d{2})?(\d*)$/, (all, prefix = '', rest) => (prefix ? `${prefix} ` : '') + rest.replace(/(\d{2})(?=\d)/g, '$1 ')) || digits;

    // ---- Dates ----
    const DAY = 86400000;
    const startOfDay = date => new Date(new Date(date).setHours(0, 0, 0, 0)).getTime();
    const hour = date => new Date(date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    function shortDate(date) {
        const days = Math.round((startOfDay(Date.now()) - startOfDay(date)) / DAY);
        if (days <= 0) return hour(date);
        if (days === 1) return 'Hier';
        if (days < 7) return capitalize(new Date(date).toLocaleDateString('fr-FR', { weekday: 'long' }));
        return new Date(date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    }
    function dayLabel(date) {
        const days = Math.round((startOfDay(Date.now()) - startOfDay(date)) / DAY);
        if (days <= 0) return 'Aujourd’hui';
        if (days === 1) return 'Hier';
        if (days < 7) return new Date(date).toLocaleDateString('fr-FR', { weekday: 'long' });
        return new Date(date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: new Date(date).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
    }
    const capitalize = text => text.charAt(0).toUpperCase() + text.slice(1);
    const duration = seconds => (seconds < 60 ? `${Math.max(1, seconds)} s` : seconds < 3600 ? `${Math.round(seconds / 60)} min` : `${Math.floor(seconds / 3600)} h ${String(Math.round((seconds % 3600) / 60)).padStart(2, '0')}`);
    const size = bytes => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} Ko` : `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`);

    // ---- Service ----
    async function svc(method, ...args) {
        const result = await api.service(method, ...args);
        if (result && result.erreurService) throw new Error(result.erreurService);
        return result;
    }
    let flashTimer = null;
    function flash(text, error = false) {
        const el = $('flash');
        el.textContent = text;
        el.classList.toggle('erreur', error);
        el.hidden = false;
        clearTimeout(flashTimer);
        flashTimer = setTimeout(() => (el.hidden = true), 4200);
    }
    const tryCall = async (method, ...args) => {
        try {
            const result = await svc(method, ...args);
            if (result && result.ok === false && result.erreur) flash(result.erreur, true);
            return result;
        } catch (error) {
            flash(error.message, true);
            return null;
        }
    };

    // ---- État ----
    let status = null;
    let conversations = [];
    let calls = [];
    let contacts = [];
    let favorites = [];
    let view = 'messages';
    let callFilter = 'tous';
    let query = '';
    let current = null;            // conversation ouverte : { cle, nom, telephone, robbie, enLigne }
    let thread = [];
    let composing = false;          // « Nouveau message » : on choisit d'abord à qui
    let piece = null;               // fichier à joindre
    const channelOf = new Map();    // canal choisi pour chaque conversation
    let target = null;              // clavier : { canal, adresse, nom }

    // ---- À gauche : les liaisons ----
    function renderLinks() {
        const phone = status?.telephone;
        const card = $('liaison-telephone');
        card.classList.toggle('relie', Boolean(phone?.connecte));
        $('telephone-nom').textContent = phone?.nom || 'Téléphone';
        $('telephone-etat').textContent = phone?.connecte ? `Relié${phone.batterie != null ? ` · ${phone.batterie} %` : ''}` : phone?.relie ? 'Pas joignable' : 'Pas relié';
        const requests = status?.robbie?.demandes || 0;
        $('demandes').hidden = !requests;
        $('demandes').textContent = requests;
        $('robbie-etat').textContent = requests ? `${requests} demande${requests > 1 ? 's' : ''}` : 'En ligne';
        // (sous le clavier : par quel téléphone l'appel passe)
        const via = $('appel-via');
        via.classList.toggle('hors', !phone?.connecte);
        via.querySelector('span').innerHTML = phone?.connecte ? `Appel passé par <b>${escape(phone.nom)}</b>` : target?.canal === 'robbie' ? 'Appel par <b>Robbie OS</b>' : 'Aucun téléphone relié : <b>relie-le</b> pour appeler un numéro';
        if (target?.canal === 'robbie') via.classList.remove('hors');
    }

    // ---- À gauche : conversations (et le dernier appel de chacun) ----
    function people() {
        const byKey = new Map(conversations.map(c => [c.cle, { ...c, appel: null }]));
        for (const call of calls) {
            const key = call.personne.cle;
            let person = byKey.get(key);
            if (!person) {
                // (on ne montre ici que les appels récents de quelqu'un sans conversation)
                if (Date.now() - call.date > 14 * DAY) continue;
                byKey.set(key, (person = { ...call.personne, dernier: null, nonLus: 0, enLigne: false, appel: null }));
            }
            if (!person.appel || call.date > person.appel.date) person.appel = call;
        }
        return [...byKey.values()].map(p => ({ ...p, date: Math.max(p.dernier?.date || 0, p.appel?.date || 0) })).sort((a, b) => b.date - a.date);
    }

    function callLabel(call) {
        if (call.sens === 'manque') return call.canal === 'robbie' ? 'Appel Robbie OS manqué' : 'Appel manqué';
        if (call.sens === 'sortant' && !call.duree) return 'Appel sans réponse';
        return `${call.video ? 'Vidéo' : 'Appel'} · ${duration(call.duree)}`;
    }

    function renderConversations() {
        const list = people().filter(p => !query || normalize(`${p.nom} ${p.telephone} ${p.dernier?.texte || ''}`).includes(normalize(query)));
        const nav = $('liste');
        if (!list.length) {
            nav.innerHTML = `<p class="liste-vide">${query ? `Rien ne correspond à « ${escape(query)} »` : 'Pas encore de conversation. Écris à quelqu’un avec « Nouveau message ».'}</p>`;
            return;
        }
        nav.innerHTML = list.map(p => {
            const lastIsCall = p.appel && (!p.dernier || p.appel.date > p.dernier.date);
            const preview = lastIsCall ? callLabel(p.appel) : p.dernier.piece && !p.dernier.texte ? `Fichier : ${p.dernier.piece.nom}` : `${p.dernier.sens === 'envoye' ? 'Toi : ' : ''}${p.dernier.texte}`;
            const tag = lastIsCall ? '<span class="canal-tag sms">Appel</span>' : p.dernier.canal === 'robbie' ? '<span class="canal-tag robbie">Robbie OS</span>' : '<span class="canal-tag sms">SMS</span>';
            return `<button class="conv${current?.cle === p.cle && !composing ? ' on' : ''}${p.nonLus ? ' non-lu' : ''}" data-cle="${escape(p.cle)}">
                ${avatar(p.nom)}
                <span class="conv-corps">
                    <span class="conv-haut"><b>${escape(p.contact ? p.nom : formatNumber(p.nom))}</b><small>${shortDate(p.date)}</small></span>
                    <span class="conv-apercu">${escape(preview)}</span>
                    <span class="conv-bas">${tag}${p.nonLus ? `<span class="non-lus">${p.nonLus}</span>` : ''}</span>
                </span>
            </button>`;
        }).join('');
    }

    // ---- À gauche : appels ----
    function renderCalls() {
        const missed = calls.filter(c => c.sens === 'manque' && Date.now() - c.date < 7 * DAY).length;
        $('filtre-manques').textContent = missed ? `Manqués · ${missed}` : 'Manqués';
        const list = calls.filter(c => callFilter === 'tous' || c.sens === 'manque');
        const nav = $('liste');
        if (!list.length) {
            nav.innerHTML = `<p class="liste-vide">${callFilter === 'tous' ? 'Pas encore d’appel.' : 'Aucun appel manqué.'}</p>`;
            return;
        }
        let lastDay = null;
        nav.innerHTML = list.map(call => {
            const day = dayLabel(call.date);
            const title = day !== lastDay ? `<div class="groupe">${escape(day.toUpperCase())}</div>` : '';
            lastDay = day;
            const name = call.personne.contact ? call.personne.nom : formatNumber(call.personne.nom);
            const kind = call.canal === 'robbie' ? (call.video ? 'Vidéo' : 'Vocal') : call.sens === 'sortant' ? 'Sortant' : 'Entrant';
            const arrow = call.sens === 'sortant' ? '<span class="sortant" data-icon="appel-sortant"></span>' : `<span class="${call.sens === 'manque' ? '' : 'entrant'}" data-icon="appel-entrant"></span>`;
            const label = call.sens === 'manque' ? 'Manqué' : call.sens === 'sortant' && !call.duree ? `${kind} · sans réponse` : `${kind} · ${duration(call.duree)}`;
            const tag = call.canal === 'robbie' ? '<span class="canal-tag robbie">Robbie OS</span>' : '<span class="canal-tag sms">Téléphone</span>';
            return `${title}<button class="ligne-appel${call.sens === 'manque' ? ' manque' : ''}" data-appel="${escape(call.id)}">
                ${avatar(call.personne.nom)}
                <span class="conv-corps"><b>${escape(name)}</b><span class="appel-details">${arrow}${label} ${tag}</span></span>
                <small>${hour(call.date)}</small>
            </button>`;
        }).join('');
        window.icons.fill(nav);
    }

    function renderList() {
        if (view === 'messages') renderConversations();
        else renderCalls();
    }

    // ---- Le fil d'une conversation ----
    function channels(person) {
        const list = [];
        if (person.robbie) list.push('robbie');
        if (person.telephone && numberKey(person.telephone)) list.push('sms');
        return list;
    }
    function chosenChannel(person) {
        const available = channels(person);
        const chosen = channelOf.get(person.cle);
        if (available.includes(chosen)) return chosen;
        // (par défaut : le canal du dernier message, sinon Robbie OS)
        const last = thread[thread.length - 1]?.canal;
        if (available.includes(last)) return last;
        return available[0] || null;
    }

    function renderHeader() {
        const person = current;
        $('tete-fil').hidden = !person || composing;
        if (!person || composing) return;
        $('fil-avatar').outerHTML = `<span class="av" id="fil-avatar" style="--c:${colorOf(person.nom)}">${escape(initials(person.nom) || '?')}</span>`;
        $('fil-nom').textContent = person.contact ? person.nom : formatNumber(person.nom);
        const parts = [];
        if (person.telephone) parts.push(formatNumber(person.telephone));
        if (person.robbie) parts.push(`sur Robbie OS (${person.enLigne ? 'en ligne' : 'hors ligne'})`);
        else if (person.telephone) parts.push('par SMS');
        $('fil-details').textContent = parts.join(' · ');
        $('fil-video').hidden = !person.robbie;
        $('fil-appeler').disabled = !person.robbie && !person.telephone;
    }

    function metaOf(message) {
        const via = message.canal === 'robbie' ? 'par Robbie OS' : 'par SMS';
        if (message.sens === 'recu') return `${hour(message.date)}`;
        if (message.etat === 'envoi') return `${via} · ${message.canal === 'robbie' ? 'En attente' : 'Envoi…'}`;
        if (message.etat === 'echec') return `${via} · ${message.erreur || 'Pas envoyé'} · <button class="reessayer" data-reessayer="${escape(message.id)}">Réessayer</button>`;
        if (message.etat === 'lu') return `${via} · Lu à ${hour(message.luA || message.date)}`;
        return `${via} · ${message.canal === 'robbie' ? 'Distribué' : 'Envoyé'} à ${hour(message.date)}`;
    }

    function pieceHtml(message, side) {
        const p = message.piece;
        if (!p) return '';
        const url = `file://${encodeURI(p.chemin)}`;
        if (/^image\//.test(p.type)) return `<img class="piece-image ${side}" src="${escape(url)}" alt="${escape(p.nom)}" data-piece="${escape(p.chemin)}">`;
        return `<button class="piece-fichier ${side}" data-piece="${escape(p.chemin)}"><span data-icon="file"></span><span>${escape(p.nom)}<small>${size(p.taille || 0)}</small></span></button>`;
    }

    function renderThread() {
        const box = $('bulles');
        $('fil-vide').hidden = Boolean(current || composing);
        $('saisie').hidden = !(current || composing);
        box.hidden = !current;
        if (!current) {
            box.innerHTML = '';
            renderHeader();
            renderComposer();
            return;
        }
        let html = '';
        let lastDay = null;
        thread.forEach((message, i) => {
            const day = dayLabel(message.date);
            if (day !== lastDay) html += `<div class="jour">${escape(day)}</div>`;
            lastDay = day;
            const side = message.sens === 'envoye' ? 'moi' : 'lui';
            html += pieceHtml(message, side);
            if (message.texte) html += `<div class="bulle ${side}${message.etat === 'echec' ? ' echec' : ''}">${escape(message.texte)}</div>`;
            // (l'heure et l'état sous le dernier message d'une suite du même côté, ou si quelque chose change)
            const next = thread[i + 1];
            const endOfRun = !next || next.sens !== message.sens || next.canal !== message.canal || dayLabel(next.date) !== day || next.date - message.date > 10 * 60000 || message.etat === 'echec' || (side === 'moi' && next.etat !== message.etat);
            if (endOfRun) html += `<span class="meta ${side}">${side === 'lui' && channels(current).length > 1 ? `${message.canal === 'robbie' ? 'par Robbie OS' : 'par SMS'} · ` : ''}${metaOf(message)}</span>`;
        });
        box.innerHTML = html;
        window.icons.fill(box);
        box.scrollTop = box.scrollHeight;
        renderHeader();
        renderComposer();
    }

    function renderComposer() {
        const person = composing ? null : current;
        const channel = person ? chosenChannel(person) : null;
        const button = $('canal');
        // (un seul canal possible : la pastille le montre, sans menu)
        button.classList.toggle('seul', !person || channels(person).length < 2);
        button.setAttribute('aria-disabled', String(!person || channels(person).length < 2));
        button.classList.toggle('sms', channel === 'sms');
        $('canal-nom').textContent = channel === 'sms' ? 'SMS' : 'Robbie OS';
        $('texte').placeholder = person ? `Écrire à ${firstName(person.contact ? person.nom : formatNumber(person.nom))}…` : 'Écrire…';
        $('texte').disabled = !person || !channel;
        $('joindre').disabled = channel !== 'robbie';
        $('envoyer').disabled = !person || !channel;
        const ready = $('piece-prete');
        ready.hidden = !piece;
        if (piece) {
            ready.innerHTML = `<span data-icon="trombone"></span>${escape(piece.split('/').pop())}<button data-retirer-piece data-icon="x" aria-label="Retirer le fichier"></button>`;
            window.icons.fill(ready);
        }
    }

    async function openConversation(person, { focus = true } = {}) {
        composing = false;
        $('nouveau-message').hidden = true;
        current = person;
        piece = null;
        thread = [];
        renderConversations();
        try {
            thread = await svc('messages', person.cle);
        } catch {}
        renderThread();
        markRead();
        proposeReplies();
        if (focus) $('texte').focus();
    }
    function markRead() {
        if (current && document.hasFocus() && thread.some(m => m.sens === 'recu' && !m.lu)) {
            thread.forEach(m => (m.lu = true));
            svc('lire', current.cle).catch(() => {});
        }
    }

    // Robbie propose deux réponses au dernier message reçu
    let proposalFor = null;
    async function proposeReplies() {
        const box = $('propositions');
        box.hidden = true;
        const last = thread[thread.length - 1];
        if (!current || !last || last.sens !== 'recu' || !last.texte) return;
        const key = (proposalFor = `${current.cle}|${last.id}`);
        let replies = [];
        try {
            replies = await svc('suggestions', current.cle);
        } catch {}
        if (proposalFor !== key || !replies?.length) return;
        box.innerHTML = `<span class="robbie-propose"><i></i>Robbie propose :</span>${replies.map(r => `<button class="btn proposition" data-proposition="${escape(r)}">${escape(r)}</button>`).join('')}`;
        box.hidden = false;
    }

    async function sendMessage() {
        if (!current) return;
        const text = $('texte').value;
        const channel = chosenChannel(current);
        if (!text.trim() && !piece) return;
        const address = channel === 'robbie' ? current.robbie : current.telephone;
        const result = await tryCall('envoyer', { canal: channel, adresse: address, texte: text, piece });
        if (!result?.ok) return;
        $('texte').value = '';
        piece = null;
        $('propositions').hidden = true;
        channelOf.set(current.cle, channel);
        // (une conversation neuve prend sa clé définitive avec ce premier message)
        if (!conversations.some(c => c.cle === current.cle)) refreshConversations();
    }

    // ---- Nouveau message : choisir à qui ----
    function renderRecipients() {
        const text = $('destinataire').value.trim();
        const found = contacts.filter(c => (c.phone || c.robbie) && (!text || normalize(`${c.name} ${c.phone || ''}`).includes(normalize(text)))).slice(0, 30);
        const isNumber = /^[+\d][\d\s.-]{5,}$/.test(text);
        $('destinataires').innerHTML = (isNumber ? `<button class="conv" data-numero="${escape(text)}">${avatar(text)}<span class="conv-corps"><b>${escape(formatNumber(text))}</b><span class="conv-apercu">Envoyer un SMS à ce numéro</span></span></button>` : '')
            + found.map(c => `<button class="conv" data-contact-nom="${escape(c.name)}">${avatar(c.name)}<span class="conv-corps"><b>${escape(c.name)}</b><span class="conv-apercu">${escape([c.phone ? formatNumber(c.phone) : '', c.robbie ? 'Robbie OS' : ''].filter(Boolean).join(' · '))}</span></span></button>`).join('');
    }
    function startComposing() {
        composing = true;
        current = null;
        thread = [];
        $('nouveau-message').hidden = false;
        $('destinataire').value = '';
        renderRecipients();
        renderConversations();
        renderThread();
        $('saisie').hidden = true;
        $('destinataire').focus();
    }
    async function openWith(canal, address) {
        try {
            const person = await svc('personne', canal, address);
            const known = conversations.find(c => c.cle === person.cle);
            openConversation(known || { ...person, enLigne: false });
        } catch (error) {
            flash(error.message, true);
        }
    }

    // ---- Appels : favoris, clavier ----
    function renderFavorites() {
        const list = favorites.map(name => contacts.find(c => c.name === name)).filter(Boolean);
        $('favoris').innerHTML = list.map(c => `<button class="fav" data-favori="${escape(c.name)}" title="Appeler ${escape(c.name)} (clic droit : retirer)">${avatar(c.name)}<span>${escape(firstName(c.name))}</span></button>`).join('')
            + '<div class="fav-zone"><button class="fav ajouter" id="ajouter-favori"><span class="av" data-icon="plus"></span><span>Favori</span></button><div class="menu bas" id="menu-favoris" hidden></div></div>';
        window.icons.fill($('favoris'));
    }

    function contactForNumber(digits) {
        if (digits.replace(/\D/g, '').length < 4) return null;
        const typed = digits.replace(/\D/g, '');
        const matches = contacts.filter(c => c.phone && c.phone.replace(/\D/g, '').startsWith(typed));
        const exact = contacts.find(c => c.phone && numberKey(c.phone) === numberKey(typed) && typed.length >= 9);
        return exact || (matches.length === 1 ? matches[0] : null);
    }
    function renderNumber() {
        const input = $('numero');
        const who = target?.canal === 'robbie' ? null : contactForNumber(input.value);
        $('numero-qui').textContent = target?.canal === 'robbie' ? 'Appel vocal par Robbie OS' : who ? `${who.name} ${numberKey(who.phone) === numberKey(input.value) && input.value.replace(/\D/g, '').length >= 9 ? '' : '?'}`.trim() : '';
        renderLinks();
    }
    function typeKey(key) {
        if (target?.canal === 'robbie') {
            target = null;
            $('numero').value = '';
        }
        $('numero').value = typing($('numero').value + key);
        renderNumber();
    }

    async function callTarget() {
        if (target?.canal === 'robbie') return startCall('robbie', target.adresse, false);
        const number = $('numero').value.replace(/[^\d+*#]/g, '');
        if (!number) return $('numero').focus();
        startCall('telephone', number, false);
    }
    async function startCall(canal, address, video) {
        const result = await tryCall('appeler', { canal, adresse: address, video });
        if (result?.ok && canal === 'telephone') flash('Appel lancé sur ton téléphone');
    }

    function callPerson(person, anchor) {
        const ways = [];
        if (person.telephone && numberKey(person.telephone)) ways.push({ canal: 'telephone', adresse: person.telephone, titre: 'Par ton téléphone', detail: formatNumber(person.telephone) });
        if (person.robbie) ways.push({ canal: 'robbie', adresse: person.robbie, titre: 'Par Robbie OS', detail: 'Appel vocal, directement d’ordinateur à ordinateur' });
        if (ways.length === 1) return startCall(ways[0].canal, ways[0].adresse, false);
        if (!ways.length) return;
        showMenu(anchor, ways.map(w => ({ html: `<span data-icon="${w.canal === 'robbie' ? 'ordinateur' : 'phone'}"></span><span>${escape(w.titre)}<small>${escape(w.detail)}</small></span>`, action: () => startCall(w.canal, w.adresse, false) })));
    }

    // Petit menu sous un bouton
    let openMenu = null;
    function showMenu(anchor, items) {
        closeMenu();
        const menu = document.createElement('div');
        menu.className = 'menu flottant';
        menu.setAttribute('role', 'menu');
        menu.innerHTML = items.map((item, i) => `<button data-item="${i}" class="${item.on ? 'on' : ''}">${item.html}</button>`).join('');
        document.body.append(menu);
        window.icons.fill(menu);
        const rect = anchor.getBoundingClientRect();
        menu.style.position = 'fixed';
        menu.style.top = `${rect.bottom + 6}px`;
        menu.style.bottom = 'auto';
        menu.style.left = `${Math.min(rect.left, window.innerWidth - menu.offsetWidth - 12)}px`;
        if (rect.bottom + 6 + menu.offsetHeight > window.innerHeight) menu.style.top = `${rect.top - menu.offsetHeight - 6}px`;
        menu.addEventListener('click', event => {
            const item = event.target.closest('[data-item]');
            if (!item) return;
            closeMenu();
            items[Number(item.dataset.item)].action();
        });
        openMenu = menu;
    }
    function closeMenu() {
        openMenu?.remove();
        openMenu = null;
        $('menu-canal').hidden = true;
        const fav = $('menu-favoris');
        if (fav) fav.hidden = true;
    }

    // ---- Fenêtres par-dessus ----
    function showBox(html, setup) {
        const veil = $('voile');
        veil.innerHTML = `<div class="boite" role="dialog" aria-modal="true">${html}</div>`;
        veil.hidden = false;
        window.icons.fill(veil);
        setup?.(veil.firstElementChild);
    }
    function closeBox() {
        $('voile').hidden = true;
        $('voile').innerHTML = '';
        if (pairingOpen) {
            pairingOpen = false;
            svc('annulerLiaison').catch(() => {});
        }
    }

    // Relier un téléphone : le code QR à scanner avec Robbie Lien
    let pairingOpen = false;
    async function showPhoneBox() {
        const phone = status?.telephone;
        let devices = [];
        try {
            devices = await svc('appareils');
        } catch {}
        if (devices.length && !showPhoneBox.newOne) {
            showBox(`<h2>TON TÉLÉPHONE</h2>
                ${devices.map(d => `<div class="personne-ligne">${avatar(d.nom)}<span><b>${escape(d.nom)}</b><small>${d.connecte ? `Relié${d.etat?.batterie != null ? ` · batterie ${d.etat.batterie} %${d.etat.charge ? ' (en charge)' : ''}` : ''}${d.etat?.reseau ? ` · ${escape(d.etat.reseau)}` : ''}` : 'Pas joignable : Wi-Fi coupé, ou Robbie Lien fermé'}</small></span><button class="btn danger" data-oublier="${escape(d.id)}">Oublier</button></div>`).join('')}
                <p>Le téléphone se relie tout seul dès qu’il est sur le même Wi-Fi que l’ordinateur.</p>
                <div class="lignes"><button class="btn" data-autre>Relier un autre téléphone</button><button class="btn principal" data-fermer>Fermer</button></div>`, box => {
                box.addEventListener('click', async event => {
                    if (event.target.closest('[data-fermer]')) closeBox();
                    if (event.target.closest('[data-autre]')) {
                        showPhoneBox.newOne = true;
                        showPhoneBox();
                    }
                    const forget = event.target.closest('[data-oublier]');
                    if (forget) {
                        if (!forget.classList.contains('confirmer')) {
                            forget.classList.add('confirmer');
                            forget.textContent = 'Confirmer ?';
                            return;
                        }
                        await tryCall('oublierAppareil', forget.dataset.oublier);
                        showPhoneBox();
                    }
                });
            });
            return;
        }
        showPhoneBox.newOne = false;
        let pairing;
        try {
            pairing = await svc('nouvelleLiaison');
        } catch (error) {
            return flash(error.message, true);
        }
        pairingOpen = true;
        const qr = await api.qr(pairing.url);
        const apk = pairing.apk ? await api.qr(pairing.apk) : null;
        showBox(`<h2>RELIER TON TÉLÉPHONE</h2>
            <p>Dans l’appli <b>Robbie Lien</b> de ton téléphone Android, touche « Relier un ordinateur » et scanne ce code. Le téléphone doit être sur le même Wi-Fi.</p>
            <div class="qr"><img src="${qr}" alt="Code QR de liaison"></div>
            <span class="code-liaison">${escape(pairing.code.replace(/(.{4})/, '$1 '))}</span>
            ${apk ? `<p>Pas encore Robbie Lien ? Scanne celui-ci avec l’appareil photo du téléphone pour l’installer.</p><div class="qr" style="width:150px;height:150px;padding:8px"><img src="${apk}" alt="Code QR pour installer Robbie Lien"></div>` : ''}
            <div class="lignes"><button class="btn principal" data-fermer>Fermer</button></div>`, box => {
            box.querySelector('[data-fermer]').addEventListener('click', closeBox);
        });
    }

    // Robbie OS : demandes, personnes à proximité, contacts
    async function showRobbieBox() {
        let nearby = [];
        let peers = [];
        try {
            [nearby, peers] = await Promise.all([svc('proches'), svc('pairs')]);
        } catch {}
        const requests = peers.filter(p => p.etat === 'demande-recue');
        const inContact = peers.filter(p => p.etat === 'contact');
        const others = nearby.filter(p => p.etat !== 'demande-recue');
        showBox(`<h2>ROBBIE OS</h2>
            <p>Tu apparais comme <b>${escape(status?.moi?.nom || '')}</b> sur <b>${escape(status?.moi?.machine || '')}</b>. Les messages et les appels vont directement d’ordinateur à ordinateur, chiffrés.</p>
            ${requests.length ? `<div class="groupe">DEMANDES</div>${requests.map(p => `<div class="personne-ligne">${avatar(p.nom)}<span><b>${escape(p.nom)}</b><small>veut être en contact · ${escape(p.machine || '')}</small></span><button class="btn" data-refuser="${p.id}">Refuser</button><button class="btn principal" data-accepter="${p.id}">Accepter</button></div>`).join('')}` : ''}
            <div class="groupe">À PROXIMITÉ</div>
            ${others.length ? others.map(p => `<div class="personne-ligne">${avatar(p.nom)}<span><b>${escape(p.nom)}</b><small>${escape(p.machine)}</small></span>${p.etat === 'demande-envoyee' ? '<small>Demande envoyée</small>' : `<button class="btn principal" data-ajouter="${p.id}">Ajouter</button>`}</div>`).join('') : '<p>Personne d’autre sur ce réseau pour le moment.</p>'}
            ${inContact.length ? `<div class="groupe">EN CONTACT</div>${inContact.map(p => `<div class="personne-ligne">${avatar(p.nom)}<span><b>${escape(p.nom)}</b><small>${p.enLigne ? 'En ligne' : 'Hors ligne'} · ${escape(p.machine || '')}</small></span></div>`).join('')}` : ''}
            <div class="lignes"><button class="btn principal" data-fermer>Fermer</button></div>`, box => {
            box.addEventListener('click', async event => {
                const button = event.target.closest('button');
                if (!button) return;
                if (button.hasAttribute('data-fermer')) return closeBox();
                if (button.dataset.ajouter) await tryCall('demanderContact', button.dataset.ajouter);
                if (button.dataset.accepter) await tryCall('repondreDemande', button.dataset.accepter, true);
                if (button.dataset.refuser) await tryCall('repondreDemande', button.dataset.refuser, false);
                showRobbieBox();
            });
        });
    }

    // Fiche de la personne de la conversation
    function showCard() {
        const person = current;
        if (!person) return;
        const contact = person.contact ? contacts.find(c => c.name === person.nom) : null;
        const isFavorite = favorites.includes(person.nom);
        showBox(`<div class="fiche" style="display:flex;flex-direction:column;gap:12px">
            ${avatar(person.nom)}
            <h2 style="font:600 18px Inter,sans-serif;letter-spacing:0">${escape(person.contact ? person.nom : formatNumber(person.nom))}</h2>
            ${contact?.note ? `<p>${escape(contact.note)}</p>` : ''}
            <dl>
                ${person.telephone ? `<div><dt>Téléphone</dt><dd>${escape(formatNumber(person.telephone))}</dd></div>` : ''}
                ${contact?.email ? `<div><dt>E-mail</dt><dd>${escape(contact.email)}</dd></div>` : ''}
                ${person.robbie ? `<div><dt>Robbie OS</dt><dd>${person.enLigne ? 'En ligne' : 'Hors ligne'}</dd></div>` : ''}
            </dl>
            <div class="lignes" style="justify-content:center;flex-wrap:wrap">
                ${person.contact ? `<button class="btn" data-favori-basculer>${isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}</button>` : `<button class="btn" data-ajouter-contact>Ajouter aux contacts</button>`}
                <button class="btn danger" data-effacer-fil>Effacer la conversation</button>
                <button class="btn principal" data-fermer>Fermer</button>
            </div>
        </div>`, box => {
            box.addEventListener('click', async event => {
                const button = event.target.closest('button');
                if (!button) return;
                if (button.hasAttribute('data-fermer')) return closeBox();
                if (button.hasAttribute('data-favori-basculer')) {
                    favorites = await svc('setFavoris', isFavorite ? favorites.filter(n => n !== person.nom) : [...favorites, person.nom]);
                    renderFavorites();
                    return showCard();
                }
                if (button.hasAttribute('data-ajouter-contact')) {
                    closeBox();
                    const name = await askName(person);
                    if (!name) return;
                    await api.addContact({ name, phone: person.telephone, robbie: person.robbie });
                    await refreshContacts();
                    await refreshConversations();
                    openWith(person.robbie ? 'robbie' : 'sms', person.robbie || person.telephone);
                }
                if (button.hasAttribute('data-effacer-fil')) {
                    if (!button.classList.contains('confirmer')) {
                        button.classList.add('confirmer');
                        button.textContent = 'Confirmer ?';
                        return;
                    }
                    await tryCall('supprimerConversation', person.cle);
                    closeBox();
                    current = null;
                    thread = [];
                    renderThread();
                }
            });
        });
    }
    function askName(person) {
        return new Promise(resolve => {
            showBox(`<h2>AJOUTER AUX CONTACTS</h2>
                <form style="display:flex;flex-direction:column;gap:12px"><label class="recherche"><input name="nom" placeholder="Nom" required autocomplete="off" value=""></label>
                <p>${escape(formatNumber(person.telephone || ''))}</p>
                <div class="lignes"><button type="button" class="btn" data-annuler>Annuler</button><button class="btn principal">Ajouter</button></div></form>`, box => {
                const form = box.querySelector('form');
                form.nom.focus();
                box.querySelector('[data-annuler]').addEventListener('click', () => {
                    closeBox();
                    resolve(null);
                });
                form.addEventListener('submit', event => {
                    event.preventDefault();
                    closeBox();
                    resolve(form.nom.value.trim() || null);
                });
            });
        });
    }

    // ---- Chargements ----
    // (les demandes de l'extérieur attendent que le service réponde)
    let markReady;
    const serviceReady = new Promise(resolve => (markReady = resolve));
    async function refreshStatus() {
        try {
            status = await svc('etat');
            markReady();
        } catch {
            status = null;
        }
        renderLinks();
    }
    async function refreshConversations() {
        try {
            [conversations, calls] = await Promise.all([svc('conversations'), svc('appels')]);
        } catch {}
        // (la conversation ouverte suit : en ligne, nom du contact)
        if (current) {
            const fresh = conversations.find(c => c.cle === current.cle);
            if (fresh) current = { ...current, ...fresh };
        }
        renderList();
        renderHeader();
    }
    async function refreshContacts() {
        contacts = await api.contacts();
        try {
            favorites = await svc('favoris');
        } catch {}
        renderFavorites();
    }
    let refreshTimer = null;
    const refreshSoon = () => {
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(refreshConversations, 150);
    };

    // ---- Nouvelles du service ----
    api.onService(async (event, data) => {
        if (event === 'connecte') return Promise.all([refreshStatus(), refreshConversations(), refreshContacts()]);
        if (event === 'etat') {
            status = data;
            return renderLinks();
        }
        if (event === 'message') {
            if (current && data.personne.cle === current.cle && !thread.some(m => m.id === data.message.id)) {
                thread.push(data.message);
                renderThread();
                markRead();
                if (data.message.sens === 'recu') proposeReplies();
            }
            return refreshSoon();
        }
        if (event === 'message-modifie') {
            const at = thread.findIndex(m => m.id === data.id);
            if (at >= 0) {
                thread[at] = data;
                renderThread();
            }
            return refreshSoon();
        }
        if (['conversations', 'lus', 'appels', 'appel-fin', 'presence', 'pairs'].includes(event)) {
            if (event === 'conversations' && current) thread = await svc('messages', current.cle).catch(() => thread);
            if (event === 'conversations') renderThread();
            return refreshSoon();
        }
        if (event === 'contacts') {
            await refreshContacts();
            return refreshSoon();
        }
        if (event === 'telephone-relie') {
            if (pairingOpen) {
                pairingOpen = false;
                closeBox();
            }
            flash(`${data.nom} est relié à l’ordinateur`);
            return refreshStatus();
        }
        if (event === 'demande') flash(`${data.nom} veut être en contact sur Robbie OS`);
    });

    // Demandes de l'extérieur : appeler un numéro, écrire à quelqu'un (barre latérale, liens tel:)
    api.onRequest(async request => {
        await serviceReady;
        if (request.appeler) {
            const value = String(request.appeler);
            if (value.startsWith('robbie:')) return startCall('robbie', value.slice(7), Boolean(request.video));
            setView('appels');
            target = null;
            $('numero').value = typing(value);
            renderNumber();
            return startCall('telephone', value, false);
        }
        if (request.message) {
            const value = String(request.message);
            setView('messages');
            return value.startsWith('robbie:') ? openWith('robbie', value.slice(7)) : openWith('sms', value);
        }
    });

    // ---- Vues ----
    function setView(name) {
        view = name;
        document.querySelectorAll('.onglet').forEach(tab => {
            tab.classList.toggle('on', tab.dataset.vue === name);
            tab.setAttribute('aria-selected', tab.dataset.vue === name);
        });
        document.querySelectorAll('[data-messages]').forEach(el => (el.hidden = name !== 'messages'));
        document.querySelectorAll('[data-appels]').forEach(el => (el.hidden = name !== 'appels'));
        $('vue-messages').hidden = name !== 'messages';
        $('vue-appels').hidden = name !== 'appels';
        $('liste').setAttribute('aria-label', name === 'messages' ? 'Conversations' : 'Journal des appels');
        renderList();
        if (name === 'appels') $('numero').focus();
    }

    // ---- Événements de la page ----
    document.querySelectorAll('.onglet').forEach(tab => tab.addEventListener('click', () => setView(tab.dataset.vue)));
    $('recherche').addEventListener('input', event => {
        query = event.target.value;
        renderConversations();
    });
    document.querySelectorAll('.filtre').forEach(button => button.addEventListener('click', () => {
        callFilter = button.dataset.filtre;
        document.querySelectorAll('.filtre').forEach(b => b.classList.toggle('on', b === button));
        renderCalls();
    }));
    $('liste').addEventListener('click', event => {
        const conv = event.target.closest('[data-cle]');
        if (conv) {
            const person = people().find(p => p.cle === conv.dataset.cle);
            if (person) openConversation(person);
            return;
        }
        const line = event.target.closest('[data-appel]');
        if (line) {
            // (un appel du journal : la personne se met dans le clavier, prête à rappeler)
            const call = calls.find(c => c.id === line.dataset.appel);
            if (!call) return;
            if (call.canal === 'robbie') {
                target = { canal: 'robbie', adresse: call.adresse, nom: call.personne.nom };
                $('numero').value = call.personne.nom;
            } else {
                target = null;
                $('numero').value = typing(call.adresse);
            }
            renderNumber();
        }
    });
    $('liaison-telephone').addEventListener('click', () => showPhoneBox());
    $('liaison-robbie').addEventListener('click', () => showRobbieBox());
    $('nouveau').addEventListener('click', startComposing);
    $('destinataire').addEventListener('input', renderRecipients);
    $('destinataire').addEventListener('keydown', event => {
        if (event.key === 'Enter') $('destinataires').querySelector('button')?.click();
    });
    $('destinataires').addEventListener('click', event => {
        const number = event.target.closest('[data-numero]')?.dataset.numero;
        if (number) return openWith('sms', number.replace(/[^\d+]/g, ''));
        const name = event.target.closest('[data-contact-nom]')?.dataset.contactNom;
        const contact = contacts.find(c => c.name === name);
        if (contact) openWith(contact.robbie ? 'robbie' : 'sms', contact.robbie || contact.phone);
    });

    $('fil-appeler').addEventListener('click', event => current && callPerson(current, event.currentTarget));
    $('fil-video').addEventListener('click', () => current?.robbie && startCall('robbie', current.robbie, true));
    $('fil-fiche').addEventListener('click', showCard);

    $('canal').addEventListener('click', event => {
        event.stopPropagation();
        const menu = $('menu-canal');
        if (!menu.hidden) return closeMenu();
        if ($('canal').classList.contains('seul')) return;
        const person = current;
        if (!person) return;
        const phoneName = status?.telephone?.nom;
        const items = [];
        if (person.robbie) items.push(`<button data-canal="robbie" class="${chosenChannel(person) === 'robbie' ? 'on' : ''}"><span data-icon="ordinateur"></span><span>Robbie OS<small>${person.enLigne ? 'Directement, chiffré' : 'Hors ligne : partira dès son retour'}</small></span></button>`);
        if (person.telephone) items.push(`<button data-canal="sms" class="${chosenChannel(person) === 'sms' ? 'on' : ''}"><span data-icon="message"></span><span>SMS<small>${status?.telephone?.connecte ? `Par ${escape(phoneName)}` : 'Téléphone pas joignable'}</small></span></button>`);
        menu.innerHTML = items.join('');
        window.icons.fill(menu);
        menu.hidden = false;
    });
    $('menu-canal').addEventListener('click', event => {
        const choice = event.target.closest('[data-canal]')?.dataset.canal;
        if (!choice || !current) return;
        channelOf.set(current.cle, choice);
        if (choice === 'sms') piece = null;
        closeMenu();
        renderComposer();
        $('texte').focus();
    });
    $('texte').addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendMessage();
        }
    });
    $('envoyer').addEventListener('click', sendMessage);
    $('joindre').addEventListener('click', async () => {
        const file = await api.chooseFile();
        if (file) {
            piece = file;
            renderComposer();
        }
    });
    $('piece-prete').addEventListener('click', event => {
        if (event.target.closest('[data-retirer-piece]')) {
            piece = null;
            renderComposer();
        }
    });
    $('propositions').addEventListener('click', event => {
        const text = event.target.closest('[data-proposition]')?.dataset.proposition;
        if (!text) return;
        $('texte').value = text;
        $('texte').focus();
    });
    $('bulles').addEventListener('click', async event => {
        const file = event.target.closest('[data-piece]')?.dataset.piece;
        if (file) return api.openPiece(file);
        const retry = event.target.closest('[data-reessayer]')?.dataset.reessayer;
        if (retry) {
            const message = thread.find(m => m.id === retry);
            if (!message) return;
            const result = await tryCall('envoyer', { canal: message.canal, adresse: message.adresse, texte: message.texte, piece: message.piece?.chemin || null });
            if (result?.ok) await tryCall('supprimerMessage', message.id);
        }
    });

    // Clavier
    const KEYS = [['1', ''], ['2', 'ABC'], ['3', 'DEF'], ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'], ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'], ['*', ''], ['0', '+'], ['#', '']];
    $('clavier').innerHTML = KEYS.map(([key, letters]) => `<button class="touche" data-touche="${key}">${key}<small>${letters || '&#160;'}</small></button>`).join('');
    $('clavier').addEventListener('click', event => {
        const key = event.target.closest('[data-touche]')?.dataset.touche;
        if (key) typeKey(key);
    });
    // (appui long sur 0 : le +)
    let zeroTimer = null;
    $('clavier').addEventListener('pointerdown', event => {
        if (event.target.closest('[data-touche]')?.dataset.touche !== '0') return;
        zeroTimer = setTimeout(() => {
            zeroTimer = 'plus';
            $('numero').value = typing($('numero').value + '+');
            renderNumber();
        }, 600);
    });
    $('clavier').addEventListener('click', event => {
        if (zeroTimer === 'plus' && event.target.closest('[data-touche="0"]')) {
            // (le + vient d'être mis : pas de 0 en plus)
            $('numero').value = typing($('numero').value.replace(/0$/, ''));
            renderNumber();
        }
        clearTimeout(zeroTimer);
        zeroTimer = null;
    }, true);
    $('numero').addEventListener('input', () => {
        if (target?.canal === 'robbie') target = null;
        const input = $('numero');
        input.value = typing(input.value);
        renderNumber();
    });
    $('numero').addEventListener('keydown', event => {
        if (event.key === 'Enter') callTarget();
    });
    $('appeler').addEventListener('click', callTarget);
    $('effacer').addEventListener('click', () => {
        if (target?.canal === 'robbie') {
            target = null;
            $('numero').value = '';
        } else {
            $('numero').value = typing($('numero').value.replace(/\s+$/, '').slice(0, -1));
        }
        renderNumber();
    });
    $('effacer').addEventListener('contextmenu', () => {
        target = null;
        $('numero').value = '';
        renderNumber();
    });
    $('appel-via').addEventListener('click', () => !status?.telephone?.connecte && showPhoneBox());

    $('favoris').addEventListener('click', event => {
        const fav = event.target.closest('[data-favori]');
        if (fav) {
            const contact = contacts.find(c => c.name === fav.dataset.favori);
            if (contact) callPerson({ telephone: contact.phone, robbie: contact.robbie }, fav);
            return;
        }
        if (event.target.closest('#ajouter-favori')) {
            event.stopPropagation();
            const menu = $('menu-favoris');
            const choices = contacts.filter(c => (c.phone || c.robbie) && !favorites.includes(c.name)).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
            menu.innerHTML = choices.length ? choices.map(c => `<button data-nouveau-favori="${escape(c.name)}">${avatar(c.name, 'width:28px;height:28px;font-size:11px')}<span>${escape(c.name)}</span></button>`).join('') : '<button disabled>Tous tes contacts sont déjà là</button>';
            menu.style.maxHeight = '300px';
            menu.style.overflowY = 'auto';
            menu.hidden = !menu.hidden;
            return;
        }
        const add = event.target.closest('[data-nouveau-favori]')?.dataset.nouveauFavori;
        if (add) {
            svc('setFavoris', [...favorites, add]).then(list => {
                favorites = list;
                renderFavorites();
            });
        }
    });
    $('favoris').addEventListener('contextmenu', event => {
        const fav = event.target.closest('[data-favori]');
        if (!fav) return;
        event.preventDefault();
        showMenu(fav, [{ html: '<span data-icon="x"></span><span>Retirer des favoris</span>', action: () => svc('setFavoris', favorites.filter(n => n !== fav.dataset.favori)).then(list => { favorites = list; renderFavorites(); }) }]);
    });

    document.addEventListener('click', event => {
        if (!event.target.closest('.menu, #canal, #ajouter-favori')) closeMenu();
    });
    $('voile').addEventListener('click', event => {
        if (event.target === $('voile')) closeBox();
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            if (!$('voile').hidden) closeBox();
            else closeMenu();
        }
        // (au clavier, dans la vue Appels : les chiffres vont dans le numéro)
        if (view === 'appels' && document.activeElement !== $('numero') && /^[\d*#+]$/.test(event.key) && $('voile').hidden) {
            typeKey(event.key);
            event.preventDefault();
        }
    });
    window.addEventListener('focus', markRead);

    // ---- Thème ----
    const applyTheme = theme => document.documentElement.classList.toggle('clair', theme?.theme === 'clair');
    api.theme().then(applyTheme);
    api.onTheme(applyTheme);

    window.icons.fill();
    setView('messages');
    renderThread();
    renderNumber();
    Promise.all([refreshStatus(), refreshConversations(), refreshContacts()]);
})();
