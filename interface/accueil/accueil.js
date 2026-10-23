// Écran d'accueil : heure, Robbie, choix du compte, mot de passe, éteindre ou redémarrer
(() => {
    const api = window.accueil;
    const face = window.face;
    const list = document.getElementById('comptes');
    const form = document.getElementById('formulaire');
    const input = document.getElementById('mot-de-passe');
    const error = document.getElementById('erreur');
    const hello = document.getElementById('salut');

    const ROLES = { admin: 'Administrateur', standard: 'Standard', enfant: 'Enfant', invite: 'Invité' };
    const escape = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // ---- Heure ----
    const time = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
    function tick() {
        const now = new Date();
        document.getElementById('heure').textContent = time.format(now);
        const date = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
        document.getElementById('date').textContent = date.charAt(0).toUpperCase() + date.slice(1);
    }
    tick();
    setInterval(tick, 1000);

    // ---- Robbie : il regarde la souris, et réagit ----
    if (face) {
        face.setSkin('none');
        document.addEventListener('mousemove', event => {
            face.setGaze((event.clientX / window.innerWidth - 0.5) * 2, (event.clientY / window.innerHeight - 0.5) * 2);
        });
        setTimeout(() => face.setExpression('happy', 1600), 1200);
    }

    // ---- Comptes ----
    let accounts = [];
    let chosen = null;
    let busy = false;

    async function load() {
        accounts = await api.accounts();
        list.innerHTML = accounts.map((account, index) => `
            <button class="compte${account.blocked ? ' bloque' : ''}" data-index="${index}" role="listitem"
                title="${account.blocked ? `Utilisable de ${escape(account.hours)}` : escape(account.name)}">
                <span class="avatar">${escape(account.name.charAt(0).toUpperCase())}</span>
                <b>${escape(account.name)}</b>
                <span class="rang ${account.role}">${ROLES[account.role]}</span>
            </button>`).join('');

        // Un seul compte (sans compter l'invité) : il est choisi d'office
        const people = accounts.filter(a => a.role !== 'invite');
        if (people.length === 1) choose(accounts.indexOf(people[0]));
    }

    function choose(index) {
        const account = accounts[index];
        if (!account) return;
        chosen = account;
        error.textContent = '';
        list.classList.add('un-choisi');
        list.querySelectorAll('.compte').forEach((card, i) => card.classList.toggle('choisi', i === index));

        if (account.blocked) {
            form.hidden = true;
            error.textContent = `${account.name} ne peut utiliser l'ordinateur que de ${account.hours}.`;
            face?.setExpression('sad', 2000);
            return;
        }

        hello.textContent = account.role === 'invite' ? 'Session invité' : `Bonjour ${account.name}`;
        face?.setExpression('happy', 1400);

        // Invité : pas de mot de passe, juste le bouton pour entrer
        const guest = account.role === 'invite';
        form.hidden = false;
        form.classList.toggle('sans-mot-de-passe', guest);
        input.value = '';
        if (guest) form.querySelector('button').focus();
        else input.focus();
    }

    list.addEventListener('click', event => {
        const card = event.target.closest('[data-index]');
        if (card) choose(Number(card.dataset.index));
    });

    async function login(password) {
        if (!chosen || busy) return;
        busy = true;
        error.textContent = '';
        face?.setThinking(true);

        const result = await api.login(chosen.user, password);
        face?.setThinking(false);
        busy = false;

        if (result.ok) {
            face?.setExpression('excited', 3000);
            hello.textContent = 'C\'est parti !';
            form.hidden = true;
            return;
        }

        error.textContent = result.error;
        face?.setExpression('dizzy', 1800);
        form.classList.remove('secoue');
        void form.offsetWidth;
        form.classList.add('secoue');
        input.select();
    }

    form.addEventListener('submit', event => {
        event.preventDefault();
        login(input.value);
    });

    // Flèches gauche et droite : changer de compte
    document.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight'].includes(event.key) || !accounts.length) return;
        const current = chosen ? accounts.indexOf(chosen) : -1;
        const next = (current + (event.key === 'ArrowRight' ? 1 : -1) + accounts.length) % accounts.length;
        choose(next);
    });

    // ---- Éteindre, redémarrer (deuxième clic pour confirmer) ----
    document.querySelectorAll('[data-action]').forEach(button => {
        button.addEventListener('click', () => {
            if (button.classList.contains('confirmer')) return api.power(button.dataset.action);
            button.classList.add('confirmer');
            setTimeout(() => button.classList.remove('confirmer'), 3000);
        });
    });

    load();
})();
