/**
 * MY WARDROBE — app.js
 * =====================================================
 * 変更点:
 *   - seasons: string[] で春夏秋冬を複数保持
 *   - 月+気温で現在の季節を判定（春と秋を区別）
 *   - 写真は IndexedDB に保存（localStorage の容量節約）
 *   - CSVの全情報（notes等）をアイテムに保持
 * =====================================================
 */

/* =====================================================
   1. 定数
   ===================================================== */

const STORAGE_KEY = 'wardrobe_v4';
const IDB_NAME    = 'wardrobe_photos';
const IDB_STORE   = 'photos';
const IDB_VERSION = 1;

const EMOJIS = [
  '👕','👖','🧥','👔','👗','🧣','🧤','🧢',
  '👟','👞','👠','👡','👜','👝','🎒','🧦',
  '🩱','🩲','🩳','🩴','🕶️','⌚','💍','🧳',
  '👒','🎩','🥾','👓','🪖','⛑️',
];

const SEASON_META = {
  spring: { label: '🌸 春', color: 'var(--spring)' },
  summer: { label: '☀ 夏',  color: 'var(--summer)' },
  fall:   { label: '🍂 秋', color: 'var(--fall)'   },
  winter: { label: '❄ 冬', color: 'var(--winter)'  },
};

/**
 * 月と気温から現在の季節を返す。
 * 春と秋は気温レンジが重なるため、月で区別する。
 *   春: 3〜5月  / 夏: 6〜9月 / 秋: 10〜11月 / 冬: 12〜2月
 * 気温が季節レンジと一致しない場合は月優先。
 */
function detectSeason(month, temp) {
  if (month >= 3  && month <= 5)  return 'spring';
  if (month >= 6  && month <= 9)  return 'summer';
  if (month >= 10 && month <= 11) return 'fall';
  return 'winter';
}

/* =====================================================
   2. IndexedDB（写真ストレージ）
   ===================================================== */

let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = e => {
      e.target.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = e => { _db = e.target.result; resolve(_db); };
    req.onerror   = e => reject(e.target.error);
  });
}

async function savePhoto(id, base64) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(IDB_STORE, 'readwrite');
    const req = tx.objectStore(IDB_STORE).put(base64, id);
    req.onsuccess = () => resolve();
    req.onerror   = e  => reject(e.target.error);
  });
}

async function loadPhoto(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(id);
    req.onsuccess = e => resolve(e.target.result || null);
    req.onerror   = e => reject(e.target.error);
  });
}

async function deletePhoto(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(IDB_STORE, 'readwrite');
    const req = tx.objectStore(IDB_STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = e  => reject(e.target.error);
  });
}

/* =====================================================
   3. データ管理（localStorage）
   ===================================================== */

let items = [];

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    items = raw ? JSON.parse(raw) : [];
  } catch { items = []; }

  // マイグレーション: 旧 season(string) → seasons(array)
  let dirty = false;
  items.forEach(item => {
    if (!item.seasons || !Array.isArray(item.seasons)) {
      const old = item.season || guessSeasonsByCategory(item.category)[0];
      item.seasons = Array.isArray(old) ? old : [old];
      delete item.season;
      dirty = true;
    }
    // 旧 photo フィールドが残っていれば IDB に移行
    if (item.photo) {
      savePhoto(item.id, item.photo).catch(() => {});
      delete item.photo;
      dirty = true;
    }
  });
  if (dirty) save();
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function guessSeasonsByCategory(category) {
  if (['アウター','ジャケット','ニット'].includes(category)) return ['winter'];
  if (['ベスト'].includes(category))                          return ['spring','fall'];
  return ['spring','fall'];
}

/* =====================================================
   4. 天気・季節判定
   ===================================================== */

