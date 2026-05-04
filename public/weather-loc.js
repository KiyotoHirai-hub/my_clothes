/**
 * weather-loc.js — 場所選択・位置情報取得（index.html / coord.html 共通）
 */

var PRESET_LOCATIONS = [
  { id: 'geo',     name: '現在地', lat: null,  lon: null,   icon: '📍' },
  { id: 'tokyo',   name: '東京',   lat: 35.69, lon: 139.69, icon: '🗼' },
  { id: 'osaka',   name: '大阪',   lat: 34.69, lon: 135.50, icon: '🏯' },
  { id: 'nagoya',  name: '名古屋', lat: 35.18, lon: 136.91, icon: '🏙️' },
  { id: 'kanagawa',name: '神奈川', lat: 35.44, lon: 139.64, icon: '🌊' },
  { id: 'sapporo', name: '札幌',   lat: 43.06, lon: 141.35, icon: '❄️' },
  { id: 'fukuoka', name: '福岡',   lat: 33.59, lon: 130.40, icon: '🌸' },
  { id: 'sendai',  name: '仙台',   lat: 38.27, lon: 140.87, icon: '🌿' },
  { id: 'naha',    name: '那覇',   lat: 26.21, lon: 127.68, icon: '🌺' },
];

var _weatherLoc    = null;  // { name, lat, lon, isGeo? }
var _locChangeHook = null;  // 各ページが setLocChangeHook() で登録する

function setLocChangeHook(fn) { _locChangeHook = fn; }

function getCurrentLoc() {
  return _weatherLoc || { name: '大阪', lat: 34.69, lon: 135.50 };
}

function buildWeatherUrl(lat, lon) {
  return '/api/weather?lat=' + lat + '&lon=' + lon;
}

/* ── ラベル ─────────────────────────────── */
function _getLocLabel(loc) {
  if (!loc) return '📍 —';
  if (loc.isGeo) return '📍 現在地';
  for (var i = 0; i < PRESET_LOCATIONS.length; i++) {
    var p = PRESET_LOCATIONS[i];
    if (p.lat === loc.lat && p.lon === loc.lon) return p.icon + ' ' + p.name;
  }
  return '📍 ' + loc.name;
}

function _updateLocBtn(text) {
  var btn = document.getElementById('loc-btn');
  if (btn) btn.textContent = text;
}

/* ── ピッカー DOM 初期化 ─────────────────── */
function initLocPicker() {
  if (document.getElementById('loc-sheet')) return;
  var sheet = document.createElement('div');
  sheet.id = 'loc-sheet';
  sheet.className = 'loc-sheet';
  sheet.innerHTML =
    '<div class="loc-sheet-bg" onclick="closeLocSheet()"></div>'
    + '<div class="loc-sheet-panel">'
    +   '<div class="loc-sheet-hd">'
    +     '<span class="loc-sheet-ttl">場所を選択</span>'
    +     '<button class="loc-sheet-x" onclick="closeLocSheet()">✕</button>'
    +   '</div>'
    +   '<div class="loc-sheet-list">'
    +   PRESET_LOCATIONS.map(function(loc) {
          return '<button class="loc-sheet-item" id="loc-item-' + loc.id + '"'
            + ' onclick="selectLoc(\'' + loc.id + '\')">'
            + '<span class="loc-icon">' + loc.icon + '</span>'
            + '<span class="loc-name">'  + loc.name  + '</span>'
            + '</button>';
        }).join('')
    +   '</div>'
    + '</div>';
  document.body.appendChild(sheet);
}

function openLocSheet() {
  var sheet = document.getElementById('loc-sheet');
  if (!sheet) return;
  // 現在選択中の項目を強調
  sheet.querySelectorAll('.loc-sheet-item').forEach(function(el) {
    el.classList.remove('active');
  });
  if (_weatherLoc) {
    var activeId = _weatherLoc.isGeo ? 'geo' : null;
    if (!activeId) {
      for (var i = 0; i < PRESET_LOCATIONS.length; i++) {
        var p = PRESET_LOCATIONS[i];
        if (p.lat === _weatherLoc.lat && p.lon === _weatherLoc.lon) {
          activeId = p.id; break;
        }
      }
    }
    var activeEl = activeId ? document.getElementById('loc-item-' + activeId) : null;
    if (activeEl) activeEl.classList.add('active');
  }
  sheet.classList.add('open');
}

function closeLocSheet() {
  var sheet = document.getElementById('loc-sheet');
  if (sheet) sheet.classList.remove('open');
}

function selectLoc(id) {
  closeLocSheet();
  if (id === 'geo') {
    _useGeolocation(true);
    return;
  }
  var found = null;
  for (var i = 0; i < PRESET_LOCATIONS.length; i++) {
    if (PRESET_LOCATIONS[i].id === id) { found = PRESET_LOCATIONS[i]; break; }
  }
  if (!found) return;
  _weatherLoc = { name: found.name, lat: found.lat, lon: found.lon };
  localStorage.setItem('weather_loc', JSON.stringify(_weatherLoc));
  _updateLocBtn(found.icon + ' ' + found.name);
  if (_locChangeHook) _locChangeHook(_weatherLoc);
}

/* ── 位置情報取得 ────────────────────────── */
function _useGeolocation(callHook) {
  _updateLocBtn('📍 取得中…');
  if (!navigator.geolocation) {
    if (!_weatherLoc) _weatherLoc = { name: '大阪', lat: 34.69, lon: 135.50 };
    _updateLocBtn(_getLocLabel(_weatherLoc));
    if (callHook && _locChangeHook) _locChangeHook(_weatherLoc);
    return Promise.resolve(_weatherLoc);
  }
  return new Promise(function(resolve) {
    navigator.geolocation.getCurrentPosition(
      function(pos) {
        _weatherLoc = {
          name: '現在地',
          lat:  Math.round(pos.coords.latitude  * 100) / 100,
          lon:  Math.round(pos.coords.longitude * 100) / 100,
          isGeo: true,
        };
        localStorage.setItem('weather_loc', JSON.stringify(_weatherLoc));
        _updateLocBtn('📍 現在地');
        if (callHook && _locChangeHook) _locChangeHook(_weatherLoc);
        resolve(_weatherLoc);
      },
      function(err) {
        console.warn('Geolocation:', err.message);
        if (!_weatherLoc) _weatherLoc = { name: '大阪', lat: 34.69, lon: 135.50 };
        _updateLocBtn(_getLocLabel(_weatherLoc));
        if (callHook && _locChangeHook) _locChangeHook(_weatherLoc);
        resolve(_weatherLoc);
      },
      { timeout: 10000, maximumAge: 300000 }
    );
  });
}

/* ── 初期化（各ページから呼ぶ） ─────────── */
function initWeatherLoc() {
  initLocPicker();

  // localStorage から復元
  var savedStr = localStorage.getItem('weather_loc');
  if (savedStr) {
    try {
      _weatherLoc = JSON.parse(savedStr);
      _updateLocBtn(_getLocLabel(_weatherLoc));
      return Promise.resolve(_weatherLoc);
    } catch (e) { /* 壊れていたら無視 */ }
  }

  // 初回：位置情報を取得（hook は呼ばない ── ページ側が自分で呼ぶ）
  return _useGeolocation(false);
}
