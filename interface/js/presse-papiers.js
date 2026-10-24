// Presse-papiers (Super+V, ou le bouton de la barre latérale) : les derniers textes copiés,
// un clic pour les recopier ; l'historique reste en mémoire et disparaît à la déconnexion
(() => {
    const { escape, toast } = window.ui;
    let items = [];
    const panel = window.panneaux.create('presse-papiers', 'Presse-papiers', { onOpen: render });

    const ago = time => {
        const minutes = Math.round((Date.now() - time) / 60000);
        if (minutes < 1) return 'à l\'instant';
        if (minutes < 60) return `il y a ${minutes} min`;
        return new Date(time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    };

    function render() {
        panel.body.innerHTML = items.length
            ? `<ul class="liste presse-liste">${items.map((item, index) => `
                <li><button class="presse-ligne" data-index="${index}" title="Recopier">
                    <span class="presse-texte">${escape(item.text.length > 220 ? `${item.text.slice(0, 220)}…` : item.text)}</span>
                    <small>${ago(item.time)}</small>
                </button></li>`).join('')}</ul>
               <button class="bouton presse-effacer" data-effacer>Effacer l'historique</button>`
            : '<p class="panneau-vide">Rien de copié pour l\'instant. Les textes que tu copies apparaîtront ici.</p>';

        panel.body.querySelectorAll('[data-index]').forEach(button => button.addEventListener('click', async () => {
            await window.os.clipboardCopy(items[Number(button.dataset.index)].text);
            window.panneaux.close();
            toast('Copié : colle avec Ctrl+V', 'check');
        }));
        panel.body.querySelector('[data-effacer]')?.addEventListener('click', async () => {
            items = await window.os.clipboardClear();
            render();
        });
    }

    window.os.onClipboard(list => {
        items = list;
        if (window.panneaux.current() === 'presse-papiers') render();
    });
    window.os.clipboardHistory().then(list => { items = list; });
})();
