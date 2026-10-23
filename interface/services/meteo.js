// Météo du moment (Open-Meteo : gratuit, sans compte)
const CODES = {
    0: ['Ciel dégagé', 'clear'],
    1: ['Plutôt dégagé', 'clear'],
    2: ['Partiellement nuageux', 'partly'],
    3: ['Couvert', 'cloud'],
    45: ['Brouillard', 'fog'],
    48: ['Brouillard givrant', 'fog'],
    51: ['Bruine légère', 'rain'],
    53: ['Bruine', 'rain'],
    55: ['Bruine forte', 'rain'],
    61: ['Pluie légère', 'rain'],
    63: ['Pluie', 'rain'],
    65: ['Forte pluie', 'rain'],
    71: ['Neige légère', 'snow'],
    73: ['Neige', 'snow'],
    75: ['Forte neige', 'snow'],
    80: ['Averses', 'rain'],
    81: ['Averses', 'rain'],
    82: ['Fortes averses', 'rain'],
    95: ['Orage', 'storm'],
    96: ['Orage et grêle', 'storm'],
    99: ['Orage et grêle', 'storm']
};

// Gardée 15 minutes : inutile de redemander plus souvent
let cache = null;

async function current(place) {
    if (cache && cache.key === place.name && Date.now() - cache.time < 15 * 60 * 1000) return cache.data;

    const url = 'https://api.open-meteo.com/v1/forecast'
        + `?latitude=${place.latitude}&longitude=${place.longitude}`
        + '&current=temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m'
        + '&daily=temperature_2m_max,temperature_2m_min&forecast_days=1&timezone=auto';

    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`Météo indisponible (${response.status})`);

    const json = await response.json();
    const [label, kind] = CODES[json.current.weather_code] || ['', 'cloud'];

    const data = {
        city: place.name,
        temperature: Math.round(json.current.temperature_2m),
        feelsLike: Math.round(json.current.apparent_temperature),
        wind: Math.round(json.current.wind_speed_10m),
        max: Math.round(json.daily.temperature_2m_max[0]),
        min: Math.round(json.daily.temperature_2m_min[0]),
        isDay: json.current.is_day === 1,
        label,
        kind
    };

    cache = { key: place.name, time: Date.now(), data };
    return data;
}

module.exports = { current };
