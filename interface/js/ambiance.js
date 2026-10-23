// Ambiance vivante par-dessus le fond d'écran : le fond suit doucement la souris,
// des lucioles montent du lac, et une étoile filante passe de temps en temps
(() => {
    const canvas = document.getElementById('ambiance');
    const ctx = canvas.getContext('2d');
    const wallpaper = document.getElementById('fond');

    let W = 0;
    let H = 0;
    let particles = [];

    function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        W = window.innerWidth;
        H = window.innerHeight;
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        particles = Array.from({ length: Math.round(W / 22) }, () => spawn(true));
    }

    // Luciole : née sur le lac, elle monte en ondulant et s'éteint
    function spawn(anywhere = false) {
        const life = 6 + Math.random() * 8;
        return {
            x: Math.random() * W,
            y: H * (0.62 + Math.random() * 0.4),
            vx: (Math.random() - 0.5) * 6,
            vy: -(4 + Math.random() * 10),
            size: 0.8 + Math.random() * 1.8,
            life,
            age: anywhere ? Math.random() * life : 0,
            phase: Math.random() * Math.PI * 2,
            warm: Math.random() < 0.25
        };
    }

    // Le fond bouge un peu avec la souris (effet de profondeur)
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    window.addEventListener('mousemove', event => {
        mouse.tx = event.clientX / W - 0.5;
        mouse.ty = event.clientY / H - 0.5;
    });

    // Couleur de Robbie, relue de temps en temps (pas à chaque image)
    let accent = '94, 231, 255';
    let accentTime = 0;

    let star = null;
    let nextStar = performance.now() + 5000;
    let last = performance.now();

    function frame(now) {
        requestAnimationFrame(frame);
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        if (document.hidden) return;

        mouse.x += (mouse.tx - mouse.x) * 0.035;
        mouse.y += (mouse.ty - mouse.y) * 0.035;
        wallpaper.style.transform = `scale(1.06) translate(${(-mouse.x * 1.4).toFixed(3)}%, ${(-mouse.y * 1).toFixed(3)}%)`;

        ctx.clearRect(0, 0, W, H);
        if (now - accentTime > 400) {
            accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || accent;
            accentTime = now;
        }

        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];
            p.age += dt;
            if (p.age > p.life) {
                particles[i] = spawn();
                continue;
            }
            p.x += (p.vx + Math.sin(now / 900 + p.phase) * 4) * dt;
            p.y += p.vy * dt;

            const k = p.age / p.life;
            const alpha = Math.sin(k * Math.PI) * (0.55 + 0.45 * Math.sin(now / 300 + p.phase));
            const color = p.warm ? '255, 200, 160' : accent;
            const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 5);
            glow.addColorStop(0, `rgba(${color}, ${(alpha * 0.9).toFixed(3)})`);
            glow.addColorStop(1, `rgba(${color}, 0)`);
            ctx.fillStyle = glow;
            ctx.fillRect(p.x - p.size * 5, p.y - p.size * 5, p.size * 10, p.size * 10);
        }

        // Étoile filante
        if (!star && now > nextStar) {
            star = { x: W * (0.1 + Math.random() * 0.5), y: H * (0.05 + Math.random() * 0.25), start: now };
        }
        if (star) {
            const k = (now - star.start) / 1100;
            if (k >= 1) {
                star = null;
                nextStar = now + 7000 + Math.random() * 14000;
            } else {
                const x = star.x + k * W * 0.22;
                const y = star.y + k * H * 0.1;
                const tail = ctx.createLinearGradient(x, y, x - W * 0.08, y - H * 0.036);
                tail.addColorStop(0, `rgba(235, 248, 255, ${(Math.sin(k * Math.PI) * 0.95).toFixed(3)})`);
                tail.addColorStop(1, 'rgba(235, 248, 255, 0)');
                ctx.strokeStyle = tail;
                ctx.lineWidth = 1.6;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(x - W * 0.08, y - H * 0.036);
                ctx.stroke();
            }
        }
    }

    resize();
    window.addEventListener('resize', resize);
    requestAnimationFrame(frame);
})();
