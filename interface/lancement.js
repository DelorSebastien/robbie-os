// Point d'entrée de Robbie OS : l'écran d'accueil (connexion) quand greetd le lance avec --accueil,
// sinon le bureau de la personne connectée
require(process.argv.includes('--accueil') ? './accueil/main' : './main');
