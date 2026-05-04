/**
 * api/weather.js
 * Vercel Serverless Function — 完全スタンドアロン。
 * app.js など他ファイルは一切 require しない。
 */

const https = require('https');

function buildWeatherUrl(lat, lon) {
  return 'https://api.open-meteo.com/v1/forecast'
    + '?latitude='  + lat
    + '&longitude=' + lon
    + '&current=temperature_2m,weathercode'
    + '&daily=temperature_2m_max,temperature_2m_min'
    + '&timezone=Asia%2FTokyo'
    + '&forecast_days=1';
}

const WMO_LABEL = {
  0:'快晴', 1:'晴れ', 2:'一部曇り', 3:'曇り',
  45:'霧', 48:'霧',
  51:'霧雨', 53:'霧雨', 55:'霧雨',
  61:'雨',  63:'雨',  65:'大雨',
  71:'雪',  73:'雪',  75:'大雪',  77:'雪',
  80:'にわか雨', 81:'にわか雨', 82:'激しい雨',
  85:'にわか雪', 86:'にわか雪',
  95:'雷雨', 96:'雷雨', 99:'雷雨',
};

const WMO_EMOJI = {
  0:'☀️',  1:'🌤️', 2:'⛅',  3:'☁️',
  45:'🌫️', 48:'🌫️',
  51:'🌦️', 53:'🌦️', 55:'🌧️',
  61:'🌧️', 63:'🌧️', 65:'🌧️',
  71:'❄️',  73:'❄️',  75:'❄️',  77:'❄️',
  80:'🌦️', 81:'🌦️', 82:'⛈️',
  85:'🌨️', 86:'🌨️',
  95:'⛈️', 96:'⛈️', 99:'⛈️',
};

function fetchWeather(lat, lon) {
  return new Promise((resolve, reject) => {
    const url = buildWeatherUrl(lat, lon);
    const req = https.get(url, { timeout: 8000 }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          const json    = JSON.parse(body);
          const cur     = json.current;
          const daily   = json.daily;
          const code    = cur.weathercode;
          const tempNow = Math.round(cur.temperature_2m);
          const tempMax = Math.round(daily.temperature_2m_max[0]);
          const tempMin = Math.round(daily.temperature_2m_min[0]);
          const today   = new Date();
          const mm      = String(today.getMonth() + 1).padStart(2, '0');
          const dd      = String(today.getDate()).padStart(2, '0');
          const date    = `${today.getFullYear()}/${mm}/${dd}`;
          resolve({
            date,
            weather: WMO_LABEL[code]  || '—',
            emoji:   WMO_EMOJI[code]  || '🌡️',
            tempNow,
            tempMax,
            tempMin,
            temp: tempMax,
          });
        } catch (e) { reject(e); }
      });
    });
    req.on('error',   reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function fallback() {
  const m    = new Date().getMonth() + 1;
  const temp = (m <= 2 || m === 12) ? 5 : m <= 5 ? 18 : m <= 9 ? 30 : 15;
  const today = new Date();
  const mm    = String(today.getMonth() + 1).padStart(2, '0');
  const dd    = String(today.getDate()).padStart(2, '0');
  return {
    date:     `${today.getFullYear()}/${mm}/${dd}`,
    weather:  '取得失敗',
    emoji:    '🌡️',
    tempNow:  temp,
    tempMax:  temp,
    tempMin:  temp,
    temp,
    fallback: true,
  };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=1800');
  const lat = parseFloat(req.query && req.query.lat) || 34.69;
  const lon = parseFloat(req.query && req.query.lon) || 135.50;
  try {
    const data = await fetchWeather(lat, lon);
    res.status(200).json(data);
  } catch (err) {
    res.status(200).json(fallback());
  }
};
