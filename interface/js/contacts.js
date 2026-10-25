// Tiroir Contacts de la barre latérale : trois onglets (Contacts, Messages, Appels), la fiche
// d'une personne, une conversation (SMS par le téléphone relié, ou Robbie OS) et le clavier.
// Les messages et les appels passent par le service du téléphone (window.os.phone).
// (maquette « Téléphone Robbie OS », proposition A)
(() => {
    const { escape, toast } = window.ui;
    const phone = async (method, ...args) => {
        const result = await window.os.phone(method, ...args);
        if (result?.erreurService) throw new Error(result.erreurService);
        return result;
    };
    // (une demande qui échoue : son explication s'affiche)
    const tryPhone = async (method, ...args) => {
        try {
            const result = await phone(method, ...args);
            if (result && result.ok === false && result.erreur) toast(result.erreur, 'x');
            return result;
        } catch (error) {
            toast(error.message, 'x');
            return null;
        }
    };

    // ---- Personnes : couleur, initiales, numéros ----
    const COLORS = ['#ff6fa8', '#ffb35c', '#5aa8ff', '#b57bff', '#5ee8a8', '#ff8a5c', '#5ee7ff', '#ffd25c', '#7f9dff', '#9fe0a0'];
    const colorOf = name => COLORS[[...String(name)].reduce((sum, c) => sum + c.charCodeAt(0), 0) % COLORS.length];
    const isNumber = text => /^[+\d\s.-]+$/.test(String(text));
    const initials = name => (isNumber(name) ? String(name).replace(/\D/g, '').slice(0, 2) : String(name).split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join(''));
    const avatar = (name, size = '') => `<span class="avatar ${size}" style="--c:${colorOf(name)}">${escape(initials(name) || '?')}</span>`;
    const normalize = text => String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const numberKey = number => String(number || '').replace(/\D/g, '').slice(-9);
    function formatNumber(number) {
        const digits = String(number || '').replace(/[^\d+]/g, '');
        if (/^(\+|00)33\d{9}$/.test(digits)) return `0${digits.slice(-9)}`.replace(/(\d{2})(?=\d)/g, '$1 ');
        if (/^0\d{9}$/.test(digits)) return digits.replace(/(\d{2})(?=\d)/g, '$1 ');
        return String(number || '');
    }
    const shownName = person => (person.contact || !isNumber(person.nom) ? person.nom : formatNumber(person.nom));
    const firstName = person => (person.contact || !isNumber(person.nom) ? String(person.nom).split(' ')[0] : formatNumber(person.nom));
    const typing = text => {
        const clean = String(text).replace(/[^\d+*#]/g, '');
        const match = clean.match(/^(\+\d{2})?(.*)$/);
        return (match[1] ? `${match[1]} ` : '') + match[2].replace(/(\d{2})(?=\d)/g, '$1 ');
    };

    // ---- Dates ----
    const DAY = 86400000;
    const startOfDay = date => new Date(new Date(date).setHours(0, 0, 0, 0)).getTime();
    const hour = date => new Date(date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const daysAgo = date => Math.round((startOfDay(Date.now()) - startOfDay(date)) / DAY);
    function shortDate(date) {
        const days = daysAgo(date);
        if (days <= 0) return hour(date);
        if (days === 1) return 'Hier';
        if (days < 7) return new Date(date).toLocaleDateString('fr-FR', { weekday: 'long' }).replace(/^./, c => c.toUpperCase());
        return new Date(date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    }
    function dayLabel(date) {
        const days = daysAgo(date);
        if (days <= 0) return 'Aujourd’hui';
        if (days === 1) return 'Hier';
        if (days < 7) return new Date(date).toLocaleDateString('fr-FR', { weekday: 'long' });
        return new Date(date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
    }
    const duration = s => (s < 60 ? `${Math.max(1, s)} s` : s < 3600 ? `${Math.round(s / 60)} min` : `${Math.floor(s / 3600)} h ${String(Math.round((s % 3600) / 60)).padStart(2, '0')}`);
    const size = bytes => (bytes < 1048576 ? `${Math.max(1, Math.round(bytes / 1024))} Ko` : `${(bytes / 1048576).toFixed(1).replace('.', ',')} Mo`);

    // ---- État ----
    let contacts = [];
    let conversations = [];
    let calls = [];
    let status = null;
    let tab = 'contacts';           // contacts | messages | appels
    let view = null;                 // null (l'onglet), 'fiche', 'modifier', 'fil', 'clavier', 'nouveau'
    let query = '';
    let shownContact = null;         // index de la fiche affichée
    let current = null;              // personne de la conversation ouverte
    let thread = [];
    let piece = null;                // fichier à joindre
    let callFilter = 'tous';
    let dialTarget = null;           // clavier : un Robbie OS choisi dans le journal
    const channelOf = new Map();

    const panel = window.panneaux.create('contacts', 'Contacts', {
        onOpen: () => {
            if (!openedFor) {
                view = null;
                query = '';
            }
            openedFor = null;
            render();
            refresh();
        },
        onClose: () => {
            if (view === 'fil') current = null;
            view = null;
            panel.el.classList.remove('large');
        }
    });
    let openedFor = null;            // ouvert pour une demande précise (notification, fiche…)
    panel.el.classList.add('tiroir', 'tiroir-contacts');
    panel.actions.innerHTML = '<button class="panneau-bouton" data-nouveau data-icon="plus" aria-label="Nouveau message" title="Nouveau message"></button>';
    window.icons.fill(panel.actions);
    panel.actions.querySelector('[data-nouveau]').addEventListener('click', () => {
        view = 'nouveau';
        query = '';
        render();
    });

    // ---- Les personnes : conversations et derniers appels réunis ----
    function people() {
        const byKey = new Map(conversations.map(c => [c.cle, { ...c, appel: null }]));
        for (const call of calls) {
            const key = call.personne.cle;
            let person = byKey.get(key);
            if (!person) {
                if (Date.now() - call.date > 14 * DAY) continue;
                byKey.set(key, (person = { ...call.personne, dernier: null, nonLus: 0, enLigne: false, appel: null }));
            }
            if (!person.appel || call.date > person.appel.date) person.appel = call;
        }
        return [...byKey.values()].map(p => ({ ...p, date: Math.max(p.dernier?.date || 0, p.appel?.date || 0) })).sort((a, b) => b.date - a.date);
    }
    const unread = () => conversations.reduce((sum, c) => sum + (c.nonLus || 0), 0);
    function callLabel(call) {
        if (call.sens === 'manque') return 'Appel manqué';
        if (call.sens === 'sortant' && !call.duree) return 'Appel sans réponse';
        return `${call.video ? 'Appel vidéo' : 'Appel'} · ${duration(call.duree)}`;
    }

    // ---- Rendu ----
    function render() {
        panel.el.classList.toggle('large', view === 'fil');
        panel.el.classList.toggle('sans-tete', view === 'fil');
        const body = panel.body;
        if (view === 'fiche' || view === 'modifier') body.innerHTML = cardHtml();
        else if (view === 'fil') body.innerHTML = threadHtml();
        else if (view === 'clavier') body.innerHTML = keypadHtml();
        else if (view === 'nouveau') body.innerHTML = newHtml();
        else body.innerHTML = tabsHtml() + (tab === 'contacts' ? contactsHtml() : tab === 'messages' ? messagesHtml() : callsHtml()) + (tab === 'contacts' ? '' : linksHtml());
        window.icons.fill(body);
        if (view === 'fil') {
            const box = body.querySelector('.fil-bulles');
            box.scrollTop = box.scrollHeight;
        }
        updateBadge();
        // (une conversation : le tiroir part du haut de la barre, pour avoir la place)
        if (view === 'fil') panel.el.style.top = '72px';
        else if (!panel.el.hidden) window.anchorDrawer(panel, 'contacts');
    }

    function tabsHtml() {
        const count = unread();
        return `<div class="tiroir-onglets" role="tablist">
            <button class="${tab === 'contacts' ? 'on' : ''}" data-onglet="contacts" role="tab">Contacts</button>
            <button class="${tab === 'messages' ? 'on' : ''}" data-onglet="messages" role="tab">Messages${count ? ` <span class="lat-compte">${count}</span>` : ''}</button>
            <button class="${tab === 'appels' ? 'on' : ''}" data-onglet="appels" role="tab">Appels</button>
        </div>`;
    }

    const searchHtml = placeholder => `<label class="contacts-recherche" data-icon="search"><input data-recherche value="${escape(query)}" placeholder="${placeholder}" autocomplete="off" spellcheck="false"></label>`;

    // Onglet Contacts : la grille
    function foundContacts() {
        return contacts.map((contact, index) => ({ contact, index }))
            .filter(({ contact }) => !query || normalize(`${contact.name} ${contact.phone || ''} ${contact.email || ''}`).includes(normalize(query)))
            .sort((a, b) => a.contact.name.localeCompare(b.contact.name, 'fr'));
    }
    function contactsHtml() {
        const found = foundContacts();
        const waiting = new Map(conversations.filter(c => c.nonLus && c.contact).map(c => [c.nom, c.nonLus]));
        return searchHtml('Chercher un contact') + (found.length ? `<div class="grille-contacts">${found.map(({ contact, index }) => `
                <button class="carte-contact" data-contact="${index}" title="${escape(contact.name)}">${avatar(contact.name)}<span>${escape(contact.name.split(' ')[0])}</span>${waiting.get(contact.name) ? `<i class="lat-compte carte-compte">${waiting.get(contact.name)}</i>` : ''}</button>`).join('')}
                <button class="carte-contact ajouter" data-ajouter><span class="avatar" data-icon="plus"></span><span>Ajouter</span></button></div>`
            : contacts.length ? `<p class="panneau-vide">Personne ne s’appelle « ${escape(query)} ».</p><button class="bouton large" data-ajouter>Ajouter « ${escape(query)} »</button>`
                : '<p class="panneau-vide">Ajoute tes proches : ils seront à portée de clic.</p><button class="bouton large" data-ajouter data-icon="plus">Ajouter un contact</button>');
    }

    // Onglet Messages
    function messagesHtml() {
        const list = people().filter(p => !query || normalize(`${p.nom} ${p.telephone} ${p.dernier?.texte || ''}`).includes(normalize(query)));
        return searchHtml('Chercher une personne ou un message') + `<div class="tiroir-liste">${list.length ? list.map(p => {
            const lastIsCall = p.appel && (!p.dernier || p.appel.date > p.dernier.date);
            const preview = lastIsCall ? callLabel(p.appel) : p.dernier.piece && !p.dernier.texte ? `Fichier : ${p.dernier.piece.nom}` : `${p.dernier.sens === 'envoye' ? 'Toi : ' : ''}${p.dernier.texte}`;
            const tag = lastIsCall ? '<span class="tel-tag sms">Appel</span>' : p.dernier.canal === 'robbie' ? '<span class="tel-tag robbie">Robbie OS</span>' : '<span class="tel-tag sms">SMS</span>';
            const missed = lastIsCall && p.appel.sens === 'manque';
            return `<button class="tel-conv${p.nonLus ? ' non-lu' : ''}" data-cle="${escape(p.cle)}">
                ${avatar(p.nom)}
                <span class="tel-conv-corps">
                    <span class="tel-conv-haut"><b>${escape(shownName(p))}</b><small>${shortDate(p.date)}</small></span>
                    <span class="tel-apercu${missed ? ' manque' : ''}">${escape(preview)}</span>
                    <span class="tel-conv-bas">${tag}${p.nonLus ? `<span class="lat-compte">${p.nonLus}</span>` : ''}</span>
                </span>
            </button>`;
        }).join('') : `<p class="panneau-vide">${query ? `Rien ne correspond à « ${escape(query)} »` : 'Pas encore de message. Le + en haut écrit à quelqu’un.'}</p>`}</div>`;
    }

    // Onglet Appels
    function callsHtml() {
        const missed = calls.filter(c => c.sens === 'manque' && Date.now() - c.date < 7 * DAY).length;
        const list = calls.filter(c => callFilter === 'tous' || c.sens === 'manque');
        let lastDay = null;
        return `<div class="tel-filtres">
                <button class="tel-filtre ${callFilter === 'tous' ? 'on' : ''}" data-filtre="tous">Tous</button>
                <button class="tel-filtre ${callFilter === 'manques' ? 'on' : ''}" data-filtre="manques">Manqués${missed ? ` · ${missed}` : ''}</button>
                <button class="tel-composer" data-composer data-icon="grid">Composer</button>
            </div>
            <div class="tiroir-liste">${list.length ? list.map(call => {
                const day = dayLabel(call.date);
                const title = day !== lastDay ? `<div class="tel-groupe">${escape(day.toUpperCase())}</div>` : '';
                lastDay = day;
                const kind = call.canal === 'robbie' ? (call.video ? 'Vidéo' : 'Vocal') : call.sens === 'sortant' ? 'Sortant' : 'Entrant';
                const label = call.sens === 'manque' ? 'Manqué' : call.sens === 'sortant' && !call.duree ? `${kind} · sans réponse` : `${kind} · ${duration(call.duree)}`;
                const arrow = call.sens === 'sortant' ? '<span class="sortant" data-icon="appel-sortant"></span>' : `<span class="${call.sens === 'manque' ? '' : 'entrant'}" data-icon="appel-entrant"></span>`;
                const tag = call.canal === 'robbie' ? '<span class="tel-tag robbie">Robbie OS</span>' : '<span class="tel-tag sms">Téléphone</span>';
                return `${title}<button class="tel-conv tel-appel${call.sens === 'manque' ? ' manque' : ''}" data-appel="${escape(call.id)}" title="Rappeler">
                    ${avatar(call.personne.nom)}
                    <span class="tel-conv-corps"><b>${escape(shownName(call.personne))}</b><span class="tel-appel-details">${arrow}${label} ${tag}</span></span>
                    <small>${hour(call.date)}</small>
                </button>`;
            }).join('') : `<p class="panneau-vide">${callFilter === 'tous' ? 'Pas encore d’appel.' : 'Aucun appel manqué.'}</p>`}</div>`;
    }

    // En bas des onglets Messages et Appels : le téléphone relié et Robbie OS
    function linksHtml() {
        const tel = status?.telephone;
        const phoneLine = tel?.connecte ? `<span class="tel-point relie"></span><span><b>${escape(tel.nom)}</b> relié${tel.batterie != null ? ` · ${tel.batterie} %` : ''}</span>`
            : `<button class="tel-lien" data-relier><span class="tel-point"></span>${tel?.relie ? `${escape(tel.nom || 'Téléphone')} pas joignable` : 'Relier un téléphone'}</button>`;
        const requests = status?.robbie?.demandes || 0;
        return `<footer class="tel-pied">${phoneLine}<button class="tel-lien robbie" data-robbie-os><span class="tel-point robbie"></span>${requests ? `${requests} demande${requests > 1 ? 's' : ''}` : 'Robbie OS en ligne'}</button></footer>`;
    }

    // Fiche d'un contact (et son formulaire)
    function cardHtml() {
        const contact = contacts[shownContact];
        if (!contact) return '';
        if (view === 'modifier') {
            return `<form class="fiche-contact" data-fiche-form>
                <button type="button" class="retour-contacts" data-retour data-icon="chevron-left">Contacts</button>
                ${avatar(contact.name || '?', 'grand')}
                <label>Nom<input name="name" value="${escape(contact.name)}" maxlength="40" required autocomplete="off"></label>
                <label>Téléphone<input name="phone" value="${escape(contact.phone || '')}" maxlength="30" inputmode="tel" autocomplete="off"></label>
                <label>E-mail<input name="email" value="${escape(contact.email || '')}" maxlength="80" type="email" autocomplete="off"></label>
                <label>Note<input name="note" value="${escape(contact.note || '')}" maxlength="120" autocomplete="off" placeholder="Anniversaire, adresse…"></label>
                <div class="fiche-ligne">${contact.name ? '<button type="button" class="bouton danger" data-supprimer data-icon="trash">Supprimer</button>' : ''}<button class="bouton principal">Enregistrer</button></div>
            </form>`;
        }
        const phoneNumber = contact.phone || '';
        return `<div class="fiche-contact">
            <button class="retour-contacts" data-retour data-icon="chevron-left">Contacts</button>
            ${avatar(contact.name, 'grand')}
            <b class="fiche-nom">${escape(contact.name)}</b>
            ${contact.note ? `<span class="fiche-note">${escape(contact.note)}</span>` : ''}
            <div class="fiche-actions">
                <button class="fiche-action" data-appeler ${phoneNumber || contact.robbie ? '' : 'disabled'}><span data-icon="phone"></span>Appeler</button>
                <button class="fiche-action" data-message ${phoneNumber || contact.robbie || contact.email ? '' : 'disabled'}><span data-icon="message"></span>Message</button>
            </div>
            <dl class="fiche-infos">
                <div><dt>Téléphone</dt><dd>${phoneNumber ? escape(formatNumber(phoneNumber)) : '<i>Pas encore de numéro</i>'}</dd></div>
                <div><dt>E-mail</dt><dd>${contact.email ? escape(contact.email) : '<i>Pas encore d’adresse</i>'}</dd></div>
                ${contact.robbie ? '<div><dt>Robbie OS</dt><dd>En contact</dd></div>' : ''}
            </dl>
            <button class="bouton large" data-modifier data-icon="edit">Modifier</button>
        </div>`;
    }

    // Une conversation
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
        const last = thread[thread.length - 1]?.canal;
        return available.includes(last) ? last : available[0] || null;
    }
    function metaOf(message) {
        const via = message.canal === 'robbie' ? 'par Robbie OS' : 'par SMS';
        if (message.sens === 'recu') return hour(message.date);
        if (message.etat === 'envoi') return `${via} · ${message.canal === 'robbie' ? 'En attente' : 'Envoi…'}`;
        if (message.etat === 'echec') return `${via} · ${escape(message.erreur || 'Pas envoyé')} · <button class="tel-reessayer" data-reessayer="${escape(message.id)}">Réessayer</button>`;
        if (message.etat === 'lu') return `${via} · Lu à ${hour(message.luA || message.date)}`;
        return `${via} · ${message.canal === 'robbie' ? 'Distribué' : 'Envoyé'} à ${hour(message.date)}`;
    }
    function threadHtml() {
        const person = current;
        const details = [];
        if (person.telephone) details.push(formatNumber(person.telephone));
        if (person.robbie) details.push(`Robbie OS ${person.enLigne ? 'en ligne' : 'hors ligne'}`);
        else if (person.telephone) details.push('par SMS');
        // Le fil : messages et appels mêlés, dans l'ordre
        const items = [...thread.map(m => ({ kind: 'message', date: m.date, m })), ...calls.filter(c => c.personne.cle === person.cle).map(c => ({ kind: 'appel', date: c.date, c }))].sort((a, b) => a.date - b.date);
        let html = '';
        let lastDay = null;
        items.forEach((item, i) => {
            const day = dayLabel(item.date);
            if (day !== lastDay) html += `<span class="fil-jour">${escape(day.toUpperCase())}</span>`;
            lastDay = day;
            if (item.kind === 'appel') {
                const c = item.c;
                html += `<span class="fil-appel${c.sens === 'manque' ? ' manque' : ''}"><span data-icon="${c.sens === 'sortant' ? 'appel-sortant' : 'appel-entrant'}"></span>${escape(callLabel(c))} · ${hour(c.date)}</span>`;
                return;
            }
            const m = item.m;
            const side = m.sens === 'envoye' ? 'moi' : 'lui';
            if (m.piece) html += `<button class="fil-piece ${side}" data-piece="${escape(m.piece.chemin)}"><span data-icon="file"></span><span>${escape(m.piece.nom)}<small>${size(m.piece.taille || 0)}</small></span></button>`;
            if (m.texte) html += `<div class="fil-bulle ${side}${m.etat === 'echec' ? ' echec' : ''}">${escape(m.texte)}</div>`;
            const next = items[i + 1]?.m;
            const endOfRun = !next || next.sens !== m.sens || next.canal !== m.canal || next.date - m.date > 10 * 60000 || m.etat === 'echec' || (side === 'moi' && next.etat !== m.etat);
            if (endOfRun) html += `<span class="fil-meta ${side}">${side === 'lui' && channels(person).length > 1 ? `${m.canal === 'robbie' ? 'par Robbie OS' : 'par SMS'} · ` : ''}${metaOf(m)}</span>`;
        });
        const channel = chosenChannel(person);
        return `<header class="fil-tete">
                <button class="fil-retour" data-retour-fil data-icon="chevron-left" aria-label="Retour aux messages"></button>
                ${avatar(person.nom)}
                <span class="fil-titre"><b>${escape(shownName(person))}</b><small>${escape(details.join(' · '))}</small></span>
                <button class="fil-rond" data-fil-appeler data-icon="phone" aria-label="Appeler" title="Appeler" ${channels(person).length ? '' : 'disabled'}></button>
                ${person.robbie ? '<button class="fil-rond" data-fil-video data-icon="video" aria-label="Appel vidéo" title="Appel vidéo"></button>' : ''}
            </header>
            <div class="fil-bulles">${html || '<p class="panneau-vide">Écris le premier message.</p>'}</div>
            <div class="fil-propositions" data-propositions hidden></div>
            ${piece ? `<div class="fil-piece-prete"><span data-icon="trombone"></span>${escape(piece.split('/').pop())}<button data-retirer-piece data-icon="x" aria-label="Retirer le fichier"></button></div>` : ''}
            <footer class="fil-saisie">
                <span class="fil-canal-zone">
                    <button class="fil-canal${channel === 'sms' ? ' sms' : ''}${channels(person).length < 2 ? ' seul' : ''}" data-canal>${channel === 'sms' ? 'SMS' : 'Robbie OS'}${channels(person).length > 1 ? '<span data-icon="chevron"></span>' : ''}</button>
                    <span class="fil-menu" data-menu-canal hidden></span>
                </span>
                <label class="fil-champ"><input data-texte placeholder="Écrire à ${escape(firstName(person))}…" autocomplete="off" ${channel ? '' : 'disabled'}>${channel === 'robbie' ? '<button data-joindre data-icon="trombone" aria-label="Joindre un fichier"></button>' : ''}</label>
                <button class="fil-envoyer" data-envoyer data-icon="envoyer" aria-label="Envoyer" ${channel ? '' : 'disabled'}></button>
            </footer>`;
    }

    // Nouveau message : à qui ?
    function newHtml() {
        const text = query.trim();
        const found = contacts.filter(c => (c.phone || c.robbie) && (!text || normalize(`${c.name} ${c.phone || ''}`).includes(normalize(text)))).slice(0, 30);
        const number = /^[+\d][\d\s.-]{5,}$/.test(text);
        return `<button class="retour-contacts" data-retour-onglet data-icon="chevron-left">Messages</button>
            <label class="contacts-recherche"><span class="tel-a">À :</span><input data-recherche value="${escape(query)}" placeholder="Nom ou numéro" autocomplete="off" spellcheck="false"></label>
            <div class="tiroir-liste">${number ? `<button class="tel-conv" data-numero="${escape(text)}">${avatar(text)}<span class="tel-conv-corps"><b>${escape(formatNumber(text))}</b><span class="tel-apercu">Envoyer un SMS à ce numéro</span></span></button>` : ''}
            ${found.map(c => `<button class="tel-conv" data-contact-nom="${escape(c.name)}">${avatar(c.name)}<span class="tel-conv-corps"><b>${escape(c.name)}</b><span class="tel-apercu">${escape([c.phone ? formatNumber(c.phone) : '', c.robbie ? 'Robbie OS' : ''].filter(Boolean).join(' · '))}</span></span></button>`).join('')}
            ${!number && !found.length ? '<p class="panneau-vide">Personne avec un numéro ou Robbie OS ne correspond.</p>' : ''}</div>`;
    }

    // Le clavier
    const KEYS = [['1', ''], ['2', 'ABC'], ['3', 'DEF'], ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'], ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'], ['*', ''], ['0', '+'], ['#', '']];
    let dialed = '';
    function whoIs(digits) {
        const typed = digits.replace(/\D/g, '');
        if (typed.length < 4) return null;
        const exact = typed.length >= 9 && contacts.find(c => c.phone && numberKey(c.phone) === numberKey(typed));
        if (exact) return { contact: exact, sure: true };
        const matches = contacts.filter(c => c.phone && c.phone.replace(/\D/g, '').startsWith(typed));
        return matches.length === 1 ? { contact: matches[0], sure: false } : null;
    }
    function keypadHtml() {
        const who = dialTarget ? null : whoIs(dialed);
        const tel = status?.telephone;
        return `<button class="retour-contacts" data-retour-onglet data-icon="chevron-left">Appels</button>
            <div class="clavier-numero"><input data-numero-saisi value="${escape(dialTarget ? dialTarget.nom : dialed)}" aria-label="Numéro à appeler" inputmode="tel" autocomplete="off"></div>
            <span class="clavier-qui">${dialTarget ? 'Appel vocal par Robbie OS' : who ? `${escape(who.contact.name)}${who.sure ? '' : ' ?'}` : '&#160;'}</span>
            <div class="clavier">${KEYS.map(([key, letters]) => `<button class="touche" data-touche="${key}">${key}<small>${letters || '&#160;'}</small></button>`).join('')}</div>
            <div class="clavier-actions"><span></span><button class="clavier-appeler" data-composer-appeler data-icon="phone" aria-label="Appeler"></button><button class="clavier-effacer" data-effacer data-icon="effacer" aria-label="Effacer"></button></div>
            <span class="clavier-via${tel?.connecte || dialTarget ? '' : ' hors'}"><span class="tel-point${tel?.connecte || dialTarget ? ' relie' : ''}"></span>${dialTarget ? 'Appel par <b>Robbie OS</b>' : tel?.connecte ? `Appel passé par <b>${escape(tel.nom)}</b>` : 'Aucun téléphone relié'}</span>`;
    }

    // ---- Pastille du bouton Contacts : les messages pas encore lus ----
    function updateBadge() {
        const badge = document.getElementById('contacts-nombre');
        const count = unread();
        badge.hidden = !count;
        badge.textContent = count;
    }

    // ---- Chargements ----
    async function refresh() {
        try {
            [contacts, conversations, calls, status] = await Promise.all([window.os.contacts(), phone('conversations'), phone('appels'), phone('etat')]);
        } catch {
            contacts = await window.os.contacts();
        }
        if (current) {
            const fresh = conversations.find(c => c.cle === current.cle);
            if (fresh) current = { ...current, ...fresh };
        }
        updateBadge();
        if (!panel.el.hidden) rerender();
    }
    let refreshTimer = null;
    const refreshSoon = () => {
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(refresh, 150);
    };
    // Redessiner sans perdre ce qu'on est en train d'écrire
    function rerender() {
        const input = panel.body.querySelector('[data-texte], [data-recherche], [data-numero-saisi]');
        const focused = document.activeElement === input;
        const value = input?.value;
        const at = input?.selectionStart;
        const menuOpen = panel.body.querySelector('[data-menu-canal]:not([hidden])');
        if (menuOpen) return;
        render();
        const again = panel.body.querySelector('[data-texte], [data-recherche], [data-numero-saisi]');
        if (again && value != null && again.dataset.texte !== undefined) again.value = value;
        if (again && focused) {
            again.focus();
            try {
                again.setSelectionRange(at, at);
            } catch {}
        }
        if (view === 'fil') showProposals();
    }

    async function saveContacts(list) {
        contacts = await window.os.setContacts(list);
    }

    // ---- Ouvrir une conversation ----
    async function openThread(person) {
        current = person;
        piece = null;
        thread = [];
        view = 'fil';
        try {
            thread = await phone('messages', person.cle);
        } catch {}
        render();
        markRead();
        proposeReplies();
        setTimeout(() => panel.body.querySelector('[data-texte]')?.focus(), 60);
    }
    async function openWith(canal, address) {
        try {
            const person = await phone('personne', canal, address);
            const known = conversations.find(c => c.cle === person.cle);
            await openThread(known || { ...person, enLigne: false });
        } catch (error) {
            toast(error.message, 'x');
        }
    }
    function markRead() {
        if (view !== 'fil' || !current || panel.el.hidden) return;
        if (thread.some(m => m.sens === 'recu' && !m.lu)) {
            thread.forEach(m => (m.lu = true));
            phone('lire', current.cle).catch(() => {});
        }
    }

    // Robbie propose deux réponses au dernier message reçu
    let proposals = { key: null, list: [] };
    async function proposeReplies() {
        const last = thread[thread.length - 1];
        if (!current || !last || last.sens !== 'recu' || !last.texte) {
            proposals = { key: null, list: [] };
            return;
        }
        const key = `${current.cle}|${last.id}`;
        if (proposals.key === key) return showProposals();
        proposals = { key, list: [] };
        let list = [];
        try {
            list = await phone('suggestions', current.cle);
        } catch {}
        if (proposals.key !== key) return;
        proposals.list = list || [];
        showProposals();
    }
    function showProposals() {
        const box = panel.body.querySelector('[data-propositions]');
        if (!box) return;
        const last = thread[thread.length - 1];
        const valid = proposals.list.length && current && last && proposals.key === `${current.cle}|${last.id}`;
        box.hidden = !valid;
        if (valid) box.innerHTML = `<span class="fil-robbie"><i></i>Robbie :</span>${proposals.list.map(r => `<button class="fil-proposition" data-proposition="${escape(r)}">${escape(r)}</button>`).join('')}`;
    }

    async function send() {
        const input = panel.body.querySelector('[data-texte]');
        const text = input?.value || '';
        const channel = chosenChannel(current);
        if (!text.trim() && !piece) return;
        // (le champ se vide tout de suite : le message reçu en retour redessine le fil)
        input.value = '';
        const sent = piece;
        piece = null;
        const result = await tryPhone('envoyer', { canal: channel, adresse: channel === 'robbie' ? current.robbie : current.telephone, texte: text, piece: sent });
        if (!result?.ok) {
            const again = panel.body.querySelector('[data-texte]');
            if (again && !again.value) again.value = text;
            piece = sent;
            return rerender();
        }
        channelOf.set(current.cle, channel);
        proposals = { key: null, list: [] };
        if (!conversations.some(c => c.cle === current.cle)) refreshSoon();
    }

    // ---- Appeler ----
    async function startCall(canal, address, video = false) {
        const result = await tryPhone('appeler', { canal, adresse: address, video });
        if (result?.ok) {
            window.panneaux.close();
            if (canal === 'telephone') toast('Appel lancé sur ton téléphone', 'phone');
        }
    }
    // Par le téléphone ou par Robbie OS : le téléphone s'il est relié et qu'on a le numéro
    function callPerson(person, video = false) {
        if (video && person.robbie) return startCall('robbie', person.robbie, true);
        const viaPhone = person.telephone && numberKey(person.telephone) && (status?.telephone?.connecte || !person.robbie);
        if (viaPhone) return startCall('telephone', person.telephone.replace(/[^\d+]/g, ''));
        if (person.robbie) return startCall('robbie', person.robbie);
    }

    // ---- Clics ----
    panel.body.addEventListener('click', async event => {
        const target = event.target.closest('button');
        if (!target) {
            if (!event.target.closest('[data-menu-canal]')) panel.body.querySelector('[data-menu-canal]')?.setAttribute('hidden', '');
            return;
        }
        const data = target.dataset;

        if (data.onglet) {
            tab = data.onglet;
            query = '';
            return render();
        }
        // Contacts
        if (data.contact !== undefined) {
            shownContact = Number(data.contact);
            view = 'fiche';
            return render();
        }
        if (target.hasAttribute('data-retour')) {
            if (contacts[shownContact] && !contacts[shownContact].name) await saveContacts(contacts.filter((_, i) => i !== shownContact));
            view = null;
            return render();
        }
        if (target.hasAttribute('data-ajouter')) {
            await saveContacts([...contacts, { name: query.trim() }]);
            shownContact = contacts.length - 1;
            view = 'modifier';
            query = '';
            return render();
        }
        if (target.hasAttribute('data-modifier')) {
            view = 'modifier';
            return render();
        }
        if (target.hasAttribute('data-supprimer')) {
            if (!target.classList.contains('confirmer')) {
                target.classList.add('confirmer');
                target.lastChild.textContent = 'Confirmer ?';
                return;
            }
            await saveContacts(contacts.filter((_, i) => i !== shownContact));
            view = null;
            return render();
        }
        const contact = contacts[shownContact];
        if (target.hasAttribute('data-appeler') && contact) {
            return callPerson({ telephone: contact.phone, robbie: contact.robbie });
        }
        if (target.hasAttribute('data-message') && contact) {
            if (contact.robbie || contact.phone) return openWith(contact.robbie ? 'robbie' : 'sms', contact.robbie || contact.phone);
            const result = await window.os.contactAction('message', contact);
            if (!result.ok) toast(result.erreur, 'x');
            return;
        }

        // Messages
        if (data.cle) {
            const person = people().find(p => p.cle === data.cle);
            if (person) openThread(person);
            return;
        }
        if (target.hasAttribute('data-retour-fil')) {
            view = null;
            current = null;
            tab = 'messages';
            return render();
        }
        if (target.hasAttribute('data-retour-onglet')) {
            view = null;
            query = '';
            return render();
        }
        if (data.numero) return openWith('sms', data.numero.replace(/[^\d+]/g, ''));
        if (data.contactNom) {
            const c = contacts.find(x => x.name === data.contactNom);
            if (c) openWith(c.robbie ? 'robbie' : 'sms', c.robbie || c.phone);
            return;
        }
        if (target.hasAttribute('data-fil-appeler')) return callPerson(current);
        if (target.hasAttribute('data-fil-video')) return callPerson(current, true);
        if (target.hasAttribute('data-canal')) {
            if (target.classList.contains('seul')) return;
            const menu = panel.body.querySelector('[data-menu-canal]');
            if (!menu.hidden) return menu.setAttribute('hidden', '');
            const tel = status?.telephone;
            const chosen = chosenChannel(current);
            menu.innerHTML = `<button data-choisir="robbie" class="${chosen === 'robbie' ? 'on' : ''}"><b>Robbie OS</b><small>${current.enLigne ? 'Directement, chiffré' : 'Hors ligne : partira dès son retour'}</small></button>
                <button data-choisir="sms" class="${chosen === 'sms' ? 'on' : ''}"><b>SMS</b><small>${tel?.connecte ? `Par ${escape(tel.nom)}` : 'Téléphone pas joignable'}</small></button>`;
            menu.hidden = false;
            return;
        }
        if (data.choisir) {
            channelOf.set(current.cle, data.choisir);
            if (data.choisir === 'sms') piece = null;
            render();
            return panel.body.querySelector('[data-texte]')?.focus();
        }
        if (target.hasAttribute('data-envoyer')) return send();
        if (target.hasAttribute('data-joindre')) {
            const file = await window.os.phoneFile();
            if (file) {
                piece = file;
                rerender();
            }
            return;
        }
        if (target.hasAttribute('data-retirer-piece')) {
            piece = null;
            return rerender();
        }
        if (data.proposition) {
            const input = panel.body.querySelector('[data-texte]');
            input.value = data.proposition;
            return input.focus();
        }
        if (data.piece) return window.os.openPhonePiece(data.piece);
        if (data.reessayer) {
            const message = thread.find(m => m.id === data.reessayer);
            if (!message) return;
            const result = await tryPhone('envoyer', { canal: message.canal, adresse: message.adresse, texte: message.texte, piece: message.piece?.chemin || null });
            if (result?.ok) await tryPhone('supprimerMessage', message.id);
            return;
        }

        // Appels
        if (data.filtre) {
            callFilter = data.filtre;
            return render();
        }
        if (target.hasAttribute('data-composer')) {
            view = 'clavier';
            dialTarget = null;
            dialed = '';
            render();
            return panel.body.querySelector('[data-numero-saisi]')?.focus();
        }
        if (data.appel) {
            const call = calls.find(c => c.id === data.appel);
            if (call) callPerson({ telephone: call.canal === 'telephone' ? call.adresse : call.personne.telephone, robbie: call.canal === 'robbie' ? call.adresse : call.personne.robbie });
            return;
        }
        if (data.touche) {
            if (dialTarget) {
                dialTarget = null;
                dialed = '';
            }
            dialed = typing(dialed + data.touche);
            return rerenderKeypad();
        }
        if (target.hasAttribute('data-effacer')) {
            dialTarget = null;
            dialed = typing(dialed.replace(/\s+$/, '').slice(0, -1));
            return rerenderKeypad();
        }
        if (target.hasAttribute('data-composer-appeler')) {
            if (dialTarget) return startCall('robbie', dialTarget.adresse);
            const number = dialed.replace(/[^\d+*#]/g, '');
            if (number) startCall('telephone', number);
            return;
        }

        // En bas : relier un téléphone, Robbie OS (Réglages › Téléphone)
        if (target.hasAttribute('data-relier') || target.hasAttribute('data-robbie-os')) {
            window.panneaux.close();
            setTimeout(() => window.reglages?.open('telephone'), 60);
        }
    });
    function rerenderKeypad() {
        render();
        const input = panel.body.querySelector('[data-numero-saisi]');
        input?.focus();
        input?.setSelectionRange(input.value.length, input.value.length);
    }

    panel.body.addEventListener('input', event => {
        if (event.target.matches('[data-recherche]')) {
            query = event.target.value;
            const at = event.target.selectionStart;
            render();
            const again = panel.body.querySelector('[data-recherche]');
            again.focus();
            again.setSelectionRange(at, at);
        }
        if (event.target.matches('[data-numero-saisi]')) {
            dialTarget = null;
            dialed = typing(event.target.value);
            rerenderKeypad();
        }
    });
    panel.body.addEventListener('keydown', event => {
        if (event.key !== 'Enter') return;
        if (event.target.matches('[data-texte]') && !event.shiftKey) {
            event.preventDefault();
            send();
        }
        if (event.target.matches('[data-numero-saisi]')) panel.body.querySelector('[data-composer-appeler]')?.click();
        if (event.target.matches('[data-recherche]')) {
            if (view === 'nouveau') return panel.body.querySelector('.tiroir-liste button')?.click();
            if (tab === 'contacts') {
                const first = foundContacts()[0];
                if (first) {
                    shownContact = first.index;
                    view = 'fiche';
                    render();
                }
            } else {
                panel.body.querySelector('.tiroir-liste button')?.click();
            }
        }
    });
    panel.body.addEventListener('submit', async event => {
        if (!event.target.matches('[data-fiche-form]')) return;
        event.preventDefault();
        const values = Object.fromEntries([...new FormData(event.target)].map(([k, v]) => [k, String(v).trim()]));
        if (!values.name) return;
        const list = [...contacts];
        // (ce que le formulaire ne montre pas reste : Robbie OS, origine du téléphone)
        list[shownContact] = { ...contacts[shownContact], ...values };
        await saveContacts(list);
        shownContact = contacts.findIndex(c => c.name === values.name);
        view = 'fiche';
        render();
    });

    // ---- Nouvelles du service du téléphone ----
    window.os.onPhone(async (event, data) => {
        if (event === 'etat') {
            status = data;
            if (!panel.el.hidden && (view === null || view === 'clavier')) rerender();
            return;
        }
        if (event === 'message') {
            if (view === 'fil' && current && data.personne.cle === current.cle && !thread.some(m => m.id === data.message.id)) {
                thread.push(data.message);
                rerender();
                markRead();
                if (data.message.sens === 'recu') proposeReplies();
            }
            return refreshSoon();
        }
        if (event === 'message-modifie') {
            const at = thread.findIndex(m => m.id === data.id);
            if (at >= 0) {
                thread[at] = data;
                rerender();
            }
            return refreshSoon();
        }
        if (event === 'conversations' && view === 'fil' && current) thread = await phone('messages', current.cle).catch(() => thread);
        if (['conversations', 'lus', 'appels', 'appel-fin', 'presence', 'contacts', 'pairs', 'connecte'].includes(event)) refreshSoon();
        // Une notification « Répondre », un lien sms: ou tel: : la bonne conversation s'ouvre ici
        if (event === 'ouvrir') {
            const value = String(data?.message || data?.appeler || '');
            if (data?.appeler) {
                return value.startsWith('robbie:') ? startCall('robbie', value.slice(7), Boolean(data.video)) : startCall('telephone', value);
            }
            openedFor = value || 'messages';
            tab = 'messages';
            if (window.panneaux.current() !== 'contacts') window.panneaux.open('contacts');
            if (value) await (value.startsWith('robbie:') ? openWith('robbie', value.slice(7)) : openWith('sms', value));
            else {
                view = null;
                render();
            }
        }
    });

    refresh();
})();
