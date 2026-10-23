// Le fond d'écran suit doucement la souris (effet de profondeur)
(() => {
    const wallpaper = document.getElementById('fond');
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };

    window.addEventListener('mousemove', event => {
        mouse.tx = event.clientX / window.innerWidth - 0.5;
        mouse.ty = event.clientY / window.innerHeight - 0.5;
    });

    function frame() {
        requestAnimationFrame(frame);
        if (document.hidden) return;

        const dx = mouse.tx - mouse.x;
        const dy = mouse.ty - mouse.y;
        if (Math.abs(dx) < 0.0005 && Math.abs(dy) < 0.0005) return;

        mouse.x += dx * 0.035;
        mouse.y += dy * 0.035;
        wallpaper.style.transform = `scale(1.03) translate(${(-mouse.x * 0.8).toFixed(3)}%, ${(-mouse.y * 0.6).toFixed(3)}%)`;
    }

    requestAnimationFrame(frame);
})();
