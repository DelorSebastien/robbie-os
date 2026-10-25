// Écriture ↔ Word : la page décrit son document en blocs (titres, paragraphes, listes, citations,
// tableaux, images) faits de morceaux de texte mis en forme ; on en fait un .docx avec la
// bibliothèque « docx ». À l'ouverture, « mammoth » transforme le .docx en HTML pour la page.
const fs = require('node:fs/promises');
const mammoth = require('mammoth');
const {
    Document, Packer, Paragraph, TextRun, ExternalHyperlink, HeadingLevel, AlignmentType, Table, TableRow, TableCell,
    WidthType, BorderStyle, ImageRun, LevelFormat, ShadingType, PageBreak
} = require('docx');

const CM = 567;                      // 1 cm en vingtièmes de point (unité de Word)
const ALIGN = { left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT, justify: AlignmentType.JUSTIFIED };
const HEADINGS = { h1: HeadingLevel.HEADING_1, h2: HeadingLevel.HEADING_2, h3: HeadingLevel.HEADING_3 };
const hex = color => (color ? String(color).replace('#', '').slice(0, 6).toUpperCase() : undefined);

// Surlignage : Word n'accepte qu'une liste de couleurs nommées ; on passe par un fond de texte
function runOf(run, base = {}) {
    const options = {
        text: run.text,
        bold: run.bold || base.bold,
        italics: run.italic || base.italic,
        underline: run.underline ? {} : undefined,
        strike: run.strike,
        color: hex(run.color || base.color),
        font: run.font || base.font,
        size: run.size ? Math.round(run.size * 2) : base.size,
        shading: run.highlight ? { type: ShadingType.CLEAR, fill: hex(run.highlight), color: 'auto' } : undefined,
        break: run.lineBreak ? 1 : undefined
    };
    return new TextRun(options);
}

function runsOf(runs, base) {
    const children = [];
    for (const run of runs || []) {
        if (run.image) {
            children.push(imageRun(run));
            continue;
        }
        if (run.link) children.push(new ExternalHyperlink({ link: run.link, children: [runOf({ ...run, underline: true, color: run.color || '1F6FD1' }, base)] }));
        else children.push(runOf(run, base));
    }
    return children;
}

function imageRun(block) {
    const match = /^data:image\/(png|jpe?g|gif|bmp);base64,(.+)$/.exec(block.image || '');
    if (!match) return new TextRun('');
    const type = match[1] === 'jpeg' ? 'jpg' : match[1];
    // (largeur en pixels de la page, ramenée à la largeur utile d'une page A4)
    const width = Math.min(block.width || 400, 600);
    const height = Math.round(width * ((block.height || 300) / (block.width || 400)));
    return new ImageRun({ type, data: Buffer.from(match[2], 'base64'), transformation: { width, height } });
}

function paragraphOf(block, theme) {
    const spacing = { after: block.type === 'li' ? 60 : 160, line: Math.round(240 * (theme.lineSpacing || 1.15)) };
    const common = { alignment: ALIGN[block.align], spacing, children: runsOf(block.runs, block.type in HEADINGS ? { color: theme.headingColor, font: theme.headingFont } : {}) };
    if (block.type in HEADINGS) return new Paragraph({ ...common, heading: HEADINGS[block.type] });
    if (block.type === 'li') return new Paragraph({ ...common, numbering: { reference: block.ordered ? 'numeros' : 'puces', level: Math.min(block.level || 0, 3) } });
    if (block.type === 'quote') {
        return new Paragraph({ ...common, indent: { left: CM }, border: { left: { style: BorderStyle.SINGLE, size: 18, color: hex(theme.accent) || '5EE7FF', space: 12 } },
            children: runsOf(block.runs, { italic: true, color: '6A7385' }) });
    }
    if (block.type === 'image') return new Paragraph({ alignment: ALIGN[block.align] || AlignmentType.CENTER, children: [imageRun(block)] });
    if (block.type === 'pagebreak') return new Paragraph({ children: [new PageBreak()] });
    return new Paragraph(common);
}

function tableOf(block, theme) {
    const border = { style: BorderStyle.SINGLE, size: 4, color: 'D6DBE4' };
    const borders = { top: border, bottom: border, left: border, right: border };
    return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: block.rows.map((row, r) => new TableRow({
            ...(r === 0 && block.header ? { tableHeader: true } : {}),
            children: row.map(cell => new TableCell({
                borders,
                shading: r === 0 && block.header ? { type: ShadingType.CLEAR, fill: 'EEF4FB', color: 'auto' } : undefined,
                children: (cell.length ? cell : [{ type: 'p', runs: [] }]).map(b => paragraphOf({ ...b, runs: r === 0 && block.header ? b.runs.map(x => ({ ...x, bold: true, color: x.color || hex(theme.headingColor) })) : b.runs }, theme))
            }))
        }))
    });
}

// `doc` : { blocks, theme: { font, size, headingFont, headingColor, accent, lineSpacing }, page: { margin (cm), orientation }, title }
async function save(file, doc) {
    const theme = doc.theme || {};
    const children = [];
    for (const block of doc.blocks) {
        children.push(block.type === 'table' ? tableOf(block, theme) : paragraphOf(block, theme));
        // (Word veut un paragraphe entre deux tableaux)
        if (block.type === 'table') children.push(new Paragraph(''));
    }
    const margin = Math.round((doc.page?.margin || 2.5) * CM);
    const levels = format => [0, 1, 2, 3].map(level => ({
        level,
        format,
        text: format === LevelFormat.DECIMAL ? `%${level + 1}.` : ['•', '◦', '▪', '•'][level],
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: CM * (level + 1), hanging: Math.round(CM * 0.5) } } }
    }));
    const document = new Document({
        creator: 'Écriture (Robbie OS)',
        title: doc.title || '',
        styles: {
            default: {
                document: { run: { font: theme.font || 'Caladea', size: Math.round((theme.size || 12) * 2), color: '1B2230' } },
                heading1: { run: { font: theme.headingFont || theme.font, size: 52, bold: true, color: hex(theme.titleColor || '0D1A33') }, paragraph: { spacing: { after: 120 } } },
                heading2: { run: { font: theme.headingFont || 'Inter', size: 32, bold: true, color: hex(theme.headingColor || '10406E') }, paragraph: { spacing: { before: 360, after: 120 } } },
                heading3: { run: { font: theme.headingFont || 'Inter', size: 26, bold: true, color: hex(theme.headingColor || '10406E') }, paragraph: { spacing: { before: 240, after: 80 } } }
            }
        },
        numbering: { config: [{ reference: 'puces', levels: levels(LevelFormat.BULLET) }, { reference: 'numeros', levels: levels(LevelFormat.DECIMAL) }] },
        sections: [{
            properties: { page: { margin: { top: margin, bottom: margin, left: margin, right: margin }, size: doc.page?.orientation === 'paysage' ? { orientation: 'landscape' } : {} } },
            children
        }]
    });
    await fs.writeFile(file, await Packer.toBuffer(document));
}

// Ouvrir un .docx : du HTML simple (titres, paragraphes, listes, tableaux, images en ligne)
async function open(file) {
    const result = await mammoth.convertToHtml({ path: file }, {
        styleMap: ['p[style-name=\'Title\'] => h1:fresh', 'p[style-name=\'Titre\'] => h1:fresh', 'p[style-name=\'Subtitle\'] => p.sous:fresh', 'p[style-name=\'Quote\'] => blockquote:fresh', 'p[style-name=\'Citation\'] => blockquote:fresh']
    });
    return result.value;
}

module.exports = { save, open };
