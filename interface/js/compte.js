// Compte connecté : son rang, et pour un enfant les règles posées par un administrateur
// (seulement les applis autorisées, et l'ordinateur utilisable à certaines heures)
(() => {
    let account = { role: 'standard', rules: null };

    const ready = window.os.me().then(value => {
        account = value;
        if (account.role === 'enfant') watchHours();
        return account;
    });

    // Un enfant ne voit que ses applis autorisées (les autres comptes voient tout)
    const allowed = appId => account.role !== 'enfant' || (account.rules?.apps || []).includes(appId);

    const toMinutes = text => {
        const [h, m] = String(text || '').split(':').map(Number);
        return h * 60 + (m || 0);
    };

    // Minutes restantes avant la fin des horaires (null : pas d'horaires)
    function minutesLeft() {
        const { debut, fin } = account.rules || {};
        if (!debut || !fin) return null;
        const now = new Date();
        const current = now.getHours() * 60 + now.getMinutes();
        let left = toMinutes(fin) - current;
        if (left < 0) left += 24 * 60;
        return left;
    }

    function watchHours() {
        let warned = false;
        setInterval(() => {
            const left = minutesLeft();
            if (left == null) return;
            if (left <= 5 && left > 0 && !warned) {
                warned = true;
                window.ui.toast(`Plus que ${left} minute${left > 1 ? 's' : ''} sur l'ordinateur !`, 'bell');
                window.face.setExpression('sad', 3000);
            }
            if (left === 0) {
                window.ui.toast('C\'est l\'heure d\'arrêter. À demain !', 'moon');
                setTimeout(() => window.os.logout(), 8000);
            }
        }, 30000);
    }

    window.compte = { ready, allowed, current: () => account };
})();
