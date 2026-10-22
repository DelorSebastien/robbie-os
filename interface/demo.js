// En attendant la vraie interface : un clic change l'expression de Robbie
let current = 0;

document.addEventListener('click', () => {
    current = (current + 1) % window.face.expressions.length;
    window.face.setExpression(window.face.expressions[current], 4000);
});

setTimeout(() => window.face.setExpression('happy', 3000), 1500);
