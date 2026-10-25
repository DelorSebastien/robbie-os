// Écriture : la page (contenteditable), la capsule d'outils et la bulle de sélection, les styles,
// les thèmes de document, les images et tableaux, le plan, l'enregistrement automatique en .docx,
// l'export PDF, et Robbie pour corriger, reformuler, résumer ou continuer un passage
(() => {
    const api = window.ecriture;
    const $ = selector => document.querySelector(selector);
    const escape = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const sheet = $('#feuille');
    const scroller = $('#defile');
    const centre = $('.centre');

    // ---- État ----
    let file = null;               // chemin du document (null : pas encore enregistré)
    let dirty = false;
    let saveTimer = null;
    let saving = null;
    let page = { margin: 2.5, orientation: 'portrait', lineSpacing: 1.15 };

    const FONTS = ['Caladea', 'Carlito', 'Liberation Serif', 'Liberation Sans', 'DejaVu Serif', 'DejaVu Sans', 'Inter', 'Nimbus Roman', 'JetBrains Mono'];
    // Thèmes du document : couleurs et polices (aussi dans le .docx)
    const THEMES = [
        { id: 'nuit', nom: 'Bleu nuit', papier: '#fdfdfb', titre: '#0d1a33', sous: '#10406e', accent: '#5ee7ff', texte: 'Caladea', titres: 'Inter' },
        { id: 'terre', nom: 'Terre cuite', papier: '#fffaf2', titre: '#4a1d08', sous: '#8a3b12', accent: '#e8a15a', texte: 'Liberation Serif', titres: 'Liberation Serif' },
        { id: 'foret', nom: 'Forêt', papier: '#f7fbf7', titre: '#0f3a24', sous: '#1f6b45', accent: '#6fd3a0', texte: 'Carlito', titres: 'Carlito' },
        { id: 'lavande', nom: 'Lavande', papier: '#faf7ff', titre: '#2c1660', sous: '#5a2ea6', accent: '#b48cff', texte: 'Inter', titres: 'Inter' }
    ];
    let theme = THEMES[0];

    document.execCommand('styleWithCSS', false, true);
    document.execCommand('defaultParagraphSeparator', false, 'p');

    // ---- Messages et dialogues ----
    function message(text) {
        const box = $('#message');
        box.textContent = text;
        box.hidden = false;
        clearTimeout(message.timer);
        message.timer = setTimeout(() => { box.hidden = true; }, 3000);
    }

    // Petit formulaire : `fields` [[clé, libellé, valeur]] ; renvoie les valeurs, ou null si annulé
    function form(title, fields, confirm = 'Valider') {
        return new Promise(resolve => {
            const back = $('#dialogue');
            back.innerHTML = `<form class="dialogue"><h4>${escape(title)}</h4>
                ${fields.map(([key, label, value, type = 'text']) => `<label>${escape(label)}<input name="${key}" type="${type}" value="${escape(value)}" spellcheck="false"></label>`).join('')}
                <div class="ligne-boutons"><button type="button" class="bouton" data-annuler>Annuler</button><button type="submit" class="bouton principal">${escape(confirm)}</button></div></form>`;
            back.hidden = false;
            const box = back.querySelector('form');
            box.querySelector('input').select();
            const close = value => { back.hidden = true; back.innerHTML = ''; resolve(value); };
            box.addEventListener('submit', event => { event.preventDefault(); close(Object.fromEntries(new FormData(box))); });
            box.querySelector('[data-annuler]').addEventListener('click', () => close(null));
            box.addEventListener('keydown', event => { if (event.key === 'Escape') close(null); });
        });
    }

    // ---- Sélection gardée (les boutons et les dialogues la font perdre) ----
    let savedRange = null;
    function keepSelection() {
        const selection = window.getSelection();
        if (selection.rangeCount && sheet.contains(selection.anchorNode)) savedRange = selection.getRangeAt(0).cloneRange();
    }
    function restoreSelection() {
        sheet.focus({ preventScroll: true });
        if (!savedRange) return;
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(savedRange);
    }
    document.addEventListener('selectionchange', () => {
        keepSelection();
        updateToolbar();
        placeBubble();
    });

    // ---- Mise en forme ----
    function exec(command, value = null) {
        restoreSelection();
        document.execCommand(command, false, value);
        changed();
        updateToolbar();
    }

    function setBlock(tag) {
        restoreSelection();
        document.execCommand('formatBlock', false, tag === 'blockquote' ? 'blockquote' : tag);
        changed();
        updateToolbar();
    }

    // Taille en points : le navigateur ne connaît que 1 à 7 ; on remplace son marqueur par un style
    function setSize(points) {
        restoreSelection();
        document.execCommand('styleWithCSS', false, false);
        document.execCommand('fontSize', false, '7');
        document.execCommand('styleWithCSS', false, true);
        sheet.querySelectorAll('font[size="7"]').forEach(font => {
            const span = document.createElement('span');
            span.style.fontSize = `${points}pt`;
            span.append(...font.childNodes);
            font.replaceWith(span);
        });
        changed();
    }

    function updateToolbar() {
        if (!sheet.contains(window.getSelection().anchorNode)) return;
        for (const command of ['bold', 'italic', 'underline', 'strikeThrough', 'insertUnorderedList', 'insertOrderedList']) {
            const on = document.queryCommandState(command);
            document.querySelectorAll(`[data-cmd="${command}"]`).forEach(b => b.classList.toggle('on', on));
        }
        for (const align of ['justifyLeft', 'justifyCenter', 'justifyRight', 'justifyFull']) {
            document.querySelector(`[data-align="${align}"]`).classList.toggle('on', document.queryCommandState(align));
        }
        const block = currentBlock();
        const tag = block ? block.tagName.toLowerCase() : 'p';
        const style = ['h1', 'h2', 'h3', 'blockquote'].includes(tag) ? tag : 'p';
        $('#style').value = style;
        document.querySelectorAll('[data-style]').forEach(b => b.classList.toggle('on', b.dataset.style === style));
        const node = window.getSelection().anchorNode;
        const element = node?.nodeType === 1 ? node : node?.parentElement;
        if (element && sheet.contains(element)) {
            const computed = getComputedStyle(element);
            const family = computed.fontFamily.split(',')[0].replace(/["']/g, '').trim();
            if (FONTS.includes(family)) $('#police').value = family;
            const points = Math.round(parseFloat(computed.fontSize) * 0.75);
            const option = [...$('#taille').options].find(o => Number(o.value) === points);
            if (option) $('#taille').value = option.value;
        }
    }

    function currentBlock() {
        let node = window.getSelection().anchorNode;
        while (node && node !== sheet) {
            if (node.nodeType === 1 && /^(P|H1|H2|H3|BLOCKQUOTE|LI|DIV|TD|TH)$/.test(node.tagName)) return node;
            node = node.parentNode;
        }
        return null;
    }

    // Capsule et bulle : les boutons ne prennent pas le focus (la sélection reste dans la page)
    document.querySelectorAll('.capsule button, .bulle button').forEach(button => button.addEventListener('mousedown', event => event.preventDefault()));
    document.querySelectorAll('[data-cmd]').forEach(button => button.addEventListener('click', () => exec(button.dataset.cmd)));
    document.querySelectorAll('[data-align]').forEach(button => button.addEventListener('click', () => exec(button.dataset.align)));
    $('#style').addEventListener('change', event => setBlock(event.target.value));
    document.querySelectorAll('[data-style]').forEach(button => button.addEventListener('click', () => setBlock(button.dataset.style)));
    $('#police').innerHTML = FONTS.map(f => `<option value="${f}" style="font-family:'${f}'">${f}</option>`).join('');
    $('#police').addEventListener('change', event => exec('fontName', event.target.value));
    $('#taille').addEventListener('change', event => setSize(event.target.value));
    $('#couleur').addEventListener('input', event => { $('#trait-couleur').style.background = event.target.value; });
    $('#couleur').addEventListener('change', event => exec('foreColor', event.target.value));
    $('#surligne').addEventListener('input', event => { $('#trait-surligne').style.background = event.target.value; });
    $('#surligne').addEventListener('change', event => exec('hiliteColor', event.target.value));
    $('#trait-surligne').style.background = $('#surligne').value;
    $('#annuler').addEventListener('click', () => exec('undo'));
    $('#retablir').addEventListener('click', () => exec('redo'));

    // ---- Liens, images, tableaux, sauts de page ----
    async function addLink() {
        keepSelection();
        const selected = window.getSelection().toString();
        const values = await form('LIEN', [['adresse', 'Adresse', 'https://'], ...(selected ? [] : [['texte', 'Texte affiché', '']])], 'Insérer');
        if (!values || !/^(https?:\/\/|mailto:)./.test(values.adresse)) return;
        restoreSelection();
        if (selected) exec('createLink', values.adresse);
        else exec('insertHTML', `<a href="${escape(values.adresse)}">${escape(values.texte || values.adresse)}</a>&nbsp;`);
    }
    $('#lien').addEventListener('click', addLink);
    $('#bulle-lien').addEventListener('click', addLink);

    $('#image').addEventListener('click', () => { keepSelection(); $('#choisir-image').click(); });
    $('#choisir-image').addEventListener('change', event => {
        const chosen = event.target.files[0];
        event.target.value = '';
        if (chosen) insertImageFile(chosen);
    });
    function insertImageFile(blob) {
        const reader = new FileReader();
        reader.onload = () => {
            // (les très grandes images sont réduites : le document reste léger)
            const img = new Image();
            img.onload = () => {
                const max = 1400;
                const scale = Math.min(1, max / Math.max(img.width, img.height));
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(img.width * scale);
                canvas.height = Math.round(img.height * scale);
                canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                const data = canvas.toDataURL(/png|gif/.test(blob.type) ? 'image/png' : 'image/jpeg', 0.9);
                exec('insertHTML', `<img src="${data}" width="${Math.min(canvas.width, 600)}" alt=""><p><br></p>`);
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(blob);
    }
    // Coller une image (capture d'écran…)
    sheet.addEventListener('paste', event => {
        const image = [...(event.clipboardData?.items || [])].find(item => item.type.startsWith('image/'));
        if (image) {
            event.preventDefault();
            keepSelection();
            insertImageFile(image.getAsFile());
            return;
        }
        // (texte venu d'ailleurs : sans les styles de la page d'origine)
        const html = event.clipboardData?.getData('text/html');
        if (html) {
            event.preventDefault();
            exec('insertHTML', clean(html));
        }
    });

    // Une image cliquée : choisie (Suppr l'enlève, glisser son coin la redimensionne au clavier ±)
    sheet.addEventListener('click', event => {
        sheet.querySelectorAll('img.choisie').forEach(img => img.classList.remove('choisie'));
        if (event.target.tagName === 'IMG') event.target.classList.add('choisie');
    });
    sheet.addEventListener('keydown', event => {
        const img = sheet.querySelector('img.choisie');
        if (!img) return;
        if (event.key === '+' || event.key === '-') {
            event.preventDefault();
            const width = Math.max(60, Math.min(640, (Number(img.getAttribute('width')) || img.width) + (event.key === '+' ? 40 : -40)));
            img.setAttribute('width', width);
            changed();
        }
    });

    $('#tableau').addEventListener('click', async () => {
        keepSelection();
        const values = await form('TABLEAU', [['lignes', 'Lignes', '3', 'number'], ['colonnes', 'Colonnes', '3', 'number']], 'Insérer');
        if (!values) return;
        const rows = Math.max(1, Math.min(40, Number(values.lignes) || 3));
        const cols = Math.max(1, Math.min(10, Number(values.colonnes) || 3));
        const head = `<tr>${'<th><br></th>'.repeat(cols)}</tr>`;
        const body = `<tr>${'<td><br></td>'.repeat(cols)}</tr>`.repeat(Math.max(0, rows - 1));
        exec('insertHTML', `<table data-nouveau><tbody>${head}${body}</tbody></table><p><br></p>`);
        // (le curseur va dans la première case)
        const table = sheet.querySelector('table[data-nouveau]');
        if (table) {
            table.removeAttribute('data-nouveau');
            placeCaret(table.querySelector('th, td'));
        }
    });

    // Tab dans un tableau : case suivante (et une ligne de plus à la fin)
    sheet.addEventListener('keydown', event => {
        if (event.key !== 'Tab') return;
        const cell = window.getSelection().anchorNode?.parentElement?.closest('td, th');
        if (!cell) {
            event.preventDefault();
            // (dans une liste : un niveau de plus ou de moins ; ailleurs : un espace de tabulation)
            if (window.getSelection().anchorNode?.parentElement?.closest('li')) exec(event.shiftKey ? 'outdent' : 'indent');
            else if (!event.shiftKey) exec('insertText', '  ');
            return;
        }
        event.preventDefault();
        const cells = [...cell.closest('table').querySelectorAll('td, th')];
        let next = cells[cells.indexOf(cell) + (event.shiftKey ? -1 : 1)];
        if (!next && !event.shiftKey) {
            const row = cell.parentElement.cloneNode(true);
            row.querySelectorAll('th, td').forEach(c => { const td = document.createElement('td'); td.innerHTML = '<br>'; c.replaceWith(td); });
            cell.closest('tbody, table').append(row);
            next = row.firstElementChild;
            changed();
        }
        if (next) placeCaret(next);
    });

    // Le curseur au début d'un élément (une case de tableau…)
    function placeCaret(element) {
        if (!element) return;
        const range = document.createRange();
        range.selectNodeContents(element);
        range.collapse(true);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
    }

    $('#saut').addEventListener('click', () => exec('insertHTML', '<hr class="saut"><p><br></p>'));

    // ---- Bulle sur la sélection ----
    function placeBubble() {
        const bubble = $('#bulle');
        const selection = window.getSelection();
        if (!selection.rangeCount || selection.isCollapsed || !sheet.contains(selection.anchorNode) || !$('#menu-robbie').hidden) {
            bubble.hidden = true;
            return;
        }
        const rect = selection.getRangeAt(0).getBoundingClientRect();
        const box = centre.getBoundingClientRect();
        if (!rect.width) { bubble.hidden = true; return; }
        bubble.hidden = false;
        bubble.style.left = `${Math.max(120, Math.min(box.width - 120, rect.left - box.left + rect.width / 2))}px`;
        bubble.style.top = `${Math.max(100, rect.top - box.top - 8)}px`;
    }
    scroller.addEventListener('scroll', placeBubble);

    // ---- Robbie ----
    const TASKS = [['corriger', 'Corriger les fautes'], ['reformuler', 'Reformuler'], ['formel', 'Rendre plus formel'], ['resumer', 'Résumer'], ['anglais', 'Traduire en anglais'], ['continuer', 'Continuer le texte']];
    $('#bulle-robbie').addEventListener('click', () => {
        keepSelection();
        const menu = $('#menu-robbie');
        const bubble = $('#bulle');
        menu.innerHTML = '<div class="titre-menu">ROBBIE</div>' + TASKS.map(([id, label]) => `<button data-tache="${id}">${label}</button>`).join('');
        menu.style.left = bubble.style.left;
        menu.style.top = `${parseFloat(bubble.style.top) + 6}px`;
        menu.style.transform = 'translateX(-50%)';
        menu.hidden = false;
        bubble.hidden = true;
    });

    $('#menu-robbie').addEventListener('click', async event => {
        const menu = $('#menu-robbie');
        const task = event.target.closest('[data-tache]')?.dataset.tache;
        if (task) {
            const range = savedRange?.cloneRange();
            const text = range?.toString().trim();
            if (!text) { menu.hidden = true; return; }
            menu.innerHTML = '<div class="attente"><i></i>Robbie réfléchit…</div>';
            const result = await api.robbie(task, text);
            if (menu.hidden) return;
            if (!result.ok) { menu.innerHTML = `<div class="attente">${escape(result.erreur)}</div><div class="ligne-boutons"><button class="bouton" data-fermer>Fermer</button></div>`; return; }
            menu.dataset.reponse = result.texte;
            menu.innerHTML = `<div class="titre-menu">PROPOSITION DE ROBBIE</div><div class="proposition">${escape(result.texte)}</div>
                <div class="ligne-boutons"><button class="bouton" data-fermer>Annuler</button><button class="bouton" data-inserer>Insérer après</button>${task === 'continuer' ? '' : '<button class="bouton principal" data-remplacer>Remplacer</button>'}</div>`;
            menu.querySelector('[data-remplacer], [data-inserer]').focus();
            return;
        }
        if (event.target.closest('[data-fermer]')) { menu.hidden = true; return; }
        const answer = menu.dataset.reponse || '';
        const html = answer.split(/\n{2,}/).map(part => escape(part).replace(/\n/g, '<br>')).join('</p><p>');
        if (event.target.closest('[data-remplacer]')) {
            menu.hidden = true;
            restoreSelection();
            exec('insertHTML', html.includes('</p>') ? `<p>${html}</p>` : html);
        } else if (event.target.closest('[data-inserer]')) {
            menu.hidden = true;
            restoreSelection();
            const selection = window.getSelection();
            const range = selection.getRangeAt(0);
            const block = (range.endContainer.nodeType === 1 ? range.endContainer : range.endContainer.parentElement).closest('p, h1, h2, h3, blockquote, li') || range.endContainer.parentElement;
            const after = document.createRange();
            after.setStartAfter(block);
            after.collapse(true);
            selection.removeAllRanges();
            selection.addRange(after);
            document.execCommand('insertHTML', false, `<p>${html}</p>`);
            changed();
        }
    });
    document.addEventListener('mousedown', event => {
        const menu = $('#menu-robbie');
        if (!menu.hidden && !menu.contains(event.target) && !event.target.closest('#bulle-robbie')) menu.hidden = true;
    });

    // ---- Plan, mots, pages ----
    let planTimer = null;
    function refreshInfo() {
        clearTimeout(planTimer);
        planTimer = setTimeout(() => {
            const headings = [...sheet.querySelectorAll('h1, h2, h3')].filter(h => h.textContent.trim());
            $('#plan').innerHTML = headings.length
                ? headings.map((h, i) => `<button class="n${h.tagName[1]}" data-titre="${i}">${escape(h.textContent.trim())}</button>`).join('')
                : '<div class="vide-gauche">Les titres du document apparaîtront ici.</div>';
            $('#plan').onclick = event => {
                const target = headings[Number(event.target.closest('[data-titre]')?.dataset.titre)];
                target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            };
            const words = (sheet.innerText.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []).length;
            $('#mots').textContent = `${words.toLocaleString('fr-FR')} mot${words > 1 ? 's' : ''}`;
            const pageHeight = parseFloat(getComputedStyle(sheet).minHeight);
            const pages = Math.max(1, Math.ceil((sheet.scrollHeight - 4) / pageHeight));
            const current = Math.min(pages, Math.floor((scroller.scrollTop + scroller.clientHeight / 3) / pageHeight) + 1);
            $('#pages-nombre').textContent = `Page ${current} sur ${pages}`;
        }, 250);
    }
    scroller.addEventListener('scroll', refreshInfo);

    // La page tient toujours dans la largeur (zoom), et commence sous la capsule (qui peut passer sur deux lignes)
    function fitPage() {
        const pageWidth = page.orientation === 'paysage' ? 1123 : 794;
        const zoom = Math.min(1, (scroller.clientWidth - 48) / pageWidth);
        document.documentElement.style.setProperty('--zoom', zoom.toFixed(3));
        const capsule = $('#capsule');
        document.documentElement.style.setProperty('--haut-page', `${capsule.offsetTop + capsule.offsetHeight - 50 + 14}px`);
    }
    new ResizeObserver(fitPage).observe(scroller);

    // ---- Thème du document et page ----
    function applyDocTheme(next) {
        theme = next;
        const root = document.documentElement.style;
        root.setProperty('--papier', theme.papier);
        root.setProperty('--titre-couleur', theme.titre);
        root.setProperty('--sous-titre', theme.sous);
        root.setProperty('--accent-doc', theme.accent);
        root.setProperty('--police-texte', `'${theme.texte}', serif`);
        root.setProperty('--police-titres', `'${theme.titres}', sans-serif`);
        document.querySelectorAll('[data-theme]').forEach(b => b.classList.toggle('on', b.dataset.theme === theme.id));
    }
    $('#themes').innerHTML = THEMES.map(t => `<button data-theme="${t.id}" title="${t.nom}" style="background:linear-gradient(135deg, ${t.papier} 50%, ${t.sous} 50%)"></button>`).join('');
    $('#themes').addEventListener('click', event => {
        const id = event.target.closest('[data-theme]')?.dataset.theme;
        if (id) { applyDocTheme(THEMES.find(t => t.id === id)); changed(); }
    });

    function applyPage() {
        const root = document.documentElement.style;
        const landscape = page.orientation === 'paysage';
        root.setProperty('--largeur-page', landscape ? '29.7cm' : '21cm');
        root.setProperty('--hauteur-page', landscape ? '21cm' : '29.7cm');
        root.setProperty('--marge', `${page.margin}cm`);
        root.setProperty('--interligne', page.lineSpacing);
        $('#orientation').value = page.orientation;
        $('#marges').value = String(page.margin);
        $('#interligne').value = String(page.lineSpacing);
        fitPage();
        refreshInfo();
    }
    $('#orientation').addEventListener('change', event => { page.orientation = event.target.value; applyPage(); changed(); });
    $('#marges').addEventListener('change', event => { page.margin = Number(event.target.value); applyPage(); changed(); });
    $('#interligne').addEventListener('change', event => { page.lineSpacing = Number(event.target.value); applyPage(); changed(); });
    $('#panneau-droit').addEventListener('click', () => {
        document.body.classList.toggle('sans-droite');
        $('#panneau-droit').classList.toggle('on', !document.body.classList.contains('sans-droite'));
        try { localStorage.setItem('ecriture-droite', document.body.classList.contains('sans-droite') ? '0' : '1'); } catch {}
    });
    try { if (localStorage.getItem('ecriture-droite') === '0') document.body.classList.add('sans-droite'); } catch {}
    $('#panneau-droit').classList.toggle('on', !document.body.classList.contains('sans-droite'));

    // ---- Du document vers Word : des blocs de morceaux de texte mis en forme ----
    const toHex = color => {
        const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(color || '');
        if (!match || match[4] === '0') return null;
        return '#' + [match[1], match[2], match[3]].map(n => Number(n).toString(16).padStart(2, '0')).join('');
    };

    function runsOf(node, format = {}, runs = []) {
        for (const child of node.childNodes) {
            if (child.nodeType === 3) {
                const text = child.textContent.replace(/\s+/g, ' ');
                if (text) runs.push({ text, ...format });
                continue;
            }
            if (child.nodeType !== 1) continue;
            const tag = child.tagName;
            if (tag === 'BR') { runs.push({ text: '', lineBreak: true, ...format }); continue; }
            if (tag === 'IMG') { runs.push({ text: '', image: child.src, width: Number(child.getAttribute('width')) || child.naturalWidth, height: Math.round((Number(child.getAttribute('width')) || child.naturalWidth) * (child.naturalHeight / (child.naturalWidth || 1))) }); continue; }
            const next = { ...format };
            if (tag === 'B' || tag === 'STRONG') next.bold = true;
            if (tag === 'I' || tag === 'EM') next.italic = true;
            if (tag === 'U') next.underline = true;
            if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') next.strike = true;
            if (tag === 'A') next.link = child.getAttribute('href');
            const style = child.style;
            if (style) {
                if (style.fontWeight === 'bold' || Number(style.fontWeight) >= 600) next.bold = true;
                if (style.fontStyle === 'italic') next.italic = true;
                if (style.textDecorationLine?.includes('underline') || style.textDecoration?.includes('underline')) next.underline = true;
                if (style.textDecorationLine?.includes('line-through') || style.textDecoration?.includes('line-through')) next.strike = true;
                if (style.color) next.color = toHex(style.color) || next.color;
                if (style.backgroundColor) next.highlight = toHex(style.backgroundColor) || next.highlight;
                if (style.fontFamily) next.font = style.fontFamily.split(',')[0].replace(/["']/g, '').trim();
                if (style.fontSize) {
                    const size = style.fontSize.endsWith('pt') ? parseFloat(style.fontSize) : style.fontSize.endsWith('px') ? parseFloat(style.fontSize) * 0.75 : null;
                    if (size) next.size = size;
                }
            }
            if (tag === 'FONT') {
                if (child.color) next.color = child.color;
                if (child.face) next.font = child.face;
            }
            runsOf(child, next, runs);
        }
        return runs;
    }

    const alignOf = element => {
        const align = element.style?.textAlign || element.getAttribute?.('align');
        return { center: 'center', right: 'right', justify: 'justify' }[align] || undefined;
    };

    function blocksOf(container, blocks = [], level = 0) {
        for (const node of container.childNodes) {
            if (node.nodeType === 3) {
                if (node.textContent.trim()) blocks.push({ type: 'p', runs: [{ text: node.textContent }] });
                continue;
            }
            if (node.nodeType !== 1) continue;
            const tag = node.tagName;
            if (/^H[1-3]$/.test(tag)) blocks.push({ type: tag.toLowerCase(), align: alignOf(node), runs: runsOf(node) });
            else if (tag === 'H4' || tag === 'H5' || tag === 'H6') blocks.push({ type: 'h3', runs: runsOf(node) });
            else if (tag === 'BLOCKQUOTE') blocks.push({ type: 'quote', align: alignOf(node), runs: runsOf(node) });
            else if (tag === 'UL' || tag === 'OL') {
                for (const li of node.children) {
                    if (li.tagName !== 'LI') continue;
                    const own = document.createElement('div');
                    for (const child of li.childNodes) if (!(child.nodeType === 1 && (child.tagName === 'UL' || child.tagName === 'OL'))) own.append(child.cloneNode(true));
                    blocks.push({ type: 'li', ordered: tag === 'OL', level, runs: runsOf(own) });
                    for (const sub of li.children) if (sub.tagName === 'UL' || sub.tagName === 'OL') blocksOf({ childNodes: [sub] }, blocks, level + 1);
                }
            } else if (tag === 'TABLE') {
                const rows = [...node.querySelectorAll('tr')].map(tr => [...tr.children].map(cell => {
                    const inner = blocksOf(cell, []);
                    return inner.length ? inner : [{ type: 'p', runs: runsOf(cell) }];
                }));
                blocks.push({ type: 'table', header: !!node.querySelector('tr:first-child th'), rows });
            } else if (tag === 'HR') blocks.push({ type: node.classList.contains('saut') ? 'pagebreak' : 'p', runs: [] });
            else if (tag === 'IMG') blocks.push({ type: 'image', image: node.src, width: Number(node.getAttribute('width')) || node.naturalWidth, height: Math.round((Number(node.getAttribute('width')) || node.naturalWidth) * (node.naturalHeight / (node.naturalWidth || 1))) });
            else if (tag === 'DIV' && node.querySelector('p, h1, h2, h3, ul, ol, table, blockquote')) blocksOf(node, blocks, level);
            else blocks.push({ type: 'p', align: alignOf(node), runs: runsOf(node) });
        }
        return blocks;
    }

    function documentData() {
        return {
            title: title(),
            blocks: blocksOf(sheet),
            texte: sheet.innerText,
            theme: { font: theme.texte, headingFont: theme.titres, headingColor: theme.sous, titleColor: theme.titre, accent: theme.accent, size: 12, lineSpacing: page.lineSpacing },
            page
        };
    }

    // Titre du document : son nom, sinon son premier titre, sinon sa première ligne
    function title() {
        const named = $('#nom-document').value.trim();
        if (named && named !== 'Sans titre') return named;
        const heading = sheet.querySelector('h1, h2')?.textContent.trim();
        const firstLine = sheet.innerText.trim().split('\n')[0];
        return (heading || firstLine || 'Sans titre').slice(0, 60);
    }

    // ---- Enregistrement automatique ----
    function changed() {
        dirty = true;
        setStatus('modifie');
        refreshInfo();
        clearTimeout(saveTimer);
        saveTimer = setTimeout(save, 1500);
    }
    sheet.addEventListener('input', changed);

    function setStatus(state, detail) {
        const box = $('#enregistrement');
        box.className = 'etat-enregistrement' + (state === 'ok' ? ' ok' : state === 'erreur' ? ' erreur' : '');
        box.textContent = { ok: 'Enregistré', enregistrement: 'Enregistrement…', modifie: file ? 'Modifié' : 'Pas encore enregistré', erreur: detail || 'Non enregistré', vide: 'Pas encore enregistré' }[state];
    }

    async function save() {
        clearTimeout(saveTimer);
        if (saving) await saving;
        if (!dirty) return;
        // (un document vide n'est pas créé sur le disque)
        if (!file && !sheet.innerText.trim() && !sheet.querySelector('img, table')) return;
        saving = (async () => {
            setStatus('enregistrement');
            if (!file) file = await api.freeName(title());
            dirty = false;
            const result = await api.save(file, documentData());
            if (!result.ok) { dirty = true; setStatus('erreur', result.erreur); return; }
            file = result.chemin;
            $('#nom-document').value = result.nom.replace(/\.[^.]+$/, '');
            document.title = `${$('#nom-document').value} · Écriture`;
            setStatus('ok');
            renderRecents();
        })();
        await saving;
        saving = null;
    }

    async function saveAs() {
        const target = await api.saveAsDialog(title());
        if (!target) return;
        file = target;
        dirty = true;
        await save();
    }

    // Renommer depuis le nom en haut : le fichier suit
    $('#nom-document').addEventListener('keydown', event => { if (event.key === 'Enter') event.target.blur(); if (event.key === 'Escape') { event.target.value = file ? file.split('/').pop().replace(/\.[^.]+$/, '') : 'Sans titre'; event.target.blur(); } });
    $('#nom-document').addEventListener('change', async event => {
        const name = event.target.value.trim();
        if (!name) return;
        if (!file) { changed(); return; }
        if (saving) await saving;
        const result = await api.rename(file, name);
        if (!result.ok) { message(result.erreur); event.target.value = file.split('/').pop().replace(/\.[^.]+$/, ''); return; }
        file = result.chemin;
        document.title = `${name} · Écriture`;
        renderRecents();
    });

    // ---- Ouvrir, nouveau ----
    // Le HTML venu d'ailleurs (Word, une page web) : sans scripts, styles de page ni attributs d'événements
    function clean(html) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        doc.querySelectorAll('script, style, meta, link, iframe, object, embed, title, head').forEach(n => n.remove());
        doc.querySelectorAll('*').forEach(element => {
            for (const attribute of [...element.attributes]) {
                const name = attribute.name.toLowerCase();
                if (name.startsWith('on') || name === 'class' && !/^(sous|saut)$/.test(attribute.value) || name === 'id') element.removeAttribute(attribute.name);
                if ((name === 'href' || name === 'src') && /^\s*javascript:/i.test(attribute.value)) element.removeAttribute(attribute.name);
            }
        });
        // (les tableaux de Word mettent souvent leurs titres en gras : la première ligne devient l'en-tête)
        doc.querySelectorAll('table').forEach(table => {
            const first = table.querySelector('tr');
            if (first && !first.querySelector('th') && first.querySelectorAll('td strong, td b').length === first.children.length) {
                first.querySelectorAll('td').forEach(td => { const th = doc.createElement('th'); th.innerHTML = td.textContent; td.replaceWith(th); });
            }
        });
        return doc.body.innerHTML;
    }

    async function openFile(target) {
        await save();
        const result = await api.read(target);
        if (!result.ok) { message(result.erreur); api.forget(target); renderRecents(); return; }
        file = result.chemin;
        dirty = false;
        sheet.innerHTML = result.html !== undefined ? clean(result.html) : (result.texte || '').split(/\n/).map(line => `<p>${escape(line) || '<br>'}</p>`).join('');
        if (!/\.docx$/i.test(file)) {
            // (un .txt reste un .txt ; un .html ou .md est réenregistré en .docx à côté)
            if (!/\.txt$/i.test(file)) { file = null; dirty = true; }
        }
        $('#nom-document').value = result.nom.replace(/\.[^.]+$/, '');
        document.title = `${$('#nom-document').value} · Écriture`;
        setStatus(file ? 'ok' : 'modifie');
        scroller.scrollTop = 0;
        refreshInfo();
        renderRecents();
    }

    async function newDocument() {
        await save();
        file = null;
        dirty = false;
        sheet.innerHTML = '<h1><br></h1>';
        $('#nom-document').value = 'Sans titre';
        document.title = 'Écriture';
        setStatus('vide');
        applyDocTheme(THEMES[0]);
        page = { margin: 2.5, orientation: 'portrait', lineSpacing: 1.15 };
        applyPage();
        refreshInfo();
        renderRecents();
        sheet.focus();
    }

    $('#nouveau').addEventListener('click', newDocument);
    $('#ouvrir').addEventListener('click', async () => {
        const target = await api.openDialog();
        if (target) openFile(target);
    });

    const dateFormat = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' });
    function ago(time) {
        const minutes = (Date.now() - time) / 60000;
        if (minutes < 2) return 'À l’instant';
        if (minutes < 60) return `Il y a ${Math.round(minutes)} min`;
        const today = new Date(); today.setHours(0, 0, 0, 0);
        if (time >= today.getTime()) return `Aujourd’hui, ${new Date(time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
        if (time >= today.getTime() - 86400000) return 'Hier';
        return dateFormat.format(new Date(time));
    }
    async function renderRecents() {
        const list = await api.recents();
        $('#recents').innerHTML = list.length
            ? list.map(doc => `<button class="doc${doc.chemin === file ? ' actif' : ''}" data-doc="${escape(doc.chemin)}" title="${escape(doc.chemin)}"><b>${escape(doc.nom)}</b><small>${ago(doc.modifie)} · ${escape(doc.dossier)}</small></button>`).join('')
            : '<div class="vide-gauche">Tes documents apparaîtront ici.</div>';
        $('#infos-doc').innerHTML = file ? `Enregistré dans<br>${escape(file.replace(/^\/home\/[^/]+/, '~'))}<br><button data-afficher>Afficher dans Fichiers</button>` : '';
    }
    $('#recents').addEventListener('click', event => {
        const target = event.target.closest('[data-doc]')?.dataset.doc;
        if (target && target !== file) openFile(target);
    });
    $('#infos-doc').addEventListener('click', event => { if (event.target.closest('[data-afficher]') && file) api.showInFolder(file); });

    // ---- PDF ----
    async function exportPdf() {
        await save();
        const landscape = page.orientation === 'paysage';
        const css = [...document.styleSheets].flatMap(s => { try { return [...s.cssRules].map(r => r.cssText); } catch { return []; } })
            .filter(rule => rule.startsWith('.feuille')).join('\n');
        const vars = getComputedStyle(document.documentElement);
        const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><style>
            :root { --papier: #fff; --encre: #1b2230; --titre-couleur: ${vars.getPropertyValue('--titre-couleur')}; --sous-titre: ${vars.getPropertyValue('--sous-titre')}; --accent-doc: ${vars.getPropertyValue('--accent-doc')};
                --police-texte: ${vars.getPropertyValue('--police-texte')}; --police-titres: ${vars.getPropertyValue('--police-titres')}; --taille-texte: 12pt; --interligne: ${page.lineSpacing}; }
            body { margin: 0; }
            ${css}
            .feuille { padding: 0 !important; min-height: 0 !important; box-shadow: none !important; background: none !important; width: ${landscape ? '24.7cm' : '16cm'}; }
            .feuille hr.saut { break-after: page; border: 0; margin: 0; }
            .feuille hr.saut::after { display: none; }
            .feuille h1, .feuille h2, .feuille h3 { break-after: avoid; }
            .feuille tr, .feuille img { break-inside: avoid; }
            </style></head><body><article class="feuille">${sheet.innerHTML}</article></body></html>`;
        const result = await api.pdf(html, title(), page);
        if (result.ok) message('PDF enregistré dans Documents');
        else if (!result.annule) message(result.erreur);
    }
    $('#pdf').addEventListener('click', exportPdf);

    // ---- Clavier ----
    document.addEventListener('keydown', event => {
        if (!event.ctrlKey) return;
        const key = event.key.toLowerCase();
        if (key === 's' && event.shiftKey) { event.preventDefault(); saveAs(); }
        else if (key === 's') { event.preventDefault(); dirty = true; save(); }
        else if (key === 'o') { event.preventDefault(); $('#ouvrir').click(); }
        else if (key === 'n') { event.preventDefault(); newDocument(); }
        else if (key === 'k') { event.preventDefault(); addLink(); }
        else if (key === 'p') { event.preventDefault(); exportPdf(); }
        else if (event.altKey && ['1', '2', '3', '0'].includes(key)) { event.preventDefault(); setBlock(key === '0' ? 'p' : `h${key}`); }
    });

    // ---- Fermeture : le dernier enregistrement d'abord ----
    api.onClosing(async () => {
        await save();
        api.canClose();
    });
    api.onOpen(target => openFile(target));

    // ---- Thème de Robbie OS (sombre, clair, automatique) ----
    let themeSettings = { theme: 'sombre' };
    function applyTheme(settings = themeSettings) {
        themeSettings = settings;
        let mode = settings.theme;
        if (mode === 'auto') {
            const where = settings.place || { latitude: 44.0556, longitude: 5.0481 };
            const now = new Date();
            const { sunrise, sunset } = window.soleil.sunTimes(now, where.latitude, where.longitude);
            const minutes = now.getHours() * 60 + now.getMinutes();
            mode = minutes >= sunrise && minutes < sunset ? 'clair' : 'sombre';
        }
        document.documentElement.classList.toggle('clair', mode === 'clair');
        const ACCENTS = { cyan: [94, 231, 255], green: [94, 240, 168], pink: [255, 110, 200], gold: [255, 196, 80], purple: [185, 140, 255], white: [225, 240, 255] };
        const rgb = ACCENTS[settings.accent] || ACCENTS.cyan;
        document.documentElement.style.setProperty('--accent', rgb.join(', '));
        document.documentElement.style.setProperty('--accent-texte', mode === 'clair' ? `rgb(${rgb.map(v => Math.round(v * 0.55)).join(', ')})` : `rgb(${rgb.join(', ')})`);
    }
    api.theme().then(applyTheme);
    api.onTheme(applyTheme);
    setInterval(() => applyTheme(), 60 * 1000);

    // ---- Démarrage : un document vide, prêt à écrire ----
    applyDocTheme(THEMES[0]);
    applyPage();
    sheet.innerHTML = '<h1><br></h1>';
    setStatus('vide');
    renderRecents();
    refreshInfo();
    window.icons.fill();
    setTimeout(() => sheet.focus(), 100);
})();