async function loadWeather() {
  const elDate   = document.getElementById('w-date');
  const elIcon   = document.getElementById('w-icon');
  const elLabel  = document.getElementById('w-label');
  const elTemp   = document.getElementById('w-temp');
  const elSeason = document.getElementById('w-season');
  if (!elDate) return;

  try {
    const res = await fetch('/api/weather');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const d = await res.json();

    elDate.textContent  = d.date    || '';
    elIcon.textContent  = d.emoji   || '🌡️';
    elLabel.textContent = d.weather || '';
    elTemp.textContent  = (d.tempMin != null && d.tempMax != null)
      ? `${d.tempMin}℃ / ${d.tempMax}℃`
      : (d.temp != null ? `${d.temp}℃` : '');

    const month  = new Date().getMonth() + 1;
    const temp   = d.temp ?? d.tempMax;
    const season = detectSeason(month, temp);

    elSeason.textContent = SEASON_META[season].label;
    elSeason.className   = `weather-season-badge ${season}`;

    // 季節フィルターを自動適用
    const btn = document.querySelector(`.chip.season[data-s="${season}"]`);
    if (btn) setSeason(season, btn);

    if (d.fallback) elDate.textContent = '天気の取得に失敗しました（季節を推定中）';

  } catch {
    elDate.textContent = '天気を取得できませんでした';
    elIcon.textContent = '🌡️';
  }
}

/* =====================================================
   5. ソート・フィルター
   ===================================================== */

let sortMode     = 'count-desc';
let seasonFilter = 'all';

function getSorted() {
  const filtered = seasonFilter === 'all'
    ? items.slice()
    : items.filter(item => {
        const ss = item.seasons || [];
        return ss.includes(seasonFilter);
      });

  switch (sortMode) {
    case 'count-desc': return filtered.sort((a, b) => b.count - a.count);
    case 'count-asc':  return filtered.sort((a, b) => a.count - b.count);
    case 'name':       return filtered.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    default:           return filtered;
  }
}

function setSort(mode, btn) {
  sortMode = mode;
  document.querySelectorAll('.chip:not(.season)').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  render();
}

function setSeason(season, btn) {
  seasonFilter = season;
  document.querySelectorAll('.chip.season').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  render();
}

/* =====================================================
   6. 一覧描画
   ===================================================== */

let selEmoji   = EMOJIS[0];
let modalPhoto = null;

function badge(count) {
  if (count === 0)  return { cls: '',     label: '未着用' };
  if (count >= 20)  return { cls: 'high', label: `${count}回 ⭐ ヘビロテ` };
  if (count >= 10)  return { cls: 'mid',  label: `${count}回 よく使う` };
  return { cls: '', label: `${count}回` };
}

function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

/** 季節ドット HTML（カード右上） */
function seasonDotsHtml(seasons) {
  if (!seasons || !seasons.length) return '';
  return `<div class="card-seasons">
    ${seasons.map(s => `<div class="season-dot ${s}"></div>`).join('')}
  </div>`;
}

