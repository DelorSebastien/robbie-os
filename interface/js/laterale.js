// Barre latérale : notifications, contacts, notes, agenda, capture d'écran, réglages, applis
(() => {
    const { escape, toast } = window.ui;

    // ---- Boutons ----
    const ACTIONS = {
        notifications: () => window.panneaux.toggle('notifications'),
        contacts: () => window.panneaux.toggle('contacts'),
        outils: () => window.panneaux.toggle('outils'),
        notes: () => window.panneaux.toggle('notes'),
        agenda: () => window.panneaux.toggle('agenda'),
        reglages: () => window.reglages ? window.reglages.open() : toast('Les réglages arrivent bientôt', 'gear'),
        lanceur: () => window.launcher.toggle(),
        alimentation: () => window.panneaux.toggle('alimentation'),
        aujourdhui: () => window.panneaux.toggle('aujourdhui'),
        'presse-papiers': () => window.panneaux.toggle('presse-papiers'),
        capture: async () => {
            window.panneaux.close();
            const result = await window.os.screenshot();
            setTimeout(() => toast(result?.done ? 'Capture enregistrée dans Images' : 'Capture impossible', result?.done ? 'check' : 'x'), 1200);
        }
    };

    document.querySelectorAll('.laterale [data-action]').forEach(button => {
        button.addEventListener('click', () => ACTIONS[button.dataset.action]?.());
    });

    // Bouton actif : celui dont le panneau est ouvert
    const mark = id => document.querySelectorAll('.laterale [data-action]').forEach(button => {
        button.classList.toggle('actif', button.dataset.action === id);
    });
    document.addEventListener('panneau-ouvert', event => mark(event.detail));
    document.addEventListener('panneau-ferme', () => mark(null));

    // ---- Alimentation : verrouiller, se déconnecter, veille, redémarrer, éteindre ----
    // (ce qui ferme la session ou l'ordinateur demande un deuxième clic pour confirmer)
    const POWER = [
        { id: 'lock', label: 'Verrouiller', icon: 'lock', run: () => window.os.lock() },
        { id: 'logout', label: 'Se déconnecter', icon: 'logout', confirm: true, run: () => window.os.logout() },
        { id: 'suspend', label: 'Veille', icon: 'moon', run: () => window.os.power('suspend') },
        { id: 'reboot', label: 'Redémarrer', icon: 'restart', confirm: true, run: () => window.os.power('reboot') },
        { id: 'poweroff', label: 'Éteindre', icon: 'power', confirm: true, danger: true, run: () => window.os.power('poweroff') }
    ];
    const powerPanel = window.panneaux.create('alimentation', 'Alimentation', { place: 'alim', onOpen: renderPower });

    function renderPower() {
        powerPanel.body.innerHTML = `<div class="alim-grille">${POWER.map(item => `
            <button class="alim-bouton${item.danger ? ' danger' : ''}" data-alim="${item.id}">
                <span class="alim-icone" data-icon="${item.icon}"></span><span class="alim-texte">${item.label}</span>
            </button>`).join('')}</div>`;
        window.icons.fill(powerPanel.body);

        powerPanel.body.querySelectorAll('[data-alim]').forEach(button => button.addEventListener('click', () => {
            const item = POWER.find(entry => entry.id === button.dataset.alim);
            if (item.confirm && !button.classList.contains('confirmer')) {
                button.classList.add('confirmer');
                button.querySelector('.alim-texte').textContent = 'Confirmer ?';
                setTimeout(() => {
                    button.classList.remove('confirmer');
                    button.querySelector('.alim-texte').textContent = item.label;
                }, 4000);
                return;
            }
            window.panneaux.close();
            item.run();
        }));
    }

    // Un tiroir s'ouvre à la hauteur du bouton qui l'a ouvert (sans dépasser le bas de l'écran)
    function anchorDrawer(panel, action) {
        const button = document.querySelector(`.laterale [data-action="${action}"]`);
        if (!button) return;
        const top = button.getBoundingClientRect().top - 12;
        requestAnimationFrame(() => {
            const height = panel.el.offsetHeight;
            panel.el.style.top = `${Math.max(10, Math.min(top, window.innerHeight - height - 90))}px`;
        });
    }

    // ---- Outils : un tiroir avec aujourd'hui, notes, agenda, capture, presse-papiers ----
    const TOOLS = [
        { action: 'aujourdhui', label: 'Aujourd’hui', icon: 'sun', hint: 'Météo, rendez-vous, musique' },
        { action: 'notes', label: 'Notes', icon: 'file', hint: 'Ta liste de choses à faire' },
        { action: 'agenda', label: 'Agenda', icon: 'calendar', hint: 'Le mois et tes rendez-vous' },
        { action: 'capture', label: 'Capture d’écran', icon: 'capture', hint: 'Rangée dans Images' },
        { action: 'presse-papiers', label: 'Presse-papiers', icon: 'clipboard', hint: 'Super+V' }
    ];
    const toolsPanel = window.panneaux.create('outils', 'Outils', {
        onOpen: () => {
            toolsPanel.body.innerHTML = `<div class="tiroir-outils">${TOOLS.map(tool => `
                <button class="outil" data-outil="${tool.action}">
                    <span class="outil-icone" data-icon="${tool.icon}"></span>
                    <span class="outil-texte"><b>${tool.label}</b><small>${tool.hint}</small></span>
                </button>`).join('')}</div>`;
            window.icons.fill(toolsPanel.body);
            anchorDrawer(toolsPanel, 'outils');
        }
    });
    toolsPanel.el.classList.add('tiroir');
    toolsPanel.body.addEventListener('click', event => {
        const action = event.target.closest('[data-outil]')?.dataset.outil;
        if (!action) return;
        window.panneaux.close();
        // (le panneau de l'outil s'ouvre après la fermeture du tiroir)
        setTimeout(() => ACTIONS[action]?.(), action === 'capture' ? 0 : 60);
    });

    // ---- Contacts : un tiroir avec recherche, grille et fiche de chaque personne ----
    let contacts = [];
    let shownContact = null;        // index de la fiche affichée (null : la grille)
    let editing = false;
    let query = '';
    const contactsPanel = window.panneaux.create('contacts', 'Contacts', {
        onOpen: () => {
            shownContact = null;
            editing = false;
            query = '';
            renderContacts();
            anchorDrawer(contactsPanel, 'contacts');
            setTimeout(() => contactsPanel.body.querySelector('[data-recherche]')?.focus(), 80);
        }
    });
    contactsPanel.el.classList.add('tiroir', 'tiroir-contacts');

    // Couleur d'un contact : tirée de son nom (toujours la même)
    const COLORS = ['#ff6fa8', '#ffb35c', '#5aa8ff', '#b57bff', '#5ee8a8', '#ff8a5c', '#5ee7ff', '#ffd25c', '#7f9dff', '#9fe0a0'];
    const colorOf = name => COLORS[[...name].reduce((sum, c) => sum + c.charCodeAt(0), 0) % COLORS.length];
    const initials = name => name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0].toUpperCase()).join('');
    const avatar = (contact, size = '') => `<span class="avatar ${size}" style="--c:${colorOf(contact.name)}">${escape(initials(contact.name))}</span>`;
    const normalize = text => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

    function updateCount() {
        const badge = document.getElementById('contacts-nombre');
        badge.hidden = !contacts.length;
        badge.textContent = contacts.length;
    }

    async function saveContacts(list) {
        contacts = await window.os.setContacts(list);
        updateCount();
    }

    function renderContacts() {
        const body = contactsPanel.body;
        if (shownContact !== null && contacts[shownContact]) return renderCard();
        const found = contacts.map((contact, index) => ({ contact, index }))
            .filter(({ contact }) => !query || normalize(`${contact.name} ${contact.phone || ''} ${contact.email || ''}`).includes(normalize(query)))
            .sort((a, b) => a.contact.name.localeCompare(b.contact.name, 'fr'));
        body.innerHTML = `
            <label class="contacts-recherche" data-icon="search"><input data-recherche value="${escape(query)}" placeholder="Chercher un contact" autocomplete="off" spellcheck="false"></label>
            ${found.length ? `<div class="grille-contacts">${found.map(({ contact, index }) => `
                <button class="carte-contact" data-contact="${index}" title="${escape(contact.name)}">${avatar(contact)}<span>${escape(contact.name.split(' ')[0])}</span></button>`).join('')}
                <button class="carte-contact ajouter" data-ajouter><span class="avatar" data-icon="plus"></span><span>Ajouter</span></button></div>`
            : contacts.length ? `<p class="panneau-vide">Personne ne s’appelle « ${escape(query)} ».</p><button class="bouton large" data-ajouter>Ajouter « ${escape(query)} »</button>`
                : '<p class="panneau-vide">Ajoute tes proches : ils seront à portée de clic.</p><button class="bouton large" data-ajouter data-icon="plus">Ajouter un contact</button>'}`;
        window.icons.fill(body);
        const input = body.querySelector('[data-recherche]');
        input.addEventListener('input', () => {
            query = input.value;
            const at = input.selectionStart;
            renderContacts();
            const again = contactsPanel.body.querySelector('[data-recherche]');
            again.focus();
            again.setSelectionRange(at, at);
        });
        input.addEventListener('keydown', event => {
            // Entrée : la fiche du premier trouvé
            if (event.key === 'Enter' && found.length) { shownContact = found[0].index; renderContacts(); }
        });
    }

    function renderCard() {
        const body = contactsPanel.body;
        const contact = contacts[shownContact];
        if (editing) {
            body.innerHTML = `<form class="fiche-contact" data-fiche-form>
                <button type="button" class="retour-contacts" data-retour data-icon="chevron-left">Contacts</button>
                ${avatar(contact.name ? contact : { name: '?' }, 'grand')}
                <label>Nom<input name="name" value="${escape(contact.name)}" maxlength="40" required autocomplete="off"></label>
                <label>Téléphone<input name="phone" value="${escape(contact.phone || '')}" maxlength="30" inputmode="tel" autocomplete="off"></label>
                <label>E-mail<input name="email" value="${escape(contact.email || '')}" maxlength="80" type="email" autocomplete="off"></label>
                <label>Note<input name="note" value="${escape(contact.note || '')}" maxlength="120" autocomplete="off" placeholder="Anniversaire, adresse…"></label>
                <div class="fiche-ligne">${contact.name ? '<button type="button" class="bouton danger" data-supprimer data-icon="trash">Supprimer</button>' : ''}<button class="bouton principal">Enregistrer</button></div>
            </form>`;
            window.icons.fill(body);
            const form = body.querySelector('form');
            form.querySelector('[name="name"]').focus();
            form.addEventListener('submit', async event => {
                event.preventDefault();
                const values = Object.fromEntries([...new FormData(form)].map(([k, v]) => [k, String(v).trim()]));
                if (!values.name) return;
                const list = [...contacts];
                list[shownContact] = values;
                await saveContacts(list);
                shownContact = contacts.findIndex(c => c.name === values.name);
                editing = false;
                renderContacts();
            });
            return;
        }
        const phone = contact.phone || '';
        const email = contact.email || '';
        body.innerHTML = `<div class="fiche-contact">
            <button class="retour-contacts" data-retour data-icon="chevron-left">Contacts</button>
            ${avatar(contact, 'grand')}
            <b class="fiche-nom">${escape(contact.name)}</b>
            ${contact.note ? `<span class="fiche-note">${escape(contact.note)}</span>` : ''}
            <div class="fiche-actions">
                <button class="fiche-action" data-appeler ${phone ? '' : 'disabled'}><span data-icon="phone"></span>Appeler</button>
                <button class="fiche-action" data-message ${phone || email ? '' : 'disabled'}><span data-icon="message"></span>Message</button>
            </div>
            <dl class="fiche-infos">
                <div><dt>Téléphone</dt><dd>${phone ? escape(phone) : '<i>Pas encore de numéro</i>'}</dd></div>
                <div><dt>E-mail</dt><dd>${email ? escape(email) : '<i>Pas encore d’adresse</i>'}</dd></div>
            </dl>
            <button class="bouton large" data-modifier data-icon="edit">Modifier</button>
        </div>`;
        window.icons.fill(body);
    }

    // (les boutons de la fiche et de la grille, une seule fois pour toutes)
    contactsPanel.body.addEventListener('click', async event => {
        const target = event.target.closest('button');
        if (!target) return;
        if (target.dataset.contact !== undefined) { shownContact = Number(target.dataset.contact); editing = false; return renderContacts(); }
        if (target.hasAttribute('data-retour')) {
            // (une fiche neuve laissée vide n'est pas gardée)
            if (contacts[shownContact] && !contacts[shownContact].name) await saveContacts(contacts.filter((_, i) => i !== shownContact));
            shownContact = null; editing = false; return renderContacts();
        }
        if (target.hasAttribute('data-ajouter')) {
            await saveContacts([...contacts, { name: query.trim() }]);
            shownContact = contacts.length - 1;
            editing = true;
            query = '';
            return renderContacts();
        }
        if (target.hasAttribute('data-modifier')) { editing = true; return renderContacts(); }
        if (target.hasAttribute('data-supprimer')) {
            if (!target.classList.contains('confirmer')) {
                target.classList.add('confirmer');
                target.lastChild.textContent = 'Confirmer ?';
                return;
            }
            await saveContacts(contacts.filter((_, i) => i !== shownContact));
            shownContact = null; editing = false; return renderContacts();
        }
        const contact = contacts[shownContact];
        if (target.hasAttribute('data-appeler') && contact?.phone) {
            const result = await window.os.contactAction('appeler', contact.phone);
            if (!result.ok) toast(result.erreur, 'x');
        }
        if (target.hasAttribute('data-message') && contact) {
            const result = await window.os.contactAction('message', contact.email || contact.phone);
            if (!result.ok) toast(result.erreur, 'x');
        }
    });

    window.os.contacts().then(list => {
        contacts = list;
        updateCount();
    });

    // ---- Notes ----
    let notes = [];
    const notesPanel = window.panneaux.create('notes', 'Notes', {
        onOpen: async () => {
            notes = await window.os.notes();
            renderNotes();
            setTimeout(() => notesPanel.body.querySelector('input')?.focus(), 60);
        }
    });

    function renderNotes() {
        notesPanel.body.innerHTML = `
            <form class="champ-ajout" data-form>
                <input placeholder="Nouvelle note…" maxlength="200" autocomplete="off" aria-label="Nouvelle note">
                <button aria-label="Ajouter" data-icon="plus"></button>
            </form>
            <ul class="liste">${notes.map((note, index) => `
                <li class="${note.done ? 'faite' : ''}">
                    <button class="case" data-toggle="${index}" aria-label="${note.done ? 'Pas faite' : 'Faite'}">${note.done ? window.icons.icon('check') : ''}</button>
                    <span class="liste-texte">${escape(note.text)}</span>
                    <button class="liste-supprimer" data-remove="${index}" data-icon="x" aria-label="Supprimer"></button>
                </li>`).join('')}
            </ul>
            ${notes.length ? '' : '<p class="panneau-vide">Aucune note pour l\'instant</p>'}`;
        window.icons.fill(notesPanel.body);

        const save = async () => {
            await window.os.setNotes(notes);
            renderNotes();
        };

        notesPanel.body.querySelector('[data-form]').addEventListener('submit', event => {
            event.preventDefault();
            const text = event.target.querySelector('input').value.trim();
            if (!text) return;
            notes.unshift({ text, done: false, created: Date.now() });
            save().then(() => notesPanel.body.querySelector('input').focus());
        });
        notesPanel.body.querySelectorAll('[data-toggle]').forEach(button => button.addEventListener('click', () => {
            const note = notes[Number(button.dataset.toggle)];
            note.done = !note.done;
            save();
        }));
        notesPanel.body.querySelectorAll('[data-remove]').forEach(button => button.addEventListener('click', () => {
            notes.splice(Number(button.dataset.remove), 1);
            save();
        }));
    }

    // ---- Agenda : un mois, et les rendez-vous du jour choisi ----
    let agenda = {};
    let month = new Date();
    month.setDate(1);
    let chosen = new Date();

    const dayKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const agendaPanel = window.panneaux.create('agenda', 'Agenda', {
        onOpen: async () => {
            agenda = await window.os.agenda();
            renderAgenda();
        }
    });

    function renderAgenda() {
        const today = dayKey(new Date());
        const first = new Date(month);
        const start = (first.getDay() + 6) % 7; // lundi en premier
        const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
        const cells = [];
        for (let i = 0; i < start; i++) cells.push('<span></span>');
        for (let d = 1; d <= days; d++) {
            const key = dayKey(new Date(month.getFullYear(), month.getMonth(), d));
            const classes = [key === today && 'aujourdhui', key === dayKey(chosen) && 'choisi', agenda[key]?.length && 'occupe'].filter(Boolean).join(' ');
            cells.push(`<button class="${classes}" data-day="${d}">${d}</button>`);
        }

        const events = agenda[dayKey(chosen)] || [];
        const monthName = month.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
        const chosenName = chosen.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

        agendaPanel.body.innerHTML = `
            <div class="agenda-mois">
                <button data-move="-1" aria-label="Mois précédent">‹</button>
                <b>${monthName.charAt(0).toUpperCase() + monthName.slice(1)}</b>
                <button data-move="1" aria-label="Mois suivant">›</button>
            </div>
            <div class="agenda-grille">
                ${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(d => `<i>${d}</i>`).join('')}
                ${cells.join('')}
            </div>
            <h4 class="agenda-jour">${chosenName.charAt(0).toUpperCase() + chosenName.slice(1)}</h4>
            <ul class="liste">${events.map((event, index) => `
                <li><span class="agenda-heure">${escape(event.heure || '')}</span><span class="liste-texte">${escape(event.texte)}</span>
                    <button class="liste-supprimer" data-remove="${index}" data-icon="x" aria-label="Supprimer"></button></li>`).join('')}
            </ul>
            <form class="champ-ajout agenda-ajout" data-form>
                <input type="time" aria-label="Heure">
                <input placeholder="Nouveau rendez-vous" maxlength="120" autocomplete="off" aria-label="Rendez-vous">
                <button aria-label="Ajouter" data-icon="plus"></button>
            </form>`;
        window.icons.fill(agendaPanel.body);

        agendaPanel.body.querySelectorAll('[data-move]').forEach(button => button.addEventListener('click', () => {
            month = new Date(month.getFullYear(), month.getMonth() + Number(button.dataset.move), 1);
            renderAgenda();
        }));
        agendaPanel.body.querySelectorAll('[data-day]').forEach(button => button.addEventListener('click', () => {
            chosen = new Date(month.getFullYear(), month.getMonth(), Number(button.dataset.day));
            renderAgenda();
        }));

        const save = async () => {
            agenda = await window.os.setAgenda(agenda);
            renderAgenda();
        };

        agendaPanel.body.querySelector('[data-form]').addEventListener('submit', event => {
            event.preventDefault();
            const [hour, text] = event.target.querySelectorAll('input');
            if (!text.value.trim()) return;
            const key = dayKey(chosen);
            agenda[key] = [...(agenda[key] || []), { heure: hour.value, texte: text.value.trim() }]
                .sort((a, b) => (a.heure || '99').localeCompare(b.heure || '99'));
            save();
        });
        agendaPanel.body.querySelectorAll('[data-remove]').forEach(button => button.addEventListener('click', () => {
            const key = dayKey(chosen);
            agenda[key].splice(Number(button.dataset.remove), 1);
            if (!agenda[key].length) delete agenda[key];
            save();
        }));
    }

    window.agenda = { open: () => window.panneaux.open('agenda') };
})();
