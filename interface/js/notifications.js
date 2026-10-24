// Notifications : une carte apparaît à côté de la barre latérale, puis la notification
// est rangée dans le centre de notifications (la cloche). « Ne pas déranger » garde les
// notifications sans les afficher.
(() => {
    const { escape } = window.ui;
    const stack = document.createElement('div');
    stack.className = 'notif-pile';
    document.body.append(stack);

    const bell = document.querySelector('[data-action="notifications"]');
    const badge = bell.querySelector('.pastille');

    let list = [];
    let unread = 0;
    let doNotDisturb = false;

    const time = timestamp => new Date(timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    function updateBadge() {
        badge.hidden = unread === 0;
    }

    // ---- Carte qui apparaît ----
    function popup(notification) {
        const card = document.createElement('div');
        card.className = `notif-carte${notification.urgent ? ' urgente' : ''}`;
        card.innerHTML = `
            ${notification.icon ? `<img class="notif-icone" src="${notification.icon}" alt="">` : '<span class="notif-icone vide"></span>'}
            <div class="notif-texte">
                <span class="notif-app">${escape(notification.app)} · ${time(notification.time)}</span>
                <b>${escape(notification.summary)}</b>
                ${notification.body ? `<span>${escape(notification.body)}</span>` : ''}
                ${notification.actions.filter(a => a.key !== 'default').length ? `<div class="notif-boutons">${notification.actions.filter(a => a.key !== 'default').map(a => `<button data-key="${escape(a.key)}">${escape(a.label)}</button>`).join('')}</div>` : ''}
            </div>
            <button class="notif-fermer" data-icon="x" aria-label="Fermer"></button>`;
        window.icons.fill(card);
        stack.prepend(card);
        requestAnimationFrame(() => card.classList.add('visible'));

        const remove = () => {
            card.classList.remove('visible');
            setTimeout(() => card.remove(), 300);
        };

        card.addEventListener('click', event => {
            const action = event.target.closest('[data-key]');
            if (event.target.closest('.notif-fermer')) {
                window.os.notificationDismiss(notification.id);
            } else {
                window.os.notificationAction(notification.id, action ? action.dataset.key : 'default');
            }
            remove();
        });

        // Disparaît toute seule (sauf si urgente), plus tard si elle est longue
        if (!notification.urgent) {
            const duration = notification.timeout > 0 ? notification.timeout : 5000 + notification.body.length * 40;
            setTimeout(remove, Math.min(duration, 12000));
        }
    }

    // ---- Centre de notifications ----
    const center = window.panneaux.create('notifications', 'Notifications', {
        onOpen: () => {
            unread = 0;
            updateBadge();
            render();
        }
    });

    center.actions.innerHTML = '<button class="petit-bouton" data-clear>Tout effacer</button>';
    center.actions.querySelector('[data-clear]').addEventListener('click', () => {
        list = [];
        render();
    });

    function render() {
        center.body.innerHTML = `
            <label class="interrupteur">
                <input type="checkbox" ${doNotDisturb ? 'checked' : ''} data-dnd>
                <span>Ne pas déranger</span>
            </label>
            ${list.length ? list.map(n => `
                <div class="notif-ligne">
                    ${n.icon ? `<img class="notif-icone" src="${n.icon}" alt="">` : '<span class="notif-icone vide"></span>'}
                    <div class="notif-texte">
                        <span class="notif-app">${escape(n.app)} · ${time(n.time)}</span>
                        <b>${escape(n.summary)}</b>
                        ${n.body ? `<span>${escape(n.body)}</span>` : ''}
                    </div>
                </div>`).join('') : '<p class="panneau-vide">Aucune notification</p>'}`;

        center.body.querySelector('[data-dnd]').addEventListener('change', async event => {
            doNotDisturb = event.target.checked;
            await window.os.setSettings({ doNotDisturb });
        });
    }

    window.os.onNotification(notification => {
        list = [notification, ...list.filter(n => n.id !== notification.id)].slice(0, 50);
        if (window.panneaux.current() === 'notifications') render();
        else {
            unread++;
            updateBadge();
        }
        if (!doNotDisturb || notification.urgent) popup(notification);
    });

    window.os.onNotificationClose(id => {
        list = list.filter(n => n.id !== id);
        if (window.panneaux.current() === 'notifications') render();
    });

    window.os.onShortcut(name => {
        if (name === 'notifications') window.panneaux.toggle('notifications');
    });

    window.os.settings().then(settings => {
        doNotDisturb = Boolean(settings.doNotDisturb);
    });

    updateBadge();
    // (Ne pas déranger changé ailleurs : réglages rapides, mode concentration)
    const setDoNotDisturb = value => {
        doNotDisturb = Boolean(value);
        window.os.setSettings({ doNotDisturb });
    };

    window.notificationsCenter = { toggle: () => window.panneaux.toggle('notifications'), setDoNotDisturb };
})();