function render() {
  const listEl = document.getElementById('list');
  if (!listEl) return;

  const sorted = getSorted();
  const countEl = document.getElementById('header-count');
  if (countEl) {
    countEl.textContent = seasonFilter === 'all'
      ? `${items.length} アイテム`
      : `${sorted.length} / ${items.length} アイテム`;
  }

  if (!sorted.length) {
    const msg = seasonFilter !== 'all'
      ? `${SEASON_META[seasonFilter]?.label} のアイテムがありません`
      : 'まだアイテムがありません';
    listEl.innerHTML = `
      <div class="empty">
        <div class="empty-icon">👗</div>
        <div class="empty-text">${msg}</div>
      </div>`;
    return;
  }

  // まずテキストのみで描画（写真は非同期で後から埋める）
  listEl.innerHTML = sorted.map((item, i) => {
    const b = badge(item.count);
    return `
      <a class="card" href="detail.html?id=${item.id}"
         style="animation-delay:${Math.min(i,14)*0.03}s">
        <div class="card-photo" id="cp-${item.id}">
          <div class="card-photo-emoji">${item.emoji}</div>
          ${seasonDotsHtml(item.seasons)}
        </div>
        <div class="card-body">
          <div class="card-name">${escHtml(item.name)}</div>
          ${item.brand ? `<div class="card-brand">${escHtml(item.brand)}</div>` : ''}
          <div class="card-meta">
            ${escHtml(item.category)}${item.color ? ' · ' + escHtml(item.color) : ''}
          </div>
          <span class="card-badge ${b.cls}">${b.label}</span>
        </div>
        <div class="card-footer">
          <div>
            <div class="wear-num">${item.count}</div>
            <div class="wear-label">WORN</div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:center;gap:5px">
            <button class="wear-btn"
              onclick="event.preventDefault();event.stopPropagation();quickWear('${item.id}')">＋</button>
            <button class="del-btn"
              onclick="event.preventDefault();event.stopPropagation();deleteItem('${item.id}')">✕</button>
          </div>
        </div>
      </a>`;
  }).join('');

  // 写真を非同期で読み込んで差し込む
  sorted.forEach(item => {
    loadPhoto(item.id).then(photo => {
      if (!photo) return;
      const wrap = document.getElementById(`cp-${item.id}`);
      if (!wrap) return;
      const dots = wrap.querySelector('.card-seasons')?.outerHTML || '';
      wrap.innerHTML = `<img src="${photo}" alt="${escHtml(item.name)}" loading="lazy" />${dots}`;
    }).catch(() => {});
  });
}

function renderEmojiGrid() {
  const grid = document.getElementById('emoji-grid');
  if (!grid) return;
  grid.innerHTML = EMOJIS.map(e =>
    `<div class="emoji-opt${e === selEmoji ? ' sel' : ''}"
          onclick="selectEmoji('${e}',this)">${e}</div>`
  ).join('');
}

/* =====================================================
   7. アクション（一覧）
   ===================================================== */

function quickWear(id) {
  const item = items.find(x => x.id === id);
  if (!item) return;
  item.count++;
  item.lastWorn = new Date().toISOString();
  save();
  render();
  showToast('+1 着用を記録しました');
}

function deleteItem(id) {
  const item = items.find(x => x.id === id);
  if (!item || !confirm(`「${item.name}」を削除しますか？`)) return;
  items = items.filter(x => x.id !== id);
  save();
  deletePhoto(id).catch(() => {});
  render();
}

/* =====================================================
   8. 追加モーダル
   ===================================================== */

