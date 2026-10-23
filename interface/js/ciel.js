// Décor du bureau : une ville futuriste au-dessus d'une mer de nuages, dessinée en direct.
// Le ciel suit l'heure (nuit, aube, jour, crépuscule) et bouge un peu avec la souris.
(() => {
    const canvas = document.getElementById('ciel');
    const ctx = canvas.getContext('2d');

    // Tirages aléatoires reproductibles : la ville reste la même d'un démarrage à l'autre
    function seeded(seed) {
        return () => {
            seed |= 0;
            seed = (seed + 0x6d2b79f5) | 0;
            let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
    const rgb = c => `rgb(${c})`;
    const rgba = (c, a) => `rgba(${c}, ${a})`;
    const smooth = (a, b, x) => {
        const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
        return t * t * (3 - 2 * t);
    };

    // Couleurs du ciel selon le moment : [haut, milieu, horizon, lueur]
    const PALETTES = {
        night: [[2, 4, 12], [6, 16, 40], [16, 34, 70], [255, 150, 90]],
        dusk: [[8, 10, 34], [42, 34, 84], [150, 80, 90], [255, 140, 70]],
        day: [[10, 36, 78], [34, 84, 140], [120, 165, 205], [255, 220, 170]]
    };

    // Moment de la journée : nuit (1) → jour (0), et lueur d'aube ou de crépuscule
    function timeOfDay(date = new Date()) {
        const h = date.getHours() + date.getMinutes() / 60;
        const day = smooth(6, 8.5, h) * (1 - smooth(18, 20.5, h));
        const twilight = Math.max(1 - Math.abs(h - 7) / 1.6, 1 - Math.abs(h - 19.3) / 1.8, 0);
        return { night: 1 - day, twilight };
    }

    function palette({ night, twilight }) {
        const base = PALETTES.day.map((c, i) => mix(c, PALETTES.night[i], night));
        return base.map((c, i) => mix(c, PALETTES.dusk[i], twilight * 0.85));
    }

    let W = 0;
    let H = 0;
    let layers = {};
    let stars = [];
    let beacons = [];
    let fogs = [];
    let moment = timeOfDay();
    let colors = palette(moment);

    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    window.addEventListener('mousemove', event => {
        mouse.tx = event.clientX / W - 0.5;
        mouse.ty = event.clientY / H - 0.5;
    });

    function layer(width, height) {
        const c = document.createElement('canvas');
        c.width = width;
        c.height = height;
        return c;
    }

    // Une tour : étages qui s'affinent, flèche, liseré de lumière et fenêtres allumées
    function drawTower(g, rand, x, base, w, h, body, light, lit) {
        const pts = [
            [-0.5, 0], [-0.46, 0.38], [-0.36, 0.42], [-0.33, 0.7], [-0.2, 0.74], [-0.14, 0.93], [-0.03, 0.96], [0, 1.16]
        ];
        g.beginPath();
        pts.forEach(([px, py], i) => g[i ? 'lineTo' : 'moveTo'](x + px * w, base - py * h));
        [...pts].reverse().forEach(([px, py]) => g.lineTo(x - px * w, base - py * h));
        g.closePath();
        g.fillStyle = body;
        g.fill();

        // Liseré éclairé par la lueur de l'horizon
        g.save();
        g.clip();
        const rim = g.createLinearGradient(x + w * 0.2, 0, x + w * 0.5, 0);
        rim.addColorStop(0, 'rgba(0, 0, 0, 0)');
        rim.addColorStop(1, light.replace('ALPHA', '0.16'));
        g.fillStyle = rim;
        g.fillRect(x - w, base - h * 1.2, w * 2, h * 1.2);

        // Fenêtres
        for (let i = 0; i < lit; i++) {
            const fy = rand();
            const width = 1 - fy * 0.85;
            const fx = (rand() - 0.5) * w * width * 0.8;
            g.fillStyle = light.replace('ALPHA', (0.35 + rand() * 0.6).toFixed(2));
            g.fillRect(Math.round(x + fx), Math.round(base - fy * h * 0.95), rand() < 0.3 ? 2 : 1, 1);
        }
        g.restore();

        return [x, base - h * 1.16];
    }

    function build() {
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        W = window.innerWidth;
        H = window.innerHeight;
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        canvas.style.width = `${W}px`;
        canvas.style.height = `${H}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        moment = timeOfDay();
        colors = palette(moment);
        const [top, middle, horizonColor, glowColor] = colors;
        const horizon = H * 0.7;
        const rand = seeded(2026);

        // Ciel
        const sky = layer(W, H);
        const s = sky.getContext('2d');
        const gradient = s.createLinearGradient(0, 0, 0, horizon);
        gradient.addColorStop(0, rgb(top));
        gradient.addColorStop(0.55, rgb(middle));
        gradient.addColorStop(1, rgb(horizonColor));
        s.fillStyle = gradient;
        s.fillRect(0, 0, W, H);

        // Lueur du soleil couchant (toujours un peu présente : c'est l'ambiance de Robbie OS)
        const glowStrength = 0.28 + moment.twilight * 0.5 + (1 - moment.night) * 0.1;
        const glow = s.createRadialGradient(W * 0.64, horizon, 0, W * 0.64, horizon, W * 0.42);
        glow.addColorStop(0, rgba(glowColor, glowStrength));
        glow.addColorStop(0.35, rgba(glowColor, glowStrength * 0.35));
        glow.addColorStop(1, rgba(glowColor, 0));
        s.fillStyle = glow;
        s.fillRect(0, 0, W, H);

        // Planète géante et ses anneaux
        const planet = layer(W, H);
        const p = planet.getContext('2d');
        const px = W * 0.6;
        const py = horizon - H * 0.06;
        const pr = H * 0.2;
        const body = p.createRadialGradient(px - pr * 0.45, py - pr * 0.5, pr * 0.1, px, py, pr);
        body.addColorStop(0, rgba(mix(horizonColor, [190, 210, 255], 0.5), 0.55));
        body.addColorStop(0.6, rgba(mix(middle, [40, 60, 110], 0.5), 0.5));
        body.addColorStop(1, rgba(middle, 0.2));
        p.fillStyle = body;
        p.beginPath();
        p.arc(px, py, pr, 0, Math.PI * 2);
        p.fill();
        p.strokeStyle = rgba(mix(glowColor, [255, 255, 255], 0.4), 0.18);
        p.lineWidth = 1.5;
        p.beginPath();
        p.arc(px, py, pr, Math.PI * 1.05, Math.PI * 1.9);
        p.stroke();
        p.save();
        p.translate(px, py);
        p.rotate(-0.18);
        for (let i = 0; i < 3; i++) {
            p.strokeStyle = rgba([170, 210, 255], 0.12 - i * 0.03);
            p.lineWidth = 1 + i;
            p.beginPath();
            p.ellipse(0, 0, pr * (1.7 + i * 0.16), pr * (0.26 + i * 0.03), 0, Math.PI * 0.98, Math.PI * 2.02);
            p.stroke();
        }
        p.restore();

        // Étoiles (dessinées à chaque image pour scintiller)
        stars = Array.from({ length: Math.round(W * H / 4200) }, () => ({
            x: rand() * W,
            y: Math.pow(rand(), 1.6) * horizon * 0.95,
            r: rand() < 0.08 ? 1.4 : 0.5 + rand() * 0.7,
            phase: rand() * Math.PI * 2,
            speed: 0.5 + rand() * 2
        }));

        // Ville lointaine, bleutée par la brume
        beacons = [];
        const far = layer(W, H);
        const f = far.getContext('2d');
        const farBody = rgb(mix(horizonColor, middle, 0.55));
        const farLight = 'rgba(150, 220, 255, ALPHA)';
        for (let i = 0; i < 46; i++) {
            const x = rand() * W;
            const h = H * (0.03 + Math.pow(rand(), 2.2) * 0.16);
            drawTower(f, rand, x, horizon + 4, W * (0.008 + rand() * 0.02), h, farBody, farLight, Math.round(h / 6));
        }

        // Les grandes flèches au centre (comme sur la maquette), et leurs balises
        const mid = layer(W, H);
        const m = mid.getContext('2d');
        const midBody = rgb(mix(middle, [4, 8, 18], 0.65));
        const midLight = 'rgba(90, 220, 255, ALPHA)';
        [[0.52, 0.34, 0.034], [0.555, 0.24, 0.026], [0.71, 0.4, 0.04], [0.74, 0.27, 0.024], [0.44, 0.17, 0.02], [0.82, 0.19, 0.022]]
            .forEach(([x, h, w]) => {
                const tip = drawTower(m, rand, W * x, horizon + 8, W * w, H * h, midBody, midLight, Math.round(H * h / 2.5));
                beacons.push({ x: tip[0], y: tip[1], phase: rand() * 6, layer: 'mid' });
            });

        // Plateforme flottante (la cité dans le ciel)
        const island = layer(Math.round(W * 0.2), Math.round(H * 0.24));
        const iw = island.width;
        const ih = island.height;
        const isl = island.getContext('2d');
        const islandBody = rgb(mix(middle, [4, 8, 18], 0.55));
        for (let i = 0; i < 9; i++) {
            const x = iw * (0.25 + rand() * 0.5);
            drawTower(isl, rand, x, ih * 0.62, iw * (0.04 + rand() * 0.05), ih * (0.12 + rand() * 0.38), islandBody, midLight, 14);
        }
        isl.fillStyle = islandBody;
        isl.beginPath();
        isl.ellipse(iw / 2, ih * 0.62, iw * 0.36, ih * 0.05, 0, 0, Math.PI * 2);
        isl.fill();
        isl.beginPath();
        isl.moveTo(iw * 0.18, ih * 0.62);
        isl.quadraticCurveTo(iw * 0.5, ih * 1.05, iw * 0.82, ih * 0.62);
        isl.fill();
        isl.strokeStyle = 'rgba(90, 220, 255, 0.5)';
        isl.lineWidth = 1.2;
        isl.beginPath();
        isl.ellipse(iw / 2, ih * 0.63, iw * 0.37, ih * 0.05, 0, 0, Math.PI);
        isl.stroke();
        layers.islandPos = { x: W * 0.36, y: H * 0.17 };

        // Premier plan : grandes structures sombres sur les bords, qui encadrent la scène
        const near = layer(W, H);
        const n = near.getContext('2d');
        const nearBody = rgb(mix(top, [0, 0, 0], 0.4));
        const nearLight = 'rgba(80, 210, 255, ALPHA)';
        [[0.02, 0.62, 0.1], [0.12, 0.44, 0.06], [0.95, 0.66, 0.11], [0.86, 0.38, 0.05]].forEach(([x, h, w]) => {
            const tip = drawTower(n, rand, W * x, H + 10, W * w, H * h, nearBody, nearLight, Math.round(H * h / 1.6));
            beacons.push({ x: tip[0], y: tip[1], phase: rand() * 6, layer: 'near' });
        });

        // Mer de nuages sous l'horizon
        const ground = layer(W, H);
        const gr = ground.getContext('2d');
        const sea = gr.createLinearGradient(0, horizon, 0, H);
        sea.addColorStop(0, rgba(mix(horizonColor, middle, 0.3), 0.95));
        sea.addColorStop(0.4, rgb(mix(middle, top, 0.5)));
        sea.addColorStop(1, rgb(top));
        gr.fillStyle = sea;
        gr.fillRect(0, horizon, W, H - horizon);
        const reflect = gr.createRadialGradient(W * 0.64, horizon, 0, W * 0.64, horizon, W * 0.3);
        reflect.addColorStop(0, rgba(glowColor, glowStrength * 0.5));
        reflect.addColorStop(1, rgba(glowColor, 0));
        gr.fillStyle = reflect;
        gr.fillRect(0, horizon, W, H - horizon);

        // Bancs de brume qui dérivent
        const puff = layer(512, 160);
        const pf = puff.getContext('2d');
        const puffGradient = pf.createRadialGradient(256, 80, 0, 256, 80, 256);
        const fogColor = mix(horizonColor, [200, 220, 255], 0.25);
        puffGradient.addColorStop(0, rgba(fogColor, 0.5));
        puffGradient.addColorStop(1, rgba(fogColor, 0));
        pf.setTransform(1, 0, 0, 0.31, 0, 55);
        pf.fillStyle = puffGradient;
        pf.fillRect(0, 0, 512, 512);
        fogs = Array.from({ length: 9 }, (_, i) => ({
            x: rand() * W,
            y: horizon - H * 0.02 + rand() * H * 0.22,
            w: W * (0.35 + rand() * 0.4),
            speed: (4 + rand() * 9) * (i % 2 ? 1 : -1),
            alpha: 0.25 + rand() * 0.35
        }));

        layers = { ...layers, sky, planet, far, mid, island, near, ground, puff, horizon };
    }

    let shooting = null;
    let nextShooting = performance.now() + 6000;

    function frame(now) {
        const t = now / 1000;
        mouse.x += (mouse.tx - mouse.x) * 0.04;
        mouse.y += (mouse.ty - mouse.y) * 0.04;
        const shift = depth => [-mouse.x * depth, -mouse.y * depth * 0.5];

        ctx.drawImage(layers.sky, 0, 0, W, H);

        // Étoiles, visibles la nuit
        const starAlpha = Math.max(0, moment.night - 0.15);
        if (starAlpha > 0) {
            const [sx, sy] = shift(3);
            for (const star of stars) {
                const a = starAlpha * (0.45 + 0.55 * Math.sin(t * star.speed + star.phase) ** 2);
                ctx.fillStyle = `rgba(220, 235, 255, ${a.toFixed(3)})`;
                ctx.fillRect(star.x + sx, star.y + sy, star.r, star.r);
            }
        }

        // Étoile filante de temps en temps
        if (!shooting && now > nextShooting && moment.night > 0.5) {
            shooting = { x: W * (0.2 + Math.random() * 0.6), y: H * Math.random() * 0.25, start: now };
        }
        if (shooting) {
            const k = (now - shooting.start) / 900;
            if (k >= 1) {
                shooting = null;
                nextShooting = now + 9000 + Math.random() * 20000;
            } else {
                const x = shooting.x + k * W * 0.18;
                const y = shooting.y + k * H * 0.08;
                const trail = ctx.createLinearGradient(x, y, x - W * 0.06, y - H * 0.027);
                trail.addColorStop(0, `rgba(230, 245, 255, ${(1 - k) * 0.9})`);
                trail.addColorStop(1, 'rgba(230, 245, 255, 0)');
                ctx.strokeStyle = trail;
                ctx.lineWidth = 1.4;
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(x - W * 0.06, y - H * 0.027);
                ctx.stroke();
            }
        }

        let [x, y] = shift(6);
        ctx.drawImage(layers.planet, x, y, W, H);

        // La cité flottante monte et descend doucement
        [x, y] = shift(10);
        const bob = Math.sin(t * 0.4) * H * 0.008;
        ctx.drawImage(layers.island, layers.islandPos.x + x, layers.islandPos.y + y + bob);
        const ring = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
        ctx.save();
        ctx.translate(layers.islandPos.x + x + layers.island.width / 2, layers.islandPos.y + y + bob + layers.island.height * 0.68);
        ctx.scale(layers.island.width * 0.32, layers.island.height * 0.1);
        ring.addColorStop(0, `rgba(80, 220, 255, ${0.28 + Math.sin(t * 1.3) * 0.08})`);
        ring.addColorStop(1, 'rgba(80, 220, 255, 0)');
        ctx.fillStyle = ring;
        ctx.fillRect(-1, -1, 2, 2);
        ctx.restore();

        [x, y] = shift(12);
        ctx.drawImage(layers.far, x, y, W, H);
        ctx.drawImage(layers.ground, x * 1.2, y * 1.2, W, H);

        [x, y] = shift(18);
        ctx.drawImage(layers.mid, x, y, W, H);

        // Brume
        for (const fog of fogs) {
            fog.x += fog.speed / 60;
            if (fog.x > W + fog.w / 2) fog.x = -fog.w / 2;
            if (fog.x < -fog.w / 2) fog.x = W + fog.w / 2;
            ctx.globalAlpha = fog.alpha;
            ctx.drawImage(layers.puff, fog.x - fog.w / 2 + x, fog.y + y, fog.w, fog.w * 0.31);
        }
        ctx.globalAlpha = 1;

        [x, y] = shift(30);
        ctx.drawImage(layers.near, x, y, W, H);

        // Balises au sommet des tours
        for (const beacon of beacons) {
            const [bx, by] = beacon.layer === 'near' ? [x, y] : shift(18);
            const a = Math.max(0, Math.sin(t * 1.6 + beacon.phase)) ** 6;
            if (a < 0.02) continue;
            const halo = ctx.createRadialGradient(beacon.x + bx, beacon.y + by, 0, beacon.x + bx, beacon.y + by, 9);
            halo.addColorStop(0, `rgba(255, 90, 90, ${a})`);
            halo.addColorStop(1, 'rgba(255, 90, 90, 0)');
            ctx.fillStyle = halo;
            ctx.fillRect(beacon.x + bx - 9, beacon.y + by - 9, 18, 18);
        }
    }

    // 30 images par seconde suffisent pour un décor (12 en mode léger),
    // et on s'arrête quand la page est cachée
    const interval = window.ui.light ? 83 : 33;
    let last = 0;
    function loop(now) {
        requestAnimationFrame(loop);
        if (document.hidden || now - last < interval) return;
        last = now;
        frame(now);
    }

    build();
    requestAnimationFrame(loop);
    window.addEventListener('resize', build);

    // Le ciel change avec l'heure : on le redessine toutes les 5 minutes
    setInterval(build, 5 * 60 * 1000);

    window.sky = { rebuild: build, moment: () => moment };
})();
