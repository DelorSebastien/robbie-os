// Expressions au clavier (W = clin d'œil, S = sommeil)
const keyExpressions = {
    a: 'angry',       // A : colère
    t: 'sad',         // T : tristesse
    c: 'curious',     // C : curiosité
    p: 'shocked',     // P : surprise
    l: 'love',        // L : amoureux
    f: 'tired',       // F : fatigué
    m: 'suspicious',  // M : méfiant
    g: 'shy',         // G : gêné
    v: 'dizzy',       // V : vertige (étourdi)
    o: 'proud',       // O : orgueilleux (fier)
    x: 'excited',     // X : excité
    e: 'scared',      // E : effrayé
    q: 'mocking',     // Q : moqueur
    r: 'laughing'     // R : rire
};

document.addEventListener('keydown', (event) => {
    if (event.repeat || face.isSleeping()) return;

    const key = event.key.toLowerCase();

    // J : mode maître du jeu
    if (key === 'j') {
        window.robot.gmToggle();
        return;
    }

    if (key === 'w') {
        face.wink(0);
        return;
    }

    const expression = keyExpressions[key];
    if (expression) face.setExpression(expression, 2500);
});


// Émotions contrôlées par l'IA (« neutral » ramène au regard normal)
window.robot.onAIEmotion((emotion) => {
    if (face.isSleeping()) return;

    face.setExpression(emotion, 2500);
});

// Apparence de conteur pendant une partie de jeu de rôle
window.robot.onGMMode((active) => {
    face.setGameMaster(active);
});

// Regard pensif pendant que l'IA prépare sa réponse
window.robot.onAIThinking((thinking) => {
    face.setThinking(thinking);
});
