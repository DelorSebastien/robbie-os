// Petits outils partagés par les scripts de l'interface
(() => {
    const $ = selector => document.querySelector(selector);

    // Mode léger (pas de carte graphique) : verre opaque, décor moins animé
    const light = new URLSearchParams(location.search).has('leger');
    document.documentElement.classList.toggle('leger', light);

    const escape = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    function bytes(value) {
        const units = ['o', 'Ko', 'Mo', 'Go', 'To'];
        let i = 0;
        while (value >= 1024 && i < units.length - 1) {
            value /= 1024;
            i++;
        }
        return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
    }

    function duration(seconds) {
        const m = Math.floor(seconds / 60);
        return `${m}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
    }

    // Recherche tolérante : sans accents ni majuscules, les lettres dans l'ordre
    const normalize = text => String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

    function score(query, ...fields) {
        const q = normalize(query).trim();
        if (!q) return 1;

        let best = 0;
        fields.forEach((field, index) => {
            const text = normalize(field || '');
            const weight = index === 0 ? 1 : 0.6;
            if (text.startsWith(q)) best = Math.max(best, 3 * weight);
            else if (text.split(/[\s\-_.]+/).some(word => word.startsWith(q))) best = Math.max(best, 2.4 * weight);
            else if (text.includes(q)) best = Math.max(best, 1.8 * weight);
            else {
                let i = 0;
                for (const c of text) if (c === q[i]) i++;
                if (i === q.length) best = Math.max(best, 0.8 * weight);
            }
        });
        return best;
    }

    function toast(text, iconName = 'sparkles') {
        const el = document.createElement('div');
        el.className = 'toast';
        el.innerHTML = `${window.icons.icon(iconName)}<span>${escape(text)}</span>`;
        $('#toasts').append(el);
        setTimeout(() => el.classList.add('out'), 3200);
        setTimeout(() => el.remove(), 3700);
    }

    // Fenêtres par-dessus le bureau : une seule à la fois, Échap ou clic à côté pour fermer
    const overlays = {
        current: null,
        open(id) {
            if (this.current && this.current !== id) this.close();
            const el = document.getElementById(id);
            el.hidden = false;
            requestAnimationFrame(() => el.classList.add('open'));
            this.current = id;
            document.dispatchEvent(new CustomEvent('overlay-open', { detail: id }));
        },
        close() {
            if (!this.current) return;
            const el = document.getElementById(this.current);
            el.classList.remove('open');
            setTimeout(() => {
                if (!el.classList.contains('open')) el.hidden = true;
            }, 220);
            document.dispatchEvent(new CustomEvent('overlay-close', { detail: this.current }));
            this.current = null;
        },
        toggle(id) {
            if (this.current === id) this.close();
            else this.open(id);
        }
    };

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') overlays.close();
    });
    document.querySelectorAll('.overlay').forEach(el => {
        el.addEventListener('mousedown', event => {
            if (event.target === el) overlays.close();
        });
    });

    window.ui = { $, escape, bytes, duration, normalize, score, toast, overlays, light };
})();
