// Barre latérale : contacts favoris avec leur statut (initiale en attendant leur photo)
(() => {
    const STATUS = { online: '#3ddc84', away: '#f5a524', offline: '#7d8799' };

    // Exemples en attendant de vrais contacts
    const CONTACTS = [
        { name: 'Léa', status: 'online' },
        { name: 'Max', status: 'away' },
        { name: 'Sam', status: 'online' },
        { name: 'Noé', status: 'offline' }
    ];

    document.getElementById('contacts').innerHTML = CONTACTS.map(contact => `
        <button class="contact" aria-label="${contact.name}">
            ${contact.name.charAt(0)}
            <span class="statut" style="background: ${STATUS[contact.status]}"></span>
        </button>`).join('');
})();