function openModal() {
  ['inp-name','inp-brand','inp-color'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const cat = document.getElementById('inp-cat');
  if (cat) cat.value = 'ジャケット';

  // チェックボックスをリセット
  document.querySelectorAll('input[name="inp-seasons"]')
    .forEach(cb => { cb.checked = false; });

  modalPhoto = null;
  const area = document.getElementById('modal-photo-area');
  if (area) {
    area.querySelectorAll('img').forEach(el => el.remove());
    const icon = document.getElementById('upload-icon');
    const text = document.getElementById('upload-text');
    if (icon) icon.style.display = '';
    if (text) text.style.display = '';
  }
  const pi = document.getElementById('modal-photo-input');
  if (pi) pi.value = '';

  selEmoji = EMOJIS[0];
  renderEmojiGrid();

  const modal = document.getElementById('modal');
  if (modal) modal.classList.add('open');
  setTimeout(() => document.getElementById('inp-name')?.focus(), 300);
}

function closeModal() {
  document.getElementById('modal')?.classList.remove('open');
}

function handleOverlayClick(e) {
  if (e.target === document.getElementById('modal')) closeModal();
}

async function addItem() {
  const name = document.getElementById('inp-name')?.value.trim();
  if (!name) { showToast('アイテム名を入力してください'); return; }

  // チェックされた季節を収集
  const checkedSeasons = [...document.querySelectorAll('input[name="inp-seasons"]:checked')]
    .map(cb => cb.value);
  if (checkedSeasons.length === 0) {
    showToast('季節タグを1つ以上選択してください');
    return;
  }

  const item = {
    id:       Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name,
    brand:    document.getElementById('inp-brand')?.value.trim()  || '',
    category: document.getElementById('inp-cat')?.value           || 'その他',
    color:    document.getElementById('inp-color')?.value.trim()  || '',
    emoji:    selEmoji,
    seasons:  checkedSeasons,
    count:    0,
    added:    new Date().toISOString(),
    lastWorn: null,
  };

  // 写真は IndexedDB に保存
  if (modalPhoto) {
    await savePhoto(item.id, modalPhoto).catch(() => {});
  }

  items.push(item);
  save();
  closeModal();
  render();
  showToast(`${name} を追加しました`);
}

function selectEmoji(e, el) {
  selEmoji = e;
  document.querySelectorAll('.emoji-opt').forEach(x => x.classList.remove('sel'));
  el.classList.add('sel');
}

/* =====================================================
   9. CSV インポート
   CSVフォーマット（ヘッダー行必須・UTF-8）:
     name, brand, category, color, seasons, count, notes
   seasons は複数指定可（例: "spring,fall" または "spring"）
   ===================================================== */

let csvParsedRows = [];

function importCSV(event) {
  const file = event.target.files[0];
  if (!file) return;
  event.target.value = '';

  const reader = new FileReader();
  reader.onload = e => {
    const rows = parseCSV(e.target.result);
    if (!rows.length) { showToast('有効なデータがありません'); return; }
    csvParsedRows = rows;

    const previewEl = document.getElementById('csv-preview-text');
    if (previewEl) {
      const dupCount = rows.filter(r => isDuplicate(r)).length;
      previewEl.innerHTML =
        `<strong>${rows.length} 件</strong> のアイテムが見つかりました。<br>` +
        (dupCount > 0
          ? `うち <strong>${dupCount} 件</strong> は名前・ブランドが一致するアイテムが既に存在します。`
          : '重複なし。');
    }
    document.getElementById('csv-modal')?.classList.add('open');
  };
  reader.readAsText(file, 'UTF-8');
}

function closeCsvModal() {
  document.getElementById('csv-modal')?.classList.remove('open');
  csvParsedRows = [];
}

function handleCsvOverlayClick(e) {
  if (e.target === document.getElementById('csv-modal')) closeCsvModal();
}

function confirmImport() {
  const dupMode = document.querySelector('input[name="dup"]:checked')?.value || 'skip';
  const now = new Date().toISOString();
  let added = 0, skipped = 0, overwritten = 0;

  csvParsedRows.forEach(row => {
    const existIdx = items.findIndex(
      item => item.name === row.name && item.brand === row.brand
    );

    if (existIdx !== -1) {
      if (dupMode === 'skip') {
        skipped++;
      } else if (dupMode === 'overwrite') {
        items[existIdx] = {
          ...items[existIdx],
          category: row.category || items[existIdx].category,
          color:    row.color    || items[existIdx].color,
          seasons:  row.seasons.length ? row.seasons : items[existIdx].seasons,
          notes:    row.notes    || items[existIdx].notes,
        };
        overwritten++;
      } else {
        items.push(buildItemFromRow(row, now));
        added++;
      }
    } else {
      items.push(buildItemFromRow(row, now));
      added++;
    }
  });

  save();
  closeCsvModal();
  render();

  const msgs = [];
  if (added)       msgs.push(`${added} 件追加`);
  if (overwritten) msgs.push(`${overwritten} 件上書き`);
  if (skipped)     msgs.push(`${skipped} 件スキップ`);
  showToast(msgs.join(' / '));
}

function buildItemFromRow(row, now) {
  return {
    id:       Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name:     row.name,
    brand:    row.brand    || '',
    category: row.category || 'その他',
    color:    row.color    || '',
    emoji:    EMOJIS[0],
    seasons:  row.seasons.length ? row.seasons : guessSeasonsByCategory(row.category),
    notes:    row.notes    || '',
    count:    row.count    || 0,
    added:    now,
    lastWorn: row.count > 0 ? now : null,
  };
}

function isDuplicate(row) {
  return items.some(item => item.name === row.name && item.brand === row.brand);
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = splitCSVLine(lines[0]).map(h => h.trim().toLowerCase());

  return lines.slice(1).map(line => {
    const vals = splitCSVLine(line);
    const obj  = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] || '').trim(); });

    // 着用回数
    const c = parseInt(obj.count || obj.times, 10);
    obj.count = isNaN(c) ? 0 : c;

    // 季節（カンマ区切り複数対応）
    const rawSeasons = (obj.seasons || obj.season || '').split(/[,、]/)
      .map(s => s.trim().toLowerCase())
      .filter(s => ['spring','summer','fall','winter'].includes(s));
    obj.seasons = rawSeasons.length ? rawSeasons : guessSeasonsByCategory(obj.category);

    return obj;
  }).filter(r => r.name);
}

