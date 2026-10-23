// Fond « au fil du jour » : six photos du même lac, de l'aurore à la nuit.
// Le lever et le coucher du soleil sont calculés pour la ville des réglages (sans internet),
// et chaque photo arrive en fondu très lent par-dessus la précédente : le ciel change
// pendant qu'on travaille, sans effet de diaporama.
// (servi à la page, et à Electron pour le fond de l'écran de verrouillage)
(function (root) {
    const DOSSIER = 'assets/fonds/jour';
    const PHOTOS = ['aurore', 'matinee', 'midi', 'apres-midi', 'crepuscule', 'nuit'];
    const rad = Math.PI / 180;

    // Lever, midi solaire et coucher du soleil le jour de `date`, en minutes depuis minuit (heure locale)
    function sunTimes(date, latitude, longitude) {
        const day = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 86400000);
        const declination = -23.44 * rad * Math.cos(2 * Math.PI / 365 * (day + 10));
        const b = 2 * Math.PI * (day - 81) / 364;
        const equationOfTime = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
        const lat = latitude * rad;
        // (-0.833° : le soleil est « levé » un peu avant d'être au-dessus de l'horizon, à cause de l'air)
        const cos = (Math.sin(-0.833 * rad) - Math.sin(lat) * Math.sin(declination)) / (Math.cos(lat) * Math.cos(declination));
        const halfDay = Math.acos(Math.min(1, Math.max(-1, cos))) / rad * 4;
        const noon = 720 - longitude * 4 - equationOfTime - date.getTimezoneOffset();
        return { sunrise: noon - halfDay, noon, sunset: noon + halfDay };
    }

    // Moment où chaque photo est pleinement là, et durée du fondu qui l'amène
    function keyframes({ sunrise, noon, sunset }) {
        const frames = [
            { photo: 'aurore', at: sunrise + 10, fade: 70 },
            { photo: 'matinee', at: sunrise + (noon - sunrise) * 0.45, fade: 60 },
            { photo: 'midi', at: noon - 30, fade: 60 },
            { photo: 'apres-midi', at: sunset - 50, fade: 60 },
            { photo: 'crepuscule', at: sunset + 25, fade: 45 },
            { photo: 'nuit', at: sunset + 90, fade: 55 }
        ];
        // Journées très courtes : un fondu ne commence pas avant que la photo d'avant soit arrivée
        frames.forEach((frame, i) => {
            if (i > 0) frame.fade = Math.max(10, Math.min(frame.fade, frame.at - frames[i - 1].at));
        });
        return frames;
    }

    // Les deux photos à montrer : `from` en dessous, `to` par-dessus avec l'opacité `amount` (0 à 1)
    function mix(date, latitude, longitude) {
        const frames = keyframes(sunTimes(date, latitude, longitude));
        const now = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
        let index = frames.findLastIndex(frame => frame.at <= now);
        let next = frames[index + 1];
        let end = next?.at;
        // Après la nuit, la prochaine photo est l'aurore du lendemain ; avant l'aurore, c'est la nuit de la veille
        if (index === frames.length - 1) {
            next = frames[0];
            end = next.at + 1440;
        } else if (index < 0) {
            index = frames.length - 1;
            end = next.at;
        }
        const t = Math.min(1, Math.max(0, (now - (end - next.fade)) / next.fade));
        return { from: frames[index].photo, to: next.photo, amount: t * t * (3 - 2 * t) };
    }

    // La photo qui domine en ce moment (pour un fond fixe : verrouillage, aperçu)
    function current(date, latitude, longitude) {
        const { from, to, amount } = mix(date, latitude, longitude);
        return amount < 0.5 ? from : to;
    }

    const api = { DOSSIER, PHOTOS, sunTimes, mix, current };
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.soleil = api;
})(this);
