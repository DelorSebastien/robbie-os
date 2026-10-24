// Catalogue de la Logithèque : Flathub (en ligne : vitrine, catégories, recherche, fiches)
// et Debian (applis décrites par AppStream, lues sur la machine avec appstreamcli)
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');

const API = 'https://flathub.org/api/v2';
const CACHE = path.join(os.homedir(), '.cache', 'robbie-os', 'logitheque');
// (la vitrine change peu : six heures avant de redemander)
const CACHE_AGE = 6 * 3600 * 1000;

// Catégories de la barre latérale → catégories de Flathub (et de Debian)
const CATEGORIES = {
    jeux: ['Game'],
    creer: ['Graphics'],
    travail: ['Office'],
    multimedia: ['AudioVideo'],
    internet: ['Network'],
    developpement: ['Development'],
    education: ['Education', 'Science'],
    outils: ['Utility', 'System']
};

const run = (command, args) => new Promise(resolve => {
    execFile(command, args, { timeout: 20000, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, LC_MESSAGES: 'C.UTF-8' } },
        (error, stdout) => resolve(error ? '' : stdout));
});

const cacheFile = key => path.join(CACHE, key.replace(/[^a-z0-9._-]+/gi, '_') + '.json');

// Une réponse de Flathub, gardée sur le disque : sans réseau, la dernière vitrine reste visible
async function flathub(route, { body, fresh = CACHE_AGE } = {}) {
    const file = cacheFile(route + (body ? JSON.stringify(body) : ''));
    try {
        if (Date.now() - fs.statSync(file).mtimeMs < fresh) return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {}

    try {
        const response = await fetch(API + route, body
            ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) }
            : { signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error(`Flathub : ${response.status}`);
        const data = await response.json();
        fs.mkdirSync(CACHE, { recursive: true });
        fs.writeFileSync(file, JSON.stringify(data));
        return data;
    } catch (error) {
        try {
            return JSON.parse(fs.readFileSync(file, 'utf8'));
        } catch {
            throw error;
        }
    }
}

// Une appli de Flathub, sous la forme commune aux deux sources
const fromFlathub = hit => ({
    source: 'flathub',
    id: hit.app_id || hit.id,
    name: hit.name,
    summary: hit.summary || '',
    icon: hit.icon || null,
    developer: hit.developer_name || '',
    verified: Boolean(hit.verification_verified),
    installs: hit.installs_last_month || 0
});

// (Flathub liste aussi des extensions et des pilotes : seules les applis sont montrées)
const appsOnly = hits => (hits || []).filter(hit => !hit.type || hit.type === 'desktop-application' || hit.type === 'desktop').map(fromFlathub);

async function collection(name, count = 24) {
    const data = await flathub(`/collection/${name}?page=1&per_page=${count}&locale=fr`);
    return appsOnly(data.hits);
}

async function category(id, page = 1) {
    const names = CATEGORIES[id];
    if (!names) return { apps: [], more: false };
    const pages = await Promise.all(names.map(name => flathub(`/collection/category/${name}?page=${page}&per_page=48&locale=fr`).catch(() => null)));
    const seen = new Set();
    const apps = pages.flatMap(data => appsOnly(data?.hits))
        .filter(app => !seen.has(app.id) && seen.add(app.id))
        .sort((a, b) => b.installs - a.installs);
    return { apps, more: pages.some(data => data && data.page < data.totalPages) };
}

const today = () => new Date().toISOString().slice(0, 10);

// Vitrine : l'appli du jour en grand, puis des rangées
async function showcase() {
    const [day, week, popular, trending, added, games] = await Promise.all([
        flathub(`/app-picks/app-of-the-day/${today()}`).catch(() => null),
        flathub(`/app-picks/apps-of-the-week/${today()}`).catch(() => null),
        collection('popular').catch(() => []),
        collection('trending').catch(() => []),
        collection('recently-added').catch(() => []),
        category('jeux').then(result => result.apps.slice(0, 24)).catch(() => [])
    ]);

    // Sélection de la semaine : les fiches de chaque appli
    const weekApps = (await Promise.all((week?.apps || []).sort((a, b) => a.position - b.position)
        .map(pick => details('flathub', pick.app_id).catch(() => null)))).filter(Boolean);

    // À la une : l'appli du jour, ou la plus populaire si Flathub ne répond pas
    const featuredId = day?.app_id || popular[0]?.id;
    const featured = featuredId ? await details('flathub', featuredId).catch(() => null) : null;

    return {
        featured,
        rows: [
            { id: 'semaine', title: 'Sélection de la semaine', apps: weekApps },
            { id: 'populaires', title: 'Populaires', apps: popular },
            { id: 'tendances', title: 'Tendances', apps: trending },
            { id: 'jeux', title: 'Jeux', apps: games, category: 'jeux' },
            { id: 'nouveautes', title: 'Nouveautés', apps: added }
        ].filter(row => row.apps.length)
    };
}

// ---- Debian (AppStream) ----

// Les blocs de « appstreamcli search » : « Identifier: … / Name: … / Package: … » séparés par ---
function parseAppstream(text) {
    return text.split(/^---$/m).map(block => {
        const entry = {};
        let key = null;
        for (const line of block.split('\n')) {
            const match = line.match(/^([A-Z][\w ]+):\s?(.*)$/);
            if (match) {
                key = match[1];
                entry[key] = match[2];
            } else if (key && /^\s+/.test(line)) {
                entry[key] = `${entry[key]} ${line.trim()}`.trim();
            }
        }
        return entry;
    }).filter(entry => entry.Identifier && entry.Package);
}

const fromDebian = entry => ({
    source: 'debian',
    id: entry.Package,
    appstream: entry.Identifier.split(' ')[0],
    name: entry.Name || entry.Package,
    summary: entry.Summary || '',
    iconName: entry.Icon || null,
    developer: entry.Developer || '',
    verified: true
});

async function searchDebian(query) {
    const text = await run('appstreamcli', ['search', query]);
    const seen = new Set();
    return parseAppstream(text)
        .filter(entry => /\[desktop-application\]/.test(entry.Identifier))
        .filter(entry => !/\(as root\)/i.test(entry.Name || ''))
        .map(fromDebian)
        .filter(app => !seen.has(app.id) && seen.add(app.id))
        .slice(0, 24);
}

async function search(query) {
    const text = String(query || '').trim().slice(0, 80);
    if (!text) return { flathub: [], debian: [] };
    const [flat, debian] = await Promise.all([
        flathub('/search?locale=fr', { body: { query: text }, fresh: 600000 }).then(data => appsOnly(data.hits).slice(0, 36)).catch(() => []),
        searchDebian(text)
    ]);
    return { flathub: flat, debian };
}

// ---- Fiches ----

// Le texte des fiches arrive en HTML simple : seuls les paragraphes et les listes sont gardés
function cleanDescription(html) {
    return String(html || '')
        .replace(/<(\/?)(p|ul|ol|li|em|strong|code)\b[^>]*>/gi, '\u0001$1$2\u0002')
        .replace(/<[^>]*>/g, '')
        .replace(/[<>]/g, '')
        .replace(/\u0001(\/?)(\w+)\u0002/g, '<$1$2>')
        .replace(/\s+/g, ' ')
        .trim();
}

function bestScreenshot(sizes) {
    const usable = (sizes || []).filter(size => Number(size.width) >= 600).sort((a, b) => a.width - b.width);
    return (usable.find(size => Number(size.width) >= 1000) || usable.at(-1) || sizes?.[0])?.src || null;
}

async function details(source, id) {
    if (source === 'debian') return debianDetails(id);

    const data = await flathub(`/appstream/${encodeURIComponent(id)}?locale=fr`);
    const release = data.releases?.[0];
    return {
        source: 'flathub',
        id: data.id,
        name: data.name,
        summary: data.summary || '',
        description: cleanDescription(data.description),
        icon: data.icon || data.icons?.at(-1)?.url || null,
        developer: data.developer_name || '',
        verified: Boolean(data.metadata?.['flathub::verification::verified'] === 'true'),
        license: data.project_license || '',
        free: data.is_free_license !== false,
        website: data.urls?.homepage || null,
        version: release?.version || '',
        released: release?.timestamp ? Number(release.timestamp) * 1000 : null,
        screenshots: (data.screenshots || []).map(shot => bestScreenshot(shot.sizes)).filter(Boolean).slice(0, 8),
        // (couleur de la marque, pour teinter la carte à la une)
        color: data.branding?.find(b => b.scheme_preference === 'dark')?.value || data.branding?.[0]?.value || null,
        categories: data.categories || []
    };
}

async function debianDetails(name) {
    // (appstreamcli trouve une fiche par son identifiant AppStream : on cherche celle du paquet)
    const entry = parseAppstream(await run('appstreamcli', ['search', name])).find(e => e.Package === name);
    if (!entry) {
        const summary = (await run('apt-cache', ['show', '--no-all-versions', name])).match(/^Description(?:-fr)?: (.*)$/m)?.[1] || '';
        return { source: 'debian', id: name, name, summary, description: '', screenshots: [], developer: 'Debian' };
    }

    const full = parseAppstream(await run('appstreamcli', ['get', entry.Identifier.split(' ')[0], '--details']))[0] || entry;
    const version = (await run('apt-cache', ['policy', name])).match(/Candidate: (\S+)/)?.[1] || '';
    return {
        ...fromDebian(full),
        description: full.Description ? `<p>${full.Description.replace(/[<>&]/g, '')}</p>` : '',
        license: full.License || '',
        free: true,
        website: full.Homepage || null,
        version: version === '(none)' ? '' : version,
        screenshots: full['Default Screenshot URL'] ? [full['Default Screenshot URL']] : []
    };
}

module.exports = { showcase, category, search, details, CATEGORIES };