function splitCSVLine(line) {
  const result = [];
  let current = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i+1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) {
      result.push(current); current = '';
    } else { current += ch; }
  }
  result.push(current);
  return result;
}

/* =====================================================
   10. 写真処理
   ===================================================== */

function previewPhoto(event) {
  const file = event.target.files[0];
  if (!file) return;
  readAndCompress(file, 800, 0.82, base64 => {
    modalPhoto = base64;
    const area = document.getElementById('modal-photo-area');
    if (!area) return;
    area.querySelectorAll('img').forEach(el => el.remove());
    const img = document.createElement('img');
    img.src = base64;
    area.prepend(img);
    document.getElementById('upload-icon').style.display = 'none';
    document.getElementById('upload-text').style.display = 'none';
  });
}

function readAndCompress(file, maxPx, quality, cb) {
  const reader = new FileReader();
  reader.onload = e => compressImage(e.target.result, maxPx, quality, cb);
  reader.readAsDataURL(file);
}

function compressImage(dataUrl, maxPx, quality, cb) {
  const img = new Image();
  img.onload = () => {
    let w = img.width, h = img.height;
    const r = Math.min(maxPx / w, maxPx / h, 1);
    w = Math.round(w * r); h = Math.round(h * r);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    cb(c.toDataURL('image/jpeg', quality));
  };
  img.src = dataUrl;
}

/* =====================================================
   11. ユーティリティ
   ===================================================== */

