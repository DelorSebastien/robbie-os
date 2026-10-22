// Rendu animé du visage du robot (canvas + ressorts physiques)
(() => {
    const canvas = document.getElementById('face');
    const ctx = canvas.getContext('2d');

    // Calque intermédiaire : chaque œil y est dessiné puis découpé par ses paupières
    const layer = document.createElement('canvas');
    const lctx = layer.getContext('2d');

    let width = 0;
    let height = 0;
    let dpr = 1;

    // Le visage est dessiné pour 400 × 250 puis agrandi avec son canvas
    // (la fenêtre de Robbie, ou un cadre plus grand pendant la visite guidée)
    function resize() {
        const boxWidth = canvas.clientWidth || window.innerWidth;
        const boxHeight = canvas.clientHeight || window.innerHeight;
        const zoom = Math.max(0.5, Math.min(boxWidth / 400, boxHeight / 250));

        dpr = (window.devicePixelRatio || 1) * zoom;
        width = boxWidth / zoom;
        height = boxHeight / zoom;

        [canvas, layer].forEach(c => {
            c.width = Math.round(width * dpr);
            c.height = Math.round(height * dpr);
        });
    }

    new ResizeObserver(resize).observe(canvas);
    resize();

    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    const rand = (min, max) => min + Math.random() * (max - min);


    // Ressort amorti : mouvements souples avec un léger rebond
    class Spring {
        constructor(value, stiffness = 170, damping = 16) {
            this.value = value;
            this.target = value;
            this.velocity = 0;
            this.stiffness = stiffness;
            this.damping = damping;
        }

        update(dt) {
            const force = (this.target - this.value) * this.stiffness - this.velocity * this.damping;
            this.velocity += force * dt;
            this.value += this.velocity * dt;
        }
    }

    const springs = [];

    function spring(value, stiffness, damping) {
        const s = new Spring(value, stiffness, damping);
        springs.push(s);
        return s;
    }


    // Forme de base d'un œil
    const NEUTRAL = {
        w: 70, h: 92, r: 24,
        lidTop: 0, lidAngle: 0, lidBottom: 0,
        x: 0, y: 0, scale: 1
    };

    // Expressions :
    // - both / left / right : réglages communs ou propres à chaque œil
    //   (lidAngle positif = coin intérieur de la paupière abaissé)
    // - shape : forme de l'œil (rect, heart, star, spiral, laugh)
    // - gaze(t) : regard imposé, motion(t) : mouvement continu
    // - tremble : tremblement, blush : rougeurs, emit() : particules régulières
    const EXPRESSIONS = {
        neutral: { color: [56, 232, 255] },
        happy: {
            color: [80, 255, 200],
            both: { lidBottom: 0.66, w: 76, y: 2, scale: 1.06 }
        },
        sad: {
            color: [90, 140, 255],
            both: { lidTop: 0.32, lidAngle: -20, h: 84, y: 8 }
        },
        angry: {
            color: [255, 70, 60],
            tremble: 0.8,
            both: { lidTop: 0.38, lidAngle: 24, w: 74, h: 82 }
        },
        shocked: {
            color: [200, 250, 255],
            both: { w: 80, h: 100, r: 40, scale: 1.15 }
        },
        curious: {
            color: [56, 232, 255],
            left: { scale: 0.82, lidTop: 0.4, lidAngle: -6, x: 10, y: 6 },
            right: { scale: 1.16, x: 12, y: -10 }
        },
        love: {
            color: [255, 90, 170],
            shape: 'heart',
            blush: 0.7,
            both: { w: 88, h: 84 },
            motion: t => ({ scale: 1 + heartbeat(t) }),
            emit: () => { floatHeart(); return rand(350, 650); }
        },
        tired: {
            color: [80, 170, 210],
            intensity: 0.75,
            spring: [60, 14],
            both: { lidTop: 0.5, lidAngle: -8, h: 84, y: 8 },
            gaze: () => ({ x: 0, y: 0.35 })
        },
        suspicious: {
            color: [190, 255, 90],
            both: { lidTop: 0.12, w: 78, h: 42, r: 14, y: 6 },
            right: { lidTop: 0.32, lidAngle: 10 },
            gaze: t => ({ x: Math.sin(t * 1.4) * 0.75, y: 0.1 })
        },
        shy: {
            color: [255, 140, 190],
            blush: 1,
            both: { lidBottom: 0.3, scale: 0.92 },
            gaze: () => ({ x: -0.75, y: 0.65 })
        },
        dizzy: {
            color: [190, 120, 255],
            shape: 'spiral',
            both: { w: 82, h: 82 },
            motion: t => ({ x: Math.sin(t * 3) * 7, y: Math.cos(t * 3) * 3 }),
            gaze: () => ({ x: 0, y: 0 })
        },
        proud: {
            color: [255, 200, 80],
            both: { lidTop: 0.48, lidAngle: -10, w: 76, h: 80, y: -4 },
            gaze: () => ({ x: 0, y: -0.4 }),
            emit: () => { twinkle(); return rand(500, 900); }
        },
        excited: {
            color: [255, 220, 90],
            shape: 'star',
            both: { w: 90, h: 90 },
            motion: t => ({ y: -Math.abs(Math.sin(t * 8)) * 6 }),
            emit: () => { twinkle(); twinkle(); return rand(250, 450); }
        },
        scared: {
            color: [170, 200, 255],
            tremble: 1.3,
            both: { w: 56, h: 72, r: 28, scale: 0.9, y: 6 },
            emit: () => { sweat(eyes[Math.random() < 0.5 ? 0 : 1]); return rand(700, 1100); }
        },
        mocking: {
            color: [120, 255, 140],
            left: { lidTop: 0.3, lidBottom: 0.45, lidAngle: 10 },
            right: { lidTop: 0.18, lidAngle: -8, scale: 1.05 },
            gaze: () => ({ x: 0.55, y: -0.1 }),
            motion: t => ({ y: -Math.abs(Math.sin(t * 10)) * 2.5 })
        },
        laughing: {
            color: [80, 255, 200],
            shape: 'laugh',
            both: { w: 60, h: 58 },
            motion: t => ({ y: -Math.abs(Math.sin(t * 13)) * 4 })
        },
        sleeping: {
            color: [40, 150, 190],
            intensity: 0.45,
            spring: [26, 10],
            both: { w: 74, h: 7, r: 4, y: 14 }
        }
    };


    // État des yeux (pos : -1 pour l'œil gauche, 1 pour l'œil droit)
    const eyes = [-1, 1].map(pos => {
        const params = {};
        for (const key in NEUTRAL) params[key] = spring(NEUTRAL[key]);

        return {
            pos, params,
            shape: 'rect', nextShape: null,
            blinkStart: 0, blinkDuration: 0,
            box: null
        };
    });

    const color = EXPRESSIONS.neutral.color.map(v => spring(v, 60, 14));
    const intensity = spring(0, 40, 12);
    const gaze = { x: spring(0, 260, 24), y: spring(0, 260, 24) };
    const approach = spring(0, 120, 16);
    const think = spring(0, 50, 14);
    const speak = spring(0, 60, 14);
    const blush = spring(0, 60, 14);

    // Position et taille des yeux quand un panneau d'information s'affiche
    const focus = { x: spring(0, 120, 16), y: spring(0, 120, 16), scale: spring(1, 120, 16) };
    const overlays = [];

    // Mode maître du jeu : capuche, yeux ambrés et braises
    const GM_COLOR = [255, 170, 60];
    const hood = spring(0, 40, 11);
    let gameMaster = false;
    let nextEmber = 0;

    // Danse sur la musique : balancement d'un côté à l'autre à chaque temps fort
    const sway = spring(0, 90, 9);
    let dancing = false;

    // Rêve pendant le sommeil : bulles de pensée
    let dreaming = false;
    let nextBubble = 0;

    // Accessoires saisonniers
    // Skin choisi dans les réglages : 'auto' (selon la date), 'none' ou un skin précis
    let skin = 'auto';

    // Couleur des yeux au repos (thème choisi dans les réglages)
    const EYE_COLORS = {
        cyan: [56, 232, 255],
        green: [80, 255, 140],
        pink: [255, 110, 200],
        gold: [255, 200, 70],
        purple: [170, 120, 255],
        white: [225, 240, 255]
    };
    let eyeColor = EYE_COLORS.cyan;
    let specialDay = '';
    let nextFestive = 0;

    // Les yeux descendent un peu pour laisser la place au chapeau
    const hatRoom = spring(0, 60, 12);

    // Tête de citrouille (Halloween) : lueur de bougie, apparition en fondu
    const CANDLE_COLOR = [255, 165, 45];
    const pumpkin = spring(0, 40, 11);

    let expression = 'neutral';
    let expressionTimer;
    let sleeping = false;
    let thinking = false;
    let speaking = false;
    let approaching = false;

    let gazeTarget = { x: 0, y: 0 };
    let micro = { x: 0, y: 0 };
    let nextMicro = 0;
    let nextZ = 0;
    let nextEmit = 0;
    let yawnStart = 0;

    let talk = 0;
    let lastPulse = 0;
    let listen = 0;
    let shake = 0;

    const particles = [];


    // Application d'une expression aux ressorts
    function applyExpression(name) {
        const preset = EXPRESSIONS[name];
        const [stiffness, damping] = preset.spring || [170, 16];
        const shape = preset.shape || 'rect';

        eyes.forEach(eye => {
            const values = {
                ...NEUTRAL,
                ...preset.both,
                ...(eye.pos < 0 ? preset.left : preset.right)
            };

            for (const key in values) {
                const s = eye.params[key];
                s.target = values[key];
                s.stiffness = stiffness;
                s.damping = damping;
            }

            // Changement de forme caché derrière un clignement
            if (shape !== (eye.nextShape || eye.shape)) {
                eye.nextShape = shape;
                eye.blinkStart = performance.now();
                eye.blinkDuration = 260;
            }
        });

        // Couleur au repos : ambre en maître du jeu, flamme de bougie en citrouille
        // (neutre et curieux prennent la couleur des yeux choisie)
        let base = name === 'neutral' || name === 'curious' ? eyeColor : preset.color;

        if (name === 'neutral' && gameMaster) {
            base = GM_COLOR;
        } else if (pumpkinActive()) {
            // En citrouille, les couleurs restent proches de la lueur de la bougie
            if (name === 'neutral') base = CANDLE_COLOR;
            else if (name === 'sleeping') base = [170, 80, 15];
            else base = preset.color.map((v, i) => Math.round((v + CANDLE_COLOR[i]) / 2));
        }
        color.forEach((s, i) => { s.target = base[i]; });
        intensity.target = preset.intensity ?? 1;
        blush.target = preset.blush ?? 0;
        nextEmit = 0;
    }

    // Petites réactions physiques au début d'une expression
    function react(name) {
        if (name === 'shocked') {
            shake = 1;
            eyes.forEach(eye => { eye.params.scale.velocity += 3; });
        }

        if (name === 'happy') {
            eyes.forEach(eye => { eye.params.y.velocity -= 160; });
            sparkle();
        }

        if (name === 'sad') {
            setTimeout(() => {
                if (expression === 'sad') tear(eyes[Math.random() < 0.5 ? 0 : 1]);
            }, 500);
        }

        if (name === 'curious') {
            eyes[1].params.scale.velocity += 2;
        }

        if (name === 'love') {
            eyes.forEach(eye => { eye.params.scale.velocity += 2.5; });
        }

        // Bâillement
        if (name === 'tired') {
            yawnStart = performance.now() + 300;
        }

        // Mouvement de recul
        if (name === 'scared') {
            shake = 0.6;
            eyes.forEach(eye => { eye.params.scale.velocity -= 3; });
        }

        if (name === 'excited') {
            eyes.forEach(eye => { eye.params.y.velocity -= 200; });
            sparkle();
        }

        // Larmes de rire
        if (name === 'laughing') {
            eyes.forEach(eye => { eye.params.y.velocity -= 120; });
            setTimeout(() => {
                if (expression === 'laughing') eyes.forEach(tear);
            }, 700);
        }
    }

    // Double battement de cœur
    function heartbeat(t) {
        const phase = t % 1;
        return Math.exp(-(((phase - 0.1) / 0.05) ** 2)) * 0.12 +
            Math.exp(-(((phase - 0.3) / 0.05) ** 2)) * 0.08;
    }


    // Particules : étincelles, larmes, sueur, cœurs et Z du sommeil
    function sparkle() {
        eyes.forEach(eye => {
            if (!eye.box) return;

            for (let i = 0; i < 3; i++) {
                const angle = rand(-Math.PI * 0.9, -Math.PI * 0.1);

                particles.push({
                    type: 'spark',
                    x: eye.box.x + Math.cos(angle) * eye.box.w * 0.75,
                    y: eye.box.y + Math.sin(angle) * eye.box.h * 0.6,
                    vx: 0, vy: -12,
                    size: rand(4, 8),
                    life: -i * 0.12,
                    max: rand(0.6, 0.9)
                });
            }
        });
    }

    // Une seule étincelle autour d'un œil
    function twinkle() {
        const eye = eyes[Math.random() < 0.5 ? 0 : 1];
        if (!eye.box) return;

        const angle = rand(-Math.PI, 0);

        particles.push({
            type: 'spark',
            x: eye.box.x + Math.cos(angle) * eye.box.w * rand(0.6, 0.9),
            y: eye.box.y + Math.sin(angle) * eye.box.h * rand(0.5, 0.8),
            vx: 0, vy: -8,
            size: rand(3, 7),
            life: 0,
            max: rand(0.5, 0.8)
        });
    }

    function tear(eye) {
        if (!eye.box) return;

        particles.push({
            type: 'tear',
            x: eye.box.x + eye.pos * eye.box.w * 0.28,
            y: eye.box.y + eye.box.h / 2 + 4,
            vx: 0, vy: 0, gravity: 320,
            size: 5,
            life: 0,
            max: 1.4
        });
    }

    // Goutte de sueur sur le côté de l'œil
    function sweat(eye) {
        if (!eye.box) return;

        particles.push({
            type: 'tear',
            x: eye.box.x + eye.pos * (eye.box.w / 2 + 8),
            y: eye.box.y - eye.box.h * 0.25,
            vx: 0, vy: 0, gravity: 140,
            size: 4,
            life: 0,
            max: 1.2
        });
    }

    function floatHeart() {
        const [left, right] = eyes.map(eye => eye.box);
        if (!left || !right) return;

        particles.push({
            type: 'heart',
            x: rand(left.x - left.w * 0.8, right.x + right.w * 0.8),
            y: Math.min(left.y, right.y) - rand(0, 30),
            vx: rand(-8, 8), vy: -35,
            size: rand(10, 16),
            life: 0,
            max: 1.6
        });
    }

    // Points d'interrogation quand Robbie pose une question
    function spawnQuestions() {
        eyes.forEach((eye, i) => {
            if (!eye.box) return;

            particles.push({
                type: 'question',
                x: eye.box.x + eye.pos * eye.box.w * 0.6,
                y: eye.box.y - eye.box.h * 0.55,
                vx: eye.pos * rand(4, 10), vy: rand(-28, -18),
                size: rand(16, 22) - i * 3,
                spin: eye.pos * rand(0.2, 0.4),
                life: -i * 0.25,
                max: 1.8
            });
        });
    }

    // Bulle de pensée qui monte pendant un rêve
    function spawnBubble() {
        const box = eyes[1].box;
        if (!box) return;

        particles.push({
            type: 'bubble',
            x: box.x + box.w * 0.5 + rand(-6, 6),
            y: box.y - 6,
            vx: rand(6, 14), vy: rand(-26, -18),
            size: rand(3, 9),
            life: 0,
            max: rand(2.4, 3.4)
        });
    }

    // Note de musique qui s'envole pendant la danse
    function spawnNote() {
        const eye = eyes[Math.random() < 0.5 ? 0 : 1];
        if (!eye.box) return;

        particles.push({
            type: 'note',
            x: eye.box.x + eye.pos * eye.box.w * rand(0.4, 0.8),
            y: eye.box.y - eye.box.h * 0.4,
            vx: eye.pos * rand(8, 18), vy: rand(-40, -25),
            size: rand(13, 19),
            life: 0,
            max: 1.6
        });
    }

    // Confettis de fête (Nouvel An, anniversaire)
    function spawnConfetti() {
        const colors = [[255, 90, 120], [255, 210, 80], [90, 220, 255], [140, 255, 140], [200, 130, 255]];

        for (let i = 0; i < 6; i++) {
            particles.push({
                type: 'confetti',
                x: rand(width * 0.15, width * 0.85),
                y: -6,
                vx: rand(-15, 15), vy: rand(30, 60), gravity: 20,
                size: rand(3, 5),
                spin: rand(-6, 6),
                life: -i * 0.15,
                max: rand(3, 4.5),
                color: colors[i % colors.length]
            });
        }
    }

    function spawnZ() {
        const box = eyes[1].box;
        if (!box) return;

        particles.push({
            type: 'z',
            x: box.x + box.w * 0.4,
            y: box.y - 8,
            vx: 12, vy: -20,
            size: 16,
            life: 0,
            max: 2.8
        });
    }


    // Clignement : fermeture rapide puis ouverture plus douce
    function blinkAmount(eye, now) {
        if (!eye.blinkStart) return 0;

        const p = (now - eye.blinkStart) / eye.blinkDuration;

        // La nouvelle forme apparaît quand l'œil est fermé
        if (p >= 0.4 && eye.nextShape) {
            eye.shape = eye.nextShape;
            eye.nextShape = null;
        }

        if (p >= 1) {
            eye.blinkStart = 0;
            return 0;
        }

        if (p < 0.4) return (p / 0.4) ** 2;
        return (1 - (p - 0.4) / 0.6) ** 3;
    }


    // Mise à jour de la physique
    function update(dt, now) {
        const t = now / 1000;
        const preset = EXPRESSIONS[expression];

        // Petits mouvements involontaires du regard
        if (now > nextMicro) {
            micro = { x: rand(-0.06, 0.06), y: rand(-0.05, 0.05) };
            nextMicro = now + rand(400, 2000);
        }

        let target = preset.gaze?.(t) ?? gazeTarget;
        if (thinking) target = { x: 0.55 + Math.sin(t * 0.9) * 0.2, y: -0.65 };
        if (sleeping) target = { x: 0, y: 0 };

        gaze.x.target = target.x + (sleeping ? 0 : micro.x);
        gaze.y.target = target.y + (sleeping ? 0 : micro.y);

        approach.target = approaching && !sleeping ? 1 : 0;
        think.target = thinking ? 1 : 0;
        speak.target = speaking ? 1 : 0;

        // Syllabes simulées si la voix ne fournit ni mots ni volume
        if (speaking && now - lastPulse > 300 && Math.random() < dt * 7) {
            talk = Math.max(talk, rand(0.4, 1));
        }

        talk *= Math.exp(-dt * 7);
        listen *= Math.exp(-dt * 2.5);
        shake *= Math.exp(-dt * 6);

        // Intégration des ressorts par petits pas pour rester stable
        const steps = Math.ceil(dt / (1 / 120));
        for (let i = 0; i < steps; i++) {
            springs.forEach(s => s.update(dt / steps));
        }

        // Particules régulières de l'expression
        if (preset.emit && now > nextEmit) {
            nextEmit = now + preset.emit();
        }

        // Braises qui s'élèvent en mode maître du jeu
        hood.target = gameMaster ? 1 : 0;

        if (gameMaster && !sleeping && now > nextEmber) {
            particles.push({
                type: 'ember',
                x: rand(width * 0.1, width * 0.9),
                y: height + 4,
                vx: rand(-6, 6), vy: rand(-55, -30),
                size: rand(1.2, 2.6),
                life: 0,
                max: rand(2.5, 4.5),
                color: [255, Math.round(rand(110, 190)), 40]
            });

            nextEmber = now + rand(120, 320);
        }

        // Z du sommeil, ou bulles de pensée quand il rêve
        if (sleeping && now > nextZ) {
            spawnZ();
            nextZ = now + rand(1400, 2000) * (dreaming ? 2 : 1);
        }

        if (sleeping && dreaming && now > nextBubble) {
            spawnBubble();
            nextBubble = now + rand(350, 700);
        }

        const hat = !gameMaster && ['santa', 'party'].includes(currentAccessory());
        hatRoom.target = hat ? 22 : 0;
        pumpkin.target = pumpkinActive() ? 1 : 0;

        // Particules des jours de fête
        const festive = !sleeping ? currentAccessory() : '';

        if (festive && now > nextFestive) {
            if (festive === 'party') spawnConfetti();
            if (festive === 'valentine') floatHeart();
            nextFestive = now + rand(5000, 9000);
        }

        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.life += dt;

            if (p.life > p.max) {
                particles.splice(i, 1);
                continue;
            }

            // La larme se forme avant de tomber
            if (p.type === 'tear' && p.life < 0.35) continue;

            p.vy += (p.gravity || 0) * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
        }
    }


    // Tracés des formes spéciales, centrés sur (0, 0)
    function heartPath(c, w, h) {
        c.beginPath();
        c.moveTo(0, h * 0.5);
        c.bezierCurveTo(-w * 0.1, h * 0.35, -w * 0.5, h * 0.1, -w * 0.5, -h * 0.18);
        c.bezierCurveTo(-w * 0.5, -h * 0.45, -w * 0.2, -h * 0.55, 0, -h * 0.3);
        c.bezierCurveTo(w * 0.2, -h * 0.55, w * 0.5, -h * 0.45, w * 0.5, -h * 0.18);
        c.bezierCurveTo(w * 0.5, h * 0.1, w * 0.1, h * 0.35, 0, h * 0.5);
        c.closePath();
    }

    function starPath(c, w, h, rotation) {
        c.beginPath();

        for (let i = 0; i < 10; i++) {
            const k = i % 2 ? 0.48 : 1;
            const angle = rotation - Math.PI / 2 + i * Math.PI / 5;
            c.lineTo(Math.cos(angle) * k * w / 2, Math.sin(angle) * k * h / 2);
        }

        c.closePath();
    }

    function spiralPath(c, w, h, rotation) {
        c.beginPath();

        for (let i = 0; i <= 80; i++) {
            const u = i / 80;
            const angle = u * 2.6 * Math.PI * 2 + rotation;
            c.lineTo(Math.cos(angle) * u * w / 2, Math.sin(angle) * u * h / 2);
        }
    }

    // Chevron « > » pour l'œil gauche, « < » pour l'œil droit
    function laughPath(c, w, h, pos) {
        const dir = -pos;

        c.beginPath();
        c.moveTo(-dir * w * 0.32, -h * 0.4);
        c.lineTo(dir * w * 0.32, 0);
        c.lineTo(-dir * w * 0.32, h * 0.4);
    }


    // Dessin d'un œil : forme lumineuse découpée par les paupières
    function drawEye(eye, x, y, w, h, radius, lidTop, lidAngle, lidBottom, rgb, glow, t) {
        lctx.setTransform(1, 0, 0, 1, 0, 0);
        lctx.globalCompositeOperation = 'source-over';
        lctx.clearRect(0, 0, layer.width, layer.height);
        lctx.setTransform(dpr, 0, 0, dpr, x * dpr, y * dpr);

        // Dégradé vertical, plus clair en haut
        const light = rgb.map(v => Math.round(v + (255 - v) * 0.45));
        const gradient = lctx.createLinearGradient(0, -h / 2, 0, h / 2);

        gradient.addColorStop(0, `rgb(${light})`);
        gradient.addColorStop(1, `rgb(${rgb})`);

        lctx.fillStyle = lctx.strokeStyle = gradient;
        lctx.lineCap = lctx.lineJoin = 'round';

        const line = Math.max(2, Math.min(w, h));

        if (eye.shape === 'heart') {
            heartPath(lctx, w, h);
            lctx.fill();
        } else if (eye.shape === 'star') {
            starPath(lctx, w, h, Math.sin(t * 3) * 0.15);
            lctx.lineWidth = line * 0.08;
            lctx.fill();
            lctx.stroke();
        } else if (eye.shape === 'spiral') {
            spiralPath(lctx, w, h, -t * 5 * eye.pos);
            lctx.lineWidth = line * 0.1;
            lctx.stroke();
        } else if (eye.shape === 'laugh') {
            laughPath(lctx, w, h, eye.pos);
            lctx.lineWidth = line * 0.2;
            lctx.stroke();
        } else {
            lctx.beginPath();
            lctx.roundRect(-w / 2, -h / 2, w, h, radius);
            lctx.fill();
        }

        // Reflets
        const shine = clamp((h - 10) / 30, 0, 1) * 0.5;

        if (shine > 0 && (eye.shape === 'rect' || eye.shape === 'heart')) {
            lctx.fillStyle = `rgba(255, 255, 255, ${shine})`;
            lctx.beginPath();
            lctx.ellipse(-w * 0.2, -h * 0.24, w * 0.12, h * 0.09, -0.5, 0, Math.PI * 2);
            lctx.ellipse(-w * 0.04, -h * 0.34, w * 0.04, h * 0.03, 0, 0, Math.PI * 2);
            lctx.fill();
        }

        // Paupières (gommées dans le calque)
        lctx.globalCompositeOperation = 'destination-out';
        lctx.fillStyle = '#000';

        if (lidTop > 0.005) {
            lctx.save();
            lctx.translate(0, -h / 2 + lidTop * h);
            lctx.rotate(lidAngle);
            lctx.fillRect(-w * 1.5, -h * 2, w * 3, h * 2);
            lctx.restore();
        }

        if (lidBottom > 0.005) {
            const ry = h * 0.55;

            lctx.beginPath();
            lctx.ellipse(0, h / 2 - lidBottom * h + ry, w * 0.65, ry, 0, 0, Math.PI * 2);
            lctx.fill();
        }

        // Composition avec un double halo lumineux
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = clamp(glow, 0, 1);
        ctx.shadowColor = `rgba(${rgb}, 0.9)`;
        ctx.shadowBlur = 36 * dpr * glow;
        ctx.drawImage(layer, 0, 0);
        ctx.shadowBlur = 12 * dpr;
        ctx.drawImage(layer, 0, 0);
        ctx.restore();
    }

    // Capuche de conteur qui descend du haut de l'écran
    function drawHood(cx, cy, t) {
        const k = hood.value;
        if (k < 0.01) return;

        const sway = Math.sin(t * 0.8) * 2;

        ctx.save();
        ctx.translate(0, (1 - k) * -height * 1.1);

        // Étoffe
        const cloth = ctx.createLinearGradient(0, cy - 120, 0, height);
        cloth.addColorStop(0, '#3b2414');
        cloth.addColorStop(0.5, '#24150b');
        cloth.addColorStop(1, '#0d0704');

        ctx.fillStyle = cloth;
        ctx.beginPath();
        ctx.moveTo(cx + sway, cy - 118);
        ctx.bezierCurveTo(cx + 120, cy - 108, cx + 178, cy - 20, cx + 196, height + 10);
        ctx.lineTo(cx - 196, height + 10);
        ctx.bezierCurveTo(cx - 178, cy - 20, cx - 120, cy - 108, cx + sway, cy - 118);
        ctx.fill();

        // Plis du tissu
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx + sway, cy - 112);
        ctx.quadraticCurveTo(cx - 60, cy - 70, cx - 150, height);
        ctx.moveTo(cx + sway, cy - 112);
        ctx.quadraticCurveTo(cx + 60, cy - 70, cx + 150, height);
        ctx.stroke();

        // Ouverture sombre autour du visage
        const shadow = ctx.createRadialGradient(cx, cy + 10, 40, cx, cy + 10, 160);
        shadow.addColorStop(0, '#000');
        shadow.addColorStop(0.85, '#050302');
        shadow.addColorStop(1, '#1a0f07');

        ctx.fillStyle = shadow;
        ctx.beginPath();
        ctx.ellipse(cx, cy + 12, 150, 96, 0, 0, Math.PI * 2);
        ctx.fill();

        // Bord éclairé par la lueur des yeux
        ctx.strokeStyle = `rgba(255, 150, 60, ${0.35 * k})`;
        ctx.shadowColor = 'rgba(255, 140, 50, 0.8)';
        ctx.shadowBlur = 10 * dpr;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy + 12, 150, 96, 0, Math.PI * 1.08, Math.PI * 1.92);
        ctx.stroke();

        ctx.restore();
    }

    // Accessoire du jour : anniversaire, sinon selon la date
    function currentAccessory() {
        if (skin === 'none') return '';
        if (skin !== 'auto') return skin;
        if (specialDay === 'birthday') return 'party';

        const date = new Date();
        const month = date.getMonth() + 1;
        const day = date.getDate();

        if ((month === 10 && day >= 15) || (month === 11 && day <= 2)) return 'pumpkin';
        if (month === 12 && day >= 30 || month === 1 && day <= 2) return 'party';
        if (month === 12) return 'santa';
        if (month === 2 && day >= 13 && day <= 15) return 'valentine';
        return '';
    }

    function pumpkinActive() {
        return !gameMaster && currentAccessory() === 'pumpkin';
    }

    // Trait néon : halo coloré puis cœur clair, comme un tube lumineux
    function neonStroke(rgb, width, glow, alpha = 1) {
        ctx.globalAlpha = alpha;
        ctx.shadowColor = `rgba(${rgb}, 0.9)`;
        ctx.shadowBlur = 16 * dpr * glow;
        ctx.strokeStyle = `rgb(${rgb})`;
        ctx.lineWidth = width;
        ctx.stroke();

        ctx.shadowBlur = 4 * dpr;
        ctx.strokeStyle = `rgb(${rgb.map(v => Math.round(v + (255 - v) * 0.65))})`;
        ctx.lineWidth = width * 0.35;
        ctx.stroke();
    }

    // Citrouille néon : contour bosselé, côtes, tige et vrille
    function drawPumpkin(x, y, scale, t, glow) {
        const k = pumpkin.value;
        if (k < 0.01) return;

        const w = 168 * scale;
        const h = 106 * scale;
        const breath = 1 + Math.sin(t * 1.7) * 0.008;
        const orange = [255, 130, 25];
        const green = [130, 230, 90];

        // Creux entre les côtes, en haut et en bas de la silhouette
        const dips = [-0.58, 0.58];
        const dip = u => dips.reduce((sum, d) => sum + Math.exp(-(((u - d) / 0.09) ** 2)), 0);

        ctx.save();
        ctx.translate(x, y + (1 - k) * 20);
        ctx.scale(breath, breath);
        ctx.globalAlpha = Math.min(1, k);
        ctx.lineCap = ctx.lineJoin = 'round';

        // Contour
        ctx.beginPath();

        for (let i = 0; i <= 120; i++) {
            const angle = (i / 120) * Math.PI * 2;
            const u = Math.cos(angle);
            const top = Math.sin(angle) < 0;
            const stem = top ? Math.exp(-((u / 0.1) ** 2)) * 0.08 : 0;
            // (forme arrondie plutôt qu'ovale : côtés bien pleins)
            const sx = Math.sign(u) * Math.abs(u) ** 0.7;
            const sy = Math.sign(Math.sin(angle)) * Math.abs(Math.sin(angle)) ** 0.85;
            const px = sx * w;
            const py = sy * h * (1 - dip(sx) * 0.08 - stem);

            if (i) ctx.lineTo(px, py);
            else ctx.moveTo(px, py);
        }

        ctx.closePath();
        neonStroke(orange, 3.2 * scale, glow, Math.min(1, k));

        // Côtes intérieures, plus discrètes
        dips.forEach(d => {
            ctx.beginPath();
            ctx.moveTo(d * w, -h * 0.88);
            ctx.quadraticCurveTo(d * w * 1.18, 0, d * w, h * 0.88);
            neonStroke(orange, 2 * scale, glow * 0.7, 0.35 * Math.min(1, k));
        });

        // Tige et vrille
        ctx.beginPath();
        ctx.moveTo(-w * 0.04, -h * 0.92);
        ctx.quadraticCurveTo(-w * 0.03, -h * 1.1, w * 0.05, -h * 1.18);
        neonStroke(green, 3 * scale, glow, Math.min(1, k));

        ctx.beginPath();
        for (let i = 0; i <= 30; i++) {
            const a = i / 30 * Math.PI * 3;
            const r = (1 - i / 30) * w * 0.05 + w * 0.012;
            const px = -w * 0.12 + Math.cos(a) * r;
            const py = -h * 1.0 + Math.sin(a) * r * 0.8;

            if (i) ctx.lineTo(px, py);
            else ctx.moveTo(px, py);
        }
        neonStroke(green, 1.8 * scale, glow * 0.8, 0.8 * Math.min(1, k));

        ctx.restore();
    }

    // Sourire néon qui s'ouvre quand Robbie parle
    function drawMouth(x, y, scale, rgb, glow) {
        const k = pumpkin.value;
        if (k < 0.01) return;

        const open = sleeping ? 0.15 : 0.35 + talk * speak.value * 0.9 + listen * 0.15;
        const w = 70 * scale;
        const depth = 26 * scale * open;
        const tooth = 7 * scale;

        ctx.save();
        ctx.translate(x, y);
        ctx.lineCap = ctx.lineJoin = 'round';

        // Lèvre du haut avec deux dents, lèvre du bas en sourire
        ctx.beginPath();
        ctx.moveTo(-w, -10 * scale);
        ctx.quadraticCurveTo(-w * 0.55, 0, -w * 0.3, 0);
        ctx.lineTo(-w * 0.3, tooth);
        ctx.lineTo(-w * 0.12, tooth);
        ctx.lineTo(-w * 0.12, 0);
        ctx.lineTo(w * 0.12, 0);
        ctx.lineTo(w * 0.12, tooth);
        ctx.lineTo(w * 0.3, tooth);
        ctx.lineTo(w * 0.3, 0);
        ctx.quadraticCurveTo(w * 0.55, 0, w, -10 * scale);
        ctx.quadraticCurveTo(w * 0.6, depth + 8 * scale, 0, depth + 8 * scale);
        ctx.quadraticCurveTo(-w * 0.6, depth + 8 * scale, -w, -10 * scale);
        ctx.closePath();

        neonStroke(rgb, 3 * scale, glow, Math.min(1, k) * clamp(glow, 0, 1));
        ctx.restore();
    }

    // Chapeau posé sur la « tête » : centré au-dessus des deux yeux, il suit leurs mouvements
    function drawHat(kind, head, t, rgb) {
        const { x, top, span } = head;

        // Taille adaptée à la place disponible au-dessus des yeux
        const brim = span * 1.02;
        const room = Math.max(34, top - 14);

        ctx.save();
        ctx.translate(x, top - 3);
        ctx.rotate(Math.sin(t * 1.2) * 0.025 + head.tilt);
        ctx.shadowBlur = 0;

        if (kind === 'santa') {
            const h = Math.min(brim * 0.5, room);
            const base = brim * 0.72;

            // Bonnet rouge qui retombe sur le côté
            const cloth = ctx.createLinearGradient(-base / 2, -h, base / 2, 0);
            cloth.addColorStop(0, '#ff3b3b');
            cloth.addColorStop(1, '#b3121c');

            ctx.fillStyle = cloth;
            ctx.beginPath();
            ctx.moveTo(-base / 2, -h * 0.12);
            ctx.bezierCurveTo(-base * 0.45, -h * 0.9, base * 0.15, -h * 1.05, base * 0.55, -h * 0.55);
            ctx.quadraticCurveTo(base * 0.62, -h * 0.4, base * 0.6, -h * 0.3);
            ctx.quadraticCurveTo(base * 0.4, -h * 0.55, base * 0.25, -h * 0.5);
            ctx.quadraticCurveTo(base * 0.45, -h * 0.3, base / 2, -h * 0.12);
            ctx.closePath();
            ctx.fill();

            // Bordure en fourrure et pompon
            const fur = ctx.createLinearGradient(0, -h * 0.25, 0, h * 0.05);
            fur.addColorStop(0, '#ffffff');
            fur.addColorStop(1, '#d9dde3');

            ctx.fillStyle = fur;
            ctx.beginPath();
            ctx.roundRect(-base * 0.56, -h * 0.26, base * 1.12, h * 0.28, h * 0.14);
            ctx.fill();

            ctx.beginPath();
            ctx.arc(base * 0.6, -h * 0.28, h * 0.13, 0, Math.PI * 2);
            ctx.fill();
        }

        if (kind === 'party') {
            const h = Math.min(brim * 0.5, room);
            const base = brim * 0.28;

            ctx.save();
            ctx.rotate(0.12);

            ctx.beginPath();
            ctx.moveTo(-base / 2, 0);
            ctx.lineTo(0, -h);
            ctx.lineTo(base / 2, 0);
            ctx.closePath();
            ctx.save();
            ctx.clip();

            // Rayures en diagonale
            for (let i = -6; i < 12; i++) {
                ctx.fillStyle = i % 2 ? '#ffd23f' : '#ff4f8b';
                ctx.beginPath();
                ctx.moveTo(-base, -i * h / 8);
                ctx.lineTo(base, -i * h / 8 - h / 4);
                ctx.lineTo(base, -(i + 1) * h / 8 - h / 4);
                ctx.lineTo(-base, -(i + 1) * h / 8);
                ctx.fill();
            }

            ctx.restore();

            ctx.fillStyle = '#5ce1ff';
            ctx.beginPath();
            ctx.arc(0, -h, Math.max(3, h * 0.11), 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // Reflet de la lueur des yeux sous le bord
        ctx.strokeStyle = `rgba(${rgb}, 0.45)`;
        ctx.shadowColor = `rgba(${rgb}, 0.8)`;
        ctx.shadowBlur = 8 * dpr;
        ctx.lineWidth = 1.5;
        ctx.beginPath();

        if (kind === 'santa') {
            const h = Math.min(brim * 0.5, room);
            ctx.moveTo(-brim * 0.36, h * 0.02);
            ctx.lineTo(brim * 0.36, h * 0.02);
        }

        ctx.stroke();
        ctx.restore();
    }

    function drawAccessory(t, rgb) {
        const kind = currentAccessory();
        if (!['santa', 'party'].includes(kind)) return;

        const [a, b] = eyes.map(eye => eye.box);
        if (!a || !b) return;

        const left = Math.min(a.x - a.w / 2, b.x - b.w / 2);
        const right = Math.max(a.x + a.w / 2, b.x + b.w / 2);

        drawHat(kind, {
            x: (left + right) / 2,
            top: Math.min(a.y - a.h / 2, b.y - b.h / 2),
            span: right - left,
            // Le chapeau penche quand un œil est plus haut que l'autre
            tilt: clamp((b.y - b.h / 2 - (a.y - a.h / 2)) * 0.006, -0.2, 0.2)
        }, t, rgb);
    }

    // Rougeurs sous les yeux
    function drawBlush(glow) {
        if (blush.value < 0.01) return;

        ctx.save();
        ctx.globalAlpha = clamp(blush.value * glow, 0, 1);
        ctx.fillStyle = 'rgba(255, 110, 160, 0.45)';
        ctx.strokeStyle = 'rgba(255, 170, 200, 0.7)';
        ctx.shadowColor = 'rgba(255, 110, 160, 0.8)';
        ctx.shadowBlur = 14 * dpr;
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';

        eyes.forEach(eye => {
            const box = eye.box;
            if (!box) return;

            const bx = box.x + eye.pos * box.w * 0.25;
            const by = box.y + Math.max(box.h / 2, 20) + 10;

            ctx.beginPath();
            ctx.ellipse(bx, by, 17, 6, 0, 0, Math.PI * 2);
            ctx.fill();

            // Petits traits façon dessin animé
            ctx.beginPath();
            for (let i = -1; i <= 1; i++) {
                ctx.moveTo(bx + i * 7 - 2, by + 3);
                ctx.lineTo(bx + i * 7 + 2, by - 3);
            }
            ctx.stroke();
        });

        ctx.restore();
    }

    function drawParticles(rgb) {
        ctx.save();
        ctx.fillStyle = `rgb(${rgb})`;
        ctx.shadowColor = `rgb(${rgb})`;
        ctx.shadowBlur = 12 * dpr;
        ctx.textAlign = 'center';

        particles.forEach(p => {
            if (p.life < 0) return;

            const k = p.life / p.max;

            if (p.type === 'z') {
                ctx.globalAlpha = Math.min(1, p.life / 0.3) * (1 - k) * 0.8;
                ctx.font = `600 ${p.size * (0.6 + k * 0.8)}px "Segoe UI", sans-serif`;
                ctx.fillText('Z', p.x + Math.sin(p.life * 2.5) * 6, p.y);
            }

            if (p.type === 'tear') {
                const s = p.size * Math.min(1, p.life / 0.35);

                ctx.globalAlpha = k > 0.75 ? (1 - k) / 0.25 : 1;
                ctx.beginPath();
                ctx.moveTo(p.x, p.y - s * 2);
                ctx.bezierCurveTo(p.x + s * 0.4, p.y - s, p.x + s, p.y - s * 0.4, p.x + s, p.y);
                ctx.arc(p.x, p.y, s, 0, Math.PI);
                ctx.bezierCurveTo(p.x - s, p.y - s * 0.4, p.x - s * 0.4, p.y - s, p.x, p.y - s * 2);
                ctx.fill();
            }

            if (p.type === 'spark') {
                const s = p.size * Math.sin(k * Math.PI);

                ctx.globalAlpha = 1;
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.life * 2);
                ctx.beginPath();
                ctx.moveTo(0, -s);
                ctx.quadraticCurveTo(0, 0, s, 0);
                ctx.quadraticCurveTo(0, 0, 0, s);
                ctx.quadraticCurveTo(0, 0, -s, 0);
                ctx.quadraticCurveTo(0, 0, 0, -s);
                ctx.fill();
                ctx.restore();
            }

            if (p.type === 'bubble') {
                ctx.globalAlpha = Math.min(1, p.life / 0.4) * (1 - k) * 0.85;
                ctx.lineWidth = 1.5;
                ctx.strokeStyle = `rgb(${rgb})`;
                ctx.beginPath();
                ctx.arc(p.x + Math.sin(p.life * 2) * 4, p.y, p.size * (0.6 + k * 0.6), 0, Math.PI * 2);
                ctx.stroke();
            }

            if (p.type === 'note') {
                ctx.globalAlpha = Math.min(1, p.life / 0.2) * (1 - k);
                ctx.font = `700 ${p.size}px "Segoe UI Symbol", "Segoe UI", sans-serif`;
                ctx.fillText(p.size > 16 ? '♫' : '♪', p.x + Math.sin(p.life * 5) * 4, p.y);
            }

            if (p.type === 'confetti') {
                ctx.save();
                ctx.globalAlpha = Math.min(1, (p.max - p.life) / 0.6);
                ctx.fillStyle = ctx.shadowColor = `rgb(${p.color})`;
                ctx.translate(p.x + Math.sin(p.life * 3) * 10, p.y);
                ctx.rotate(p.life * p.spin);
                ctx.fillRect(-p.size / 2, -p.size, p.size, p.size * 2);
                ctx.restore();
            }

            if (p.type === 'question') {
                const pop = Math.min(1, p.life / 0.25);

                ctx.save();
                ctx.globalAlpha = pop * (1 - k);
                ctx.translate(p.x, p.y);
                ctx.rotate(Math.sin(p.life * 4) * p.spin);
                ctx.scale(0.6 + pop * 0.4, 0.6 + pop * 0.4);
                ctx.font = `700 ${p.size}px "Segoe UI", sans-serif`;
                ctx.textBaseline = 'middle';
                ctx.fillText('?', 0, 0);
                ctx.restore();
            }

            if (p.type === 'ember') {
                ctx.globalAlpha = Math.min(1, p.life / 0.4) * (1 - k) * hood.value;
                ctx.fillStyle = ctx.shadowColor = `rgb(${p.color})`;
                ctx.beginPath();
                ctx.arc(p.x + Math.sin(p.life * 2 + p.size * 3) * 8, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = ctx.shadowColor = `rgb(${rgb})`;
            }

            if (p.type === 'heart') {
                const s = p.size * (0.6 + Math.min(1, p.life / 0.3) * 0.4);

                ctx.globalAlpha = Math.min(1, p.life / 0.2) * (1 - k);
                ctx.save();
                ctx.translate(p.x + Math.sin(p.life * 3) * 5, p.y);
                heartPath(ctx, s, s);
                ctx.fill();
                ctx.restore();
            }
        });

        ctx.restore();
    }

    // Onde vocale (parole / écoute) et points de réflexion
    function drawVoice(t, rgb, cx, y) {
        // (en citrouille, c'est la bouche qui s'anime à la place de l'onde)
        const wave = Math.max(speak.value, listen * 0.7) * (1 - think.value) * (1 - pumpkin.value);

        ctx.save();
        ctx.strokeStyle = ctx.fillStyle = `rgb(${rgb})`;
        ctx.shadowColor = `rgb(${rgb})`;
        ctx.shadowBlur = 10 * dpr;

        if (wave > 0.01) {
            const amp = (speak.value * (0.2 + talk * 0.8) + listen * 0.3) * 10;
            const half = 46 * (0.3 + 0.7 * Math.min(1, wave));

            ctx.globalAlpha = Math.min(1, wave);
            ctx.lineWidth = 3;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();

            for (let i = 0; i <= 48; i++) {
                const u = i / 48;
                const envelope = Math.sin(u * Math.PI);
                const px = cx - half + u * half * 2;
                const py = y + Math.sin(u * 16 - t * 12) * Math.sin(u * 5 + t * 4) * amp * envelope;

                if (i) ctx.lineTo(px, py);
                else ctx.moveTo(px, py);
            }

            ctx.stroke();
        }

        if (think.value > 0.01) {
            ctx.globalAlpha = Math.min(1, think.value);

            for (let i = 0; i < 3; i++) {
                const phase = Math.max(0, Math.sin(t * 5 - i * 0.8));

                ctx.beginPath();
                ctx.arc(cx + (i - 1) * 16, y - phase * 5, 3 + phase * 1.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        ctx.restore();
    }


    // Dessin complet d'une image
    function draw(now) {
        const t = now / 1000;
        const preset = EXPRESSIONS[expression];

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const rgb = color.map(s => clamp(Math.round(s.value), 0, 255));
        let glow = clamp(intensity.value, 0, 1.2);
        if (sleeping) glow *= 0.8 + Math.sin(t * 1.3) * 0.2;

        // Lueur vacillante de bougie (maître du jeu, citrouille)
        glow *= 1 - Math.max(hood.value, pumpkin.value) * (0.06 + Math.sin(t * 13) * Math.sin(t * 7.3) * 0.08);

        const cx = width / 2;
        const cy = height * 0.46;

        // Halo d'ambiance de la couleur de l'émotion
        const ambient = ctx.createRadialGradient(cx, cy, 0, cx, cy, width * 0.6);
        ambient.addColorStop(0, `rgba(${rgb}, ${0.1 * glow})`);
        ambient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = ambient;
        ctx.fillRect(0, 0, width, height);

        drawHood(cx, cy, t);
        drawPumpkin(cx + focus.x.value, cy + focus.y.value + 14 * focus.scale.value, focus.scale.value, t, glow);

        // Tremblement (colère, peur, surprise)
        const tremble = (preset.tremble || 0) + shake * 4;
        const sx = rand(-1, 1) * tremble;
        const sy = rand(-1, 1) * tremble;

        // Mouvement continu propre à l'expression
        const motion = { x: 0, y: 0, scale: 1, ...preset.motion?.(t) };

        // Bâillement : les yeux s'écrasent lentement puis se rouvrent
        const yawnProgress = (now - yawnStart) / 1600;
        const yawn = expression === 'tired' && yawnProgress > 0 && yawnProgress < 1
            ? Math.sin(Math.PI * yawnProgress)
            : 0;

        const breath = 1 + Math.sin(t * 1.7) * 0.012;
        const stretch = Math.min(Math.hypot(gaze.x.velocity, gaze.y.velocity) * 0.015, 0.12);
        const pulse = 1 + talk * speak.value * 0.05 + listen * 0.04;

        eyes.forEach(eye => {
            const p = {};
            for (const key in eye.params) p[key] = eye.params[key].value;

            const b = blinkAmount(eye, now);

            // L'œil du côté où l'on regarde paraît plus proche
            const parallax = 1 + gaze.x.value * eye.pos * 0.07;
            const fs = Math.max(0.1, focus.scale.value);
            const s = Math.max(0, p.scale) * breath * parallax * pulse * motion.scale *
                (1 + approach.value * 0.15) * fs;

            // Étirement pendant les mouvements rapides et écrasement au clignement
            const w = Math.max(2, p.w * s * (1 + stretch + b * 0.08 + yawn * 0.08));
            const h = Math.max(2, p.h * s * (1 - stretch * 0.6) * (1 - b * 0.92) * (1 - yawn * 0.8));
            const x = cx + focus.x.value + (eye.pos * 58 + p.x + gaze.x.value * 26 + sx + motion.x + sway.value) * fs;
            const y = cy + focus.y.value + (p.y + hatRoom.value + gaze.y.value * 18 + b * p.h * 0.08 + sy + motion.y) * fs;

            // La paupière descend quand le regard baisse ou pendant la réflexion
            const droop = Math.max(0, gaze.y.value) * 0.12 + think.value * 0.12;
            const lidTop = clamp(p.lidTop + droop, 0, 1);
            const lidAngle = p.lidAngle * -eye.pos * Math.PI / 180;

            eye.box = { x, y, w, h };

            drawEye(
                eye, x, y, w, h,
                clamp(p.r * s, 0, Math.min(w, h) / 2),
                lidTop, lidAngle, clamp(p.lidBottom, 0, 1),
                rgb, glow, t
            );
        });

        drawMouth(cx + focus.x.value, cy + focus.y.value + 66 * focus.scale.value, focus.scale.value, rgb, glow);
        drawBlush(glow);
        drawAccessory(t, rgb);
        drawParticles(rgb);
        drawVoice(t, rgb, cx + focus.x.value, cy + focus.y.value + 88 * focus.scale.value);

        // Panneaux d'information (minuteur, météo...)
        overlays.forEach(drawOverlay => {
            ctx.save();
            drawOverlay(ctx, { width, height, rgb, glow, t, now, dpr, sleeping });
            ctx.restore();
        });
    }


    // Boucle d'animation
    let last = performance.now();

    function frame(now) {
        const dt = Math.min((now - last) / 1000, 0.1);
        last = now;

        update(dt, now);
        draw(now);

        requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);


    // Animation d'allumage : une ligne lumineuse s'étire puis les yeux s'ouvrent
    eyes.forEach(eye => {
        eye.params.w.value = eye.params.w.target = 4;
        eye.params.h.value = eye.params.h.target = 3;
    });

    setTimeout(() => {
        intensity.target = sleeping ? EXPRESSIONS.sleeping.intensity : 1;
        if (!sleeping) eyes.forEach(eye => { eye.params.w.target = NEUTRAL.w; });
    }, 200);

    setTimeout(() => applyExpression(expression), 650);


    // API utilisée par les autres scripts
    window.face = {
        // Liste des expressions disponibles
        expressions: Object.keys(EXPRESSIONS).filter(name => name !== 'sleeping'),

        setExpression(name, duration = 0) {
            if (sleeping) return;

            clearTimeout(expressionTimer);

            expression = EXPRESSIONS[name] && name !== 'sleeping' ? name : 'neutral';
            applyExpression(expression);
            react(expression);

            if (duration && expression !== 'neutral') {
                expressionTimer = setTimeout(() => this.setExpression('neutral'), duration);
            }
        },

        isBusy: () => sleeping || expression !== 'neutral',

        isBlinking: () => eyes.some(eye => eye.blinkStart),

        isSleeping: () => sleeping,

        isGameMaster: () => gameMaster,

        // Taille logique du dessin (le visage est agrandi avec la fenêtre)
        size: () => ({ width, height }),

        // Yeux à l'écran (centre et taille en pixels CSS du canvas) et leur couleur actuelle :
        // l'interface de Robbie OS s'en sert pour transformer les yeux (heure, batterie...)
        eyeBoxes() {
            const zoom = canvas.clientWidth / width || 1;
            return eyes.map(eye => (eye.box
                ? { x: eye.box.x * zoom, y: eye.box.y * zoom, w: eye.box.w * zoom, h: eye.box.h * zoom }
                : null));
        },

        color: () => color.map(s => Math.round(s.value)),

        // Temps fort de la musique : rebond et balancement
        beat(strength = 1) {
            if (sleeping) return;

            eyes.forEach(eye => {
                eye.params.y.velocity -= 70 * strength;
                eye.params.scale.velocity += 0.8 * strength;
            });

            sway.target = sway.target > 0 ? -7 : 7;
            if (Math.random() < 0.35) spawnNote();
        },

        setDancing(value) {
            if (dancing === value) return;

            dancing = value;
            if (!dancing) sway.target = 0;
        },

        isDancing: () => dancing,

        setDreaming(value) {
            dreaming = !!value;
        },

        setSkin(name) {
            skin = name || 'auto';
            if (!sleeping) applyExpression(expression);
        },

        setEyeColor(name) {
            eyeColor = EYE_COLORS[name] || EYE_COLORS.cyan;
            if (!sleeping) applyExpression(expression);
        },

        setSpecialDay(name) {
            specialDay = name || '';
        },

        // Robbie pose une question : points d'interrogation et sourcil levé
        ask() {
            if (sleeping) return;

            spawnQuestions();
            eyes[1].params.scale.velocity += 1.5;
            eyes[0].params.lidTop.velocity += 1.2;
        },

        // Décale et réduit les yeux pour laisser la place à un panneau
        setFocus(x = 0, y = 0, scale = 1) {
            focus.x.target = x;
            focus.y.target = y;
            focus.scale.target = scale;
        },

        addOverlay(drawOverlay) {
            overlays.push(drawOverlay);
        },

        setGameMaster(value) {
            gameMaster = !!value;
            if (!sleeping) applyExpression(expression);
        },

        blink(indexes = [0, 1], duration = 190) {
            if (sleeping) return;

            const now = performance.now();

            indexes.forEach(i => {
                eyes[i].blinkStart = now;
                eyes[i].blinkDuration = duration;
            });
        },

        // Clin d'œil : l'autre œil plisse légèrement
        wink(index = 0) {
            if (sleeping) return;

            this.blink([index], 380);
            eyes[1 - index].params.lidBottom.velocity += 3;
        },

        setGaze(x, y) {
            gazeTarget = { x: clamp(x, -1, 1), y: clamp(y, -1, 1) };
        },

        setApproaching(value) {
            approaching = value;
        },

        setSleeping(value) {
            if (sleeping === value) return;

            sleeping = value;
            clearTimeout(expressionTimer);
            eyes.forEach(eye => { eye.blinkStart = 0; });

            if (sleeping) {
                expression = 'sleeping';
                thinking = speaking = approaching = false;
                gazeTarget = { x: 0, y: 0 };
                nextZ = performance.now() + 1200;
            } else {
                // Réveil en sursaut puis yeux qu'on « frotte »
                expression = 'neutral';
                eyes.forEach(eye => { eye.params.scale.velocity += 2.5; });
                setTimeout(() => this.blink(), 500);
                setTimeout(() => this.blink(), 800);
            }

            applyExpression(expression);
        },

        setThinking(value) {
            thinking = !!value && !sleeping;
        },

        setSpeaking(value) {
            speaking = !!value && !sleeping;
        },

        // Impulsion sur chaque mot prononcé (ou volume réel de la voix)
        talkPulse(level = 1) {
            talk = Math.max(talk, level);
            lastPulse = performance.now();
        },

        // Impulsion quand le micro détecte une voix
        listenPulse() {
            if (!sleeping && !speaking) listen = 1;
        }
    };
})();
