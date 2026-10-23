// Barre latérale : contacts favoris avec leur statut (photos à ajouter plus tard)
(() => {
    const STATUS = { online: '#3ddc84', away: '#f5a524', offline: '#7d8799' };

    // Exemples en attendant de vrais contacts
    const CONTACTS = [
        { name: 'Léa', status: 'online', colors: ['#ff9ab0', '#b04aff'] },
        { name: 'Max', status: 'away', colors: ['#5ee7ff', '#2f6bff'] },
        { name: 'Sam', status: 'online', colors: ['#7ef0b0', '#1fa36a'] },
        { name: 'Noé', status: 'offline', colors: ['#ffc46b', '#e0603a'] }
    ];

    document.getElementById('contacts').innerHTML = CONTACTS.map(contact => `
        <button class="contact" aria-label="${contact.name}" style="--photo: linear-gradient(145deg, ${contact.colors.join(', ')})">
            ${contact.name.charAt(0)}
            <span class="statut" style="background: ${STATUS[contact.status]}"></span>
        </button>`).join('');
})();