let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getMonth()+1}/${d.getDate()}`;
}

/* =====================================================
   12. 初期データ（シード）
   ===================================================== */

const SEED = [
  { category:'ジャケット', brand:'Carhartt',          name:'Active Jacket',        color:'brown',       seasons:['winter'],              count:0 },
  { category:'ジャケット', brand:'USN',                name:'G-1 Flight Jacket',    color:'brown',       seasons:['winter'],              count:3 },
  { category:'ジャケット', brand:"Levi's",             name:'70505 Denim Jacket',   color:'blue',        seasons:['spring','fall'],       count:5 },
  { category:'ジャケット', brand:'None',               name:'Quilting Jacket',      color:'red',         seasons:['winter'],              count:2 },
  { category:'ジャケット', brand:'Stone Island',       name:'Anorak Jacket',        color:'black',       seasons:['spring','fall'],       count:2 },
  { category:'ジャケット', brand:'American Classics',  name:'Leather Jacket',       color:'black',       seasons:['spring','fall'],       count:1 },
  { category:'ジャケット', brand:'Diesel',             name:'Jacket',               color:'real tree',   seasons:['spring','fall'],       count:2 },
  { category:'ジャケット', brand:"Arc'teryx",          name:'Fleece Jacket',        color:'beige',       seasons:['winter'],              count:2 },
  { category:'ジャケット', brand:'Paul Smith Jeans',   name:'Quilting Jacket',      color:'blue',        seasons:['winter'],              count:1 },
  { category:'ジャケット', brand:'80s',                name:'Quilting Jacket',      color:'blue',        seasons:['winter'],              count:0 },
  { category:'ジャケット', brand:'L.L.Bean',           name:'Three-Season Jacket',  color:'pink',        seasons:['spring','fall'],       count:1 },
  { category:'ジャケット', brand:'Adidas',             name:'Track Jacket',         color:'blue',        seasons:['spring','fall'],       count:1 },
  { category:'ジャケット', brand:'Adidas',             name:'Track Jacket',         color:'red',         seasons:['spring','fall'],       count:1 },
  { category:'ジャケット', brand:'None',               name:'Track Jacket',         color:'deep red',    seasons:['spring','fall'],       count:0 },
  { category:'ジャケット', brand:'Gear',               name:'Anorak',               color:'black',       seasons:['spring','fall'],       count:1 },
  { category:'アウター',   brand:'GAP',                name:'Ski Jacket',           color:'beige',       seasons:['winter'],              count:0 },
  { category:'アウター',   brand:'Eddie Bauer',        name:'Down Jacket',          color:'grey',        seasons:['winter'],              count:0 },
  { category:'アウター',   brand:'Papas',              name:'Tailored Jacket',      color:'brown',       seasons:['winter'],              count:2 },
  { category:'アウター',   brand:'R.Newbold',          name:'Collar Jacket',        color:'brown',       seasons:['winter'],              count:3 },
  { category:'アウター',   brand:'Patagonia',          name:'Puff Jacket',          color:'red',         seasons:['winter'],              count:0 },
  { category:'アウター',   brand:'Patagonia',          name:'Das Parka',            color:'orange',      seasons:['winter'],              count:2 },
  { category:'アウター',   brand:'Patagonia',          name:'Das Parka',            color:'light green', seasons:['winter'],              count:6 },
  { category:'アウター',   brand:'Erca',               name:'Coat',                 color:'black',       seasons:['winter'],              count:2 },
  { category:'ベスト',     brand:'EMS',                name:'Down Vest',            color:'blue',        seasons:['winter'],              count:2 },
  { category:'ベスト',     brand:'Catalina',           name:'Vest',                 color:'navy',        seasons:['spring','fall'],       count:0 },
  { category:'シャツ',     brand:'Calvin Klein',       name:'Shirt',                color:'beige',       seasons:['spring','fall'],       count:1 },
  { category:'シャツ',     brand:"St. John's Bay",     name:'Shirt',                color:'black',       seasons:['spring','fall'],       count:2 },
  { category:'シャツ',     brand:'Preswick & Moore',   name:'Shirt',                color:'brown',       seasons:['spring','fall'],       count:2 },
  { category:'シャツ',     brand:'GAP',                name:'Shirt',                color:'black/white', seasons:['spring','fall'],       count:0 },
  { category:'シャツ',     brand:'L.L.Bean',           name:'Shirt',                color:'green',       seasons:['spring','fall'],       count:0 },
  { category:'シャツ',     brand:'Wrangler',           name:'Shirt',                color:'purple',      seasons:['spring','fall'],       count:0 },
  { category:'ニット',     brand:'Jantzen',            name:'Border Knit',          color:'navy',        seasons:['winter'],              count:3 },
  { category:'ニット',     brand:'Alfred Dunner',      name:'Leopard Knit',         color:'brown',       seasons:['winter'],              count:0 },
  { category:'ニット',     brand:'L.L.Bean',           name:'Cotton Knit',          color:'red',         seasons:['winter'],              count:0 },
  { category:'ニット',     brand:'Uniqlo',             name:'Merino Wool Knit',     color:'brown',       seasons:['winter'],              count:2 },
  { category:'パーカー',   brand:'Patagonia',          name:'Snap-T Fleece',        color:'green',       seasons:['winter'],              count:1 },
  { category:'パーカー',   brand:'None',               name:'Mexican Parka',        color:'blue',        seasons:['spring','fall'],       count:3 },
  { category:'パーカー',   brand:'Territory',          name:'Leather Parka',        color:'beige',       seasons:['spring','fall'],       count:1 },
  { category:'パーカー',   brand:'None',               name:'Border Parka',         color:'blue',        seasons:['spring','fall'],       count:2 },
  { category:'パーカー',   brand:'Nike',               name:'Parka',                color:'navy',        seasons:['spring','fall'],       count:0 },
  { category:'パーカー',   brand:'Schott',             name:'Parka',                color:'black',       seasons:['spring','fall'],       count:1 },
  { category:'スウェット', brand:'None',               name:'Old English Sweat',    color:'red',         seasons:['spring','fall'],       count:2 },
  { category:'スウェット', brand:'Champion',           name:'Reverse Weave',        color:'red',         seasons:['spring','fall'],       count:0 },
  { category:'スウェット', brand:'Champion',           name:'Reverse Weave',        color:'black',       seasons:['spring','fall'],       count:1 },
  { category:'パンツ',     brand:'Polar Skate Co.',    name:'Big Boy Pants',        color:'brown',       seasons:['spring','summer','fall','winter'], count:3 },
  { category:'パンツ',     brand:"Levi's",             name:'550',                  color:'black',       seasons:['spring','summer','fall','winter'], count:5 },
  { category:'パンツ',     brand:"Levi's",             name:'Bell Bottom',          color:'blue',        seasons:['spring','summer','fall','winter'], count:3 },
  { category:'パンツ',     brand:"Levi's",             name:'501 Kirakira',         color:'blue',        seasons:['spring','summer','fall','winter'], count:2 },
  { category:'パンツ',     brand:"Levi's",             name:'501',                  color:'blue',        seasons:['spring','summer','fall','winter'], count:0 },
  { category:'パンツ',     brand:"Levi's",             name:'501XX',                color:'blue',        seasons:['spring','summer','fall','winter'], count:0 },
  { category:'パンツ',     brand:'Polo Sport',         name:'Corduroy Pants',       color:'brown',       seasons:['winter'],              count:2 },
  { category:'パンツ',     brand:'Jos. A. Bank',       name:'Corduroy Pants',       color:'beige',       seasons:['winter'],              count:0 },
  { category:'パンツ',     brand:'Unknown',            name:'Corduroy Pants',       color:'black',       seasons:['winter'],              count:0 },
  { category:'パンツ',     brand:'Tommy',              name:'Corduroy Pants',       color:'blue',        seasons:['winter'],              count:0 },
  { category:'パンツ',     brand:'None',               name:'Real Tree Pants',      color:'real tree',   seasons:['spring','summer','fall','winter'], count:0 },
  { category:'パンツ',     brand:'US Army',            name:'M-65 Field Pants',     color:'green',       seasons:['spring','fall'],       count:0 },
  { category:'パンツ',     brand:'Armani',             name:'Slacks',               color:'black',       seasons:['spring','summer','fall','winter'], count:4 },
  { category:'パンツ',     brand:'Dior',               name:'Slacks',               color:'beige',       seasons:['spring','summer','fall','winter'], count:5 },
  { category:'パンツ',     brand:'Perry Ellis',        name:'Slacks',               color:'brown',       seasons:['spring','summer','fall','winter'], count:5 },
  { category:'パンツ',     brand:'LA Apparel',         name:'Sweat Pants',          color:'gray',        seasons:['spring','summer','fall','winter'], count:2 },
];

function seedIfEmpty() {
  if (items.length > 0) return;
  const now = new Date().toISOString();
  SEED.forEach((d, i) => {
    items.push({
      id:       'seed' + String(i).padStart(3, '0'),
      name:     d.name,
      brand:    d.brand,
      category: d.category,
      color:    d.color,
      emoji:    EMOJIS[0],
      seasons:  d.seasons,
      notes:    '',
      count:    d.count,
      added:    now,
      lastWorn: d.count > 0 ? now : null,
    });
  });
  save();
}

/* =====================================================
   13. 初期化（ブラウザ環境のみ）
   ===================================================== */

if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
  load();
  seedIfEmpty();

  if (document.getElementById('list')) {
    render();
    renderEmojiGrid();
    loadWeather();
  }
}
