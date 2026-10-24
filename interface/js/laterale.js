// Barre latérale : notifications, contacts, notes, agenda, capture d'écran, réglages, applis
(() => {
    const { escape, toast } = window.ui;

    // ---- Boutons ----
    const ACTIONS = {
        notifications: () => window.panneaux.toggle('notifications'),
        contacts: () => window.panneaux.toggle('contacts'),
        notes: () => window.panneaux.toggle('notes'),
        agenda: () => window.panneaux.toggle('agenda'),
        reglages: () => window.reglages ? window.reglages.open() : toast('Les réglages arrivent bientôt', 'gear'),
        lanceur: () => window.launcher.toggle(),
        alimentation: () => window.panneaux.toggle('alimentation'),
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

    // ---- Contacts (enregistrés sur l'ordinateur ; photos à venir) ----
    let contacts = [];
    const contactsPanel = window.panneaux.create('contacts', 'Contacts', { onOpen: renderContacts });

    function renderSidebarContacts() {
        document.getElementById('contacts').innerHTML = contacts.slice(0, 4).map((contact, index) => `
            <button class="contact" data-panneau data-index="${index}" aria-label="${escape(contact.name)}" title="${escape(contact.name)}">
                ${escape(contact.name.charAt(0).toUpperCase())}
            </button>`).join('');
        document.querySelectorAll('#contacts .contact').forEach(button => {
            button.addEventListener('click', () => window.panneaux.toggle('contacts'));
        });
    }

    function renderContacts() {
        contactsPanel.body.innerHTML = `
            <form class="champ-ajout" data-form>
                <input placeholder="Nom du contact" maxlength="40" autocomplete="off" aria-label="Nom du contact">
                <button aria-label="Ajouter" data-icon="plus"></button>
            </form>
            <ul class="liste">${contacts.map((contact, index) => `
                <li><span class="contact-rond">${escape(contact.name.charAt(0).toUpperCase())}</span>
                    <span class="liste-texte">${escape(contact.name)}</span>
                    <button class="liste-supprimer" data-remove="${index}" data-icon="x" aria-label="Supprimer"></button></li>`).join('')}
            </ul>
            ${contacts.length ? '' : '<p class="panneau-vide">Ajoute tes proches : ils apparaîtront dans la barre.</p>'}`;
        window.icons.fill(contactsPanel.body);

        contactsPanel.body.querySelector('[data-form]').addEventListener('submit', async event => {
            event.preventDefault();
            const name = event.target.querySelector('input').value.trim();
            if (!name) return;
            contacts = await window.os.setContacts([...contacts, { name }]);
            renderSidebarContacts();
            renderContacts();
        });
        contactsPanel.body.querySelectorAll('[data-remove]').forEach(button => {
            button.addEventListener('click', async () => {
                contacts = await window.os.setContacts(contacts.filter((_, i) => i !== Number(button.dataset.remove)));
                renderSidebarContacts();
                renderContacts();
            });
        });
    }

    window.os.contacts().then(list => {
        contacts = list;
        renderSidebarContacts();
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
