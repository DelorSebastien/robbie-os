// Téléphone sur le bureau : la carte d'un appel qui arrive (à côté de la barre latérale), la
// pastille d'un appel en cours (en haut), le bouton Téléphone de la barre et la batterie du
// téléphone relié dans le coin (maquette « Téléphone Robbie OS », écran 4)
(() => {
    const { escape } = window.ui;
    const COLORS = ['#ff6fa8', '#ffb35c', '#5aa8ff', '#b57bff', '#5ee8a8', '#ff8a5c', '#5ee7ff', '#ffd25c', '#7f9dff', '#9fe0a0'];
    const colorOf = name => COLORS[[...String(name)].reduce((sum, c) => sum + c.charCodeAt(0), 0) % COLORS.length];
    const initials = name => /^[+\d\s.-]+$/.test(name) ? String(name).replace(/[^\d]/g, '').slice(0, 2) : String(name).split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('');
    const formatNumber = number => {
        const digits = String(number || '').replace(/[^\d+]/g, '');
        if (/^(\+|00)33\d{9}$/.test(digits)) return `0${digits.slice(-9)}`.replace(/(\d{2})(?=\d)/g, '$1 ');
        return /^0\d{9}$/.test(digits) ? digits.replace(/(\d{2})(?=\d)/g, '$1 ') : String(number || '');
    };
    const QUICK_REPLIES = ['Je te rappelle', 'Je suis occupé'];

    let status = null;
    const card = document.createElement('section');
    card.className = 'appel-entrant';
    card.setAttribute('aria-label', 'Appel entrant');
    card.hidden = true;
    document.body.append(card);

    const pill = document.createElement('div');
    pill.className = 'appel-pastille';
    pill.hidden = true;
    document.body.append(pill);

    const button = document.querySelector('[data-action="telephone"]');
    const battery = document.getElementById('coin-telephone');
    let ringing = null;            // appel qui sonne (montré dans la carte)
    let ongoing = null;            // appel en cours (montré dans la pastille)
    let ticker = null;

    const call = async (method, ...args) => {
        const result = await window.os.phone(method, ...args);
        if (result?.erreurService) throw new Error(result.erreurService);
        return result;
    };

    function nameOf(person) {
        return person?.contact ? person.nom : formatNumber(person?.nom || '');
    }

    // ---- La carte de l'appel qui arrive ----
    function renderCard() {
        if (!ringing) {
            if (!card.hidden) {
                card.classList.remove('visible');
                setTimeout(() => !ringing && (card.hidden = true), 250);
                window.os.setCallShown(false);
            }
            return;
        }
        const person = ringing.personne;
        const viaPhone = ringing.canal === 'telephone';
        const where = viaPhone ? `${escape(formatNumber(ringing.adresse))} · sur ${escape(status?.telephone?.nom || 'ton téléphone')}` : `${ringing.video ? 'Appel vidéo' : 'Appel vocal'} · Robbie OS`;
        card.innerHTML = `
            <div class="ae-tete">
                <span class="ae-avatar"><span class="ae-onde"></span><span class="ae-av" style="--c:${colorOf(person.nom)}">${escape(initials(person.nom) || '?')}</span></span>
                <span class="ae-qui">
                    <small>APPEL ENTRANT</small>
                    <b>${escape(nameOf(person))}</b>
                    <span>${where}</span>
                </span>
            </div>
            <div class="ae-boutons">
                <button class="ae-refuser" data-refuser data-icon="phone">Refuser</button>
                <button class="ae-repondre" data-repondre data-icon="${ringing.video ? 'video' : 'phone'}">Répondre</button>
            </div>
            <div class="ae-rapides">
                <small>Refuser avec ${viaPhone ? 'un SMS' : 'un message'} :</small>
                <div>${QUICK_REPLIES.map(text => `<button class="ae-rapide" data-texte="${escape(text)}">${escape(text)}</button>`).join('')}<button class="ae-rapide" data-ecrire>Écrire…</button></div>
            </div>`;
        window.icons.fill(card);
        if (card.hidden) {
            card.hidden = false;
            requestAnimationFrame(() => card.classList.add('visible'));
            window.os.setCallShown(true);
        }
    }

    card.addEventListener('click', async event => {
        const target = event.target.closest('button');
        if (!target || !ringing) return;
        const id = ringing.id;
        const person = ringing.personne;
        try {
            if (target.hasAttribute('data-repondre')) await call('decrocher', id);
            if (target.hasAttribute('data-refuser')) await call('raccrocher', id);
            if (target.dataset.texte) await call('raccrocher', id, target.dataset.texte);
            if (target.hasAttribute('data-ecrire')) {
                await call('raccrocher', id);
                window.os.openPhone('--message', person.robbie && ringing.canal === 'robbie' ? `robbie:${person.robbie}` : ringing.adresse);
            }
        } catch (error) {
            window.ui.toast(error.message, 'x');
        }
    });

    // ---- La pastille de l'appel en cours ----
    function renderPill() {
        clearInterval(ticker);
        if (!ongoing) {
            pill.hidden = true;
            return;
        }
        const viaPhone = ongoing.canal === 'telephone';
        const draw = () => {
            const seconds = ongoing.connecteA ? Math.floor((Date.now() - ongoing.connecteA) / 1000) : 0;
            const time = ongoing.connecteA ? `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}` : 'Appel…';
            pill.innerHTML = `<span class="ap-point"></span>
                <span><b>${escape(nameOf(ongoing.personne))}</b> <span class="ap-doux">· ${time}${viaPhone ? ' · son sur le téléphone' : ' · Robbie OS'}</span></span>
                <button class="ap-rond${ongoing.micro === false ? ' coupe' : ''}" data-micro data-icon="${ongoing.micro === false ? 'micro-coupe' : 'micro'}" aria-label="${ongoing.micro === false ? 'Rallumer le micro' : 'Couper le micro'}"></button>
                <button class="ap-rond ap-raccrocher" data-raccrocher data-icon="phone" aria-label="Raccrocher"></button>`;
            window.icons.fill(pill);
        };
        draw();
        pill.hidden = false;
        ticker = setInterval(draw, 1000);
    }
    pill.addEventListener('click', async event => {
        if (!ongoing) return;
        if (event.target.closest('[data-raccrocher]')) await call('raccrocher', ongoing.id).catch(() => {});
        else if (event.target.closest('[data-micro]')) await call('micro', ongoing.id, ongoing.micro === false).catch(() => {});
        // (un appel Robbie OS : un clic ramène sa fenêtre)
        else if (ongoing.canal === 'robbie') window.os.focusWindow('robbie-telephone');
    });

    // ---- Barre et coin ----
    function renderStatus() {
        const inCall = Boolean(ringing || ongoing);
        button?.classList.toggle('en-appel', inCall);
        const dot = button?.querySelector('.pastille');
        if (dot) dot.hidden = !(status?.nonLus > 0) || inCall;
        const phone = status?.telephone;
        if (battery) {
            battery.hidden = !(phone?.connecte && phone.batterie != null && phone.droits?.batterie !== false);
            if (!battery.hidden) {
                battery.querySelector('b').textContent = `${phone.batterie} %`;
                battery.title = `${phone.nom} : batterie ${phone.batterie} %${phone.charge ? ' (en charge)' : ''}${phone.reseau ? ` · ${phone.reseau}` : ''}`;
            }
        }
    }

    function apply(calls) {
        ringing = calls.find(c => c.sens === 'entrant' && c.etat === 'sonne') || null;
        ongoing = calls.find(c => c !== ringing) || null;
        renderCard();
        renderPill();
        renderStatus();
    }

    window.os.onPhone((event, data) => {
        if (event === 'etat') {
            status = data;
            apply(data.appels || []);
        }
        if (event === 'connecte') refresh();
    });

    async function refresh() {
        try {
            status = await call('etat');
            apply(status.appels || []);
        } catch {}
    }

    refresh();
    window.telephoneBureau = { refresh };
})();
