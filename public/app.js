/**
 * MY WARDROBE — app.js
 * index.html と detail.html の両方から読み込む共通ロジック。
 */

/* =====================================================
   1. 定数
   ===================================================== */

const STORAGE_KEY = 'wardrobe_v3';

const EMOJIS = [
  '👕','👖','🧥','👔','👗','🧣','🧤','🧢',
  '👟','👞','👠','👡','👜','👝','🎒','🧦',
  '🩱','🩲','🩳','🩴','🕶️','⌚','💍','🧳',
  '👒','🎩','🥾','👓','🪖','⛑️',
];

const SEASON_LABEL = {
  winter: '❄ Winter',
  spring: '🌸 Spring/Fall',
  summer: '☀ Summer',
  all:    '🔄 通年',
};

function tempToSeason(temp) {
  if (temp == null) return null;
  if (temp <= 15)  return 'winter';
  if (temp <= 24)  return 'spring';
  return 'summer';
}

/* =====================================================
   2. データ管理
   ===================================================== */

let items = [];

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    items = raw ? JSON.parse(raw) : [];
  } catch { items = []; }

  // マイグレーション: season フィールドがない古いデータを補完
  let dirty = false;
  items.forEach(item => {
    if (!item.season) {
      item.season = guessSeasonByCategory(item.category);
      dirty = true;
    }
  });
  if (dirty) save();
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function guessSeasonByCategory(category) {
  if (['アウター','ジャケット','ニット','ベスト'].includes(category)) return 'winter';
  return 'spring';
}

/* =====================================================
   3. 天気（index.html のみ）
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

    const season = tempToSeason(d.temp ?? d.tempMax);
    if (season) {
      elSeason.textContent = SEASON_LABEL[season];
      elSeason.className   = `weather-season-badge ${season}`;
      const btn = document.querySelector(`.chip.season[data-s="${season}"]`);
      if (btn) setSeason(season, btn);
    }

    if (d.fallback) {
      elDate.textContent = '天気の取得に失敗しました（季節を推定中）';
    }
  } catch {
    elDate.textContent = '天気を取得できませんでした';
    elIcon.textContent = '🌡️';
  }
}

/* =====================================================
   4. ソート・フィルター
   ===================================================== */

let sortMode     = 'count-desc';
let seasonFilter = 'all';

function getSorted() {
  const filtered = seasonFilter === 'all'
    ? items.slice()
    : items.filter(item => {
        const s = item.season || 'spring';
        return s === seasonFilter || s === 'all';
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
   5. 一覧描画
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

function seasonShort(s) {
  return { winter:'Winter', spring:'S/F', summer:'Summer', all:'通年' }[s] || s;
}

function render() {
  const listEl = document.getElementById('list');
  if (!listEl) return;

  const sorted = getSorted();
  const count  = document.getElementById('header-count');
  if (count) {
    count.textContent = seasonFilter === 'all'
      ? `${items.length} アイテム`
      : `${sorted.length} / ${items.length} アイテム`;
  }

  if (!sorted.length) {
    const msg = seasonFilter !== 'all'
      ? `${SEASON_LABEL[seasonFilter]} のアイテムがありません`
      : 'まだアイテムがありません';
    listEl.innerHTML = `
      <div class="empty">
        <div class="empty-icon">👗</div>
        <div class="empty-text">${msg}</div>
      </div>`;
    return;
  }

  listEl.innerHTML = sorted.map((item, i) => {
    const b = badge(item.count);
    const s = item.season || 'spring';
    const photoHtml = item.photo
      ? `<img src="${item.photo}" alt="${escHtml(item.name)}" loading="lazy" />`
      : `<div class="card-photo-emoji">${item.emoji}</div>`;

    return `
      <a class="card" href="detail.html?id=${item.id}"
         style="animation-delay:${Math.min(i,14)*0.03}s">
        <div class="card-photo">
          ${photoHtml}
          <span class="card-season ${s}">${seasonShort(s)}</span>
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
   6. アクション（一覧）
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
  render();
}

/* =====================================================
   7. 追加モーダル
   ===================================================== */

function openModal() {
  ['inp-name','inp-brand','inp-color'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const cat = document.getElementById('inp-cat');
  if (cat) cat.value = 'ジャケット';

  const springRadio = document.querySelector('input[name="inp-s"][value="spring"]');
  if (springRadio) springRadio.checked = true;

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
  setTimeout(() => {
    const inp = document.getElementById('inp-name');
    if (inp) inp.focus();
  }, 300);
}

function closeModal() {
  const modal = document.getElementById('modal');
  if (modal) modal.classList.remove('open');
}

function handleOverlayClick(e) {
  if (e.target === document.getElementById('modal')) closeModal();
}

function addItem() {
  const nameEl = document.getElementById('inp-name');
  const name   = nameEl ? nameEl.value.trim() : '';
  if (!name) { showToast('アイテム名を入力してください'); return; }

  const seasonRadio = document.querySelector('input[name="inp-s"]:checked');
  const item = {
    id:       Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name,
    brand:    document.getElementById('inp-brand')?.value.trim()  || '',
    category: document.getElementById('inp-cat')?.value           || 'その他',
    color:    document.getElementById('inp-color')?.value.trim()  || '',
    emoji:    selEmoji,
    photo:    modalPhoto,
    season:   seasonRadio ? seasonRadio.value : 'spring',
    count:    0,
    added:    new Date().toISOString(),
    lastWorn: null,
  };

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
   8. CSV インポート
   ===================================================== */

/**
 * CSVフォーマット（1行目はヘッダー）:
 *   name, brand, category, color, season, count
 *
 * 例:
 *   name,brand,category,color,season,count
 *   Active Jacket,Carhartt,ジャケット,brown,winter,0
 *
 * - season は winter / spring / summer / all のいずれか
 * - count は数値（省略時は 0）
 * - name のみ必須
 */

let csvParsedRows = []; // 確認モーダルに渡す中間データ

function importCSV(event) {
  const file = event.target.files[0];
  if (!file) return;
  // input をリセット（同じファイルを再選択できるように）
  event.target.value = '';

  const reader = new FileReader();
  reader.onload = e => {
    const text = e.target.result;
    const rows = parseCSV(text);
    if (rows.length === 0) { showToast('有効なデータがありません'); return; }
    csvParsedRows = rows;

    // 確認モーダルを表示
    const previewEl = document.getElementById('csv-preview-text');
    if (previewEl) {
      const dupCount = rows.filter(r => isDuplicate(r)).length;
      previewEl.innerHTML =
        `<strong>${rows.length} 件</strong> のアイテムが見つかりました。<br>` +
        (dupCount > 0 ? `うち <strong>${dupCount} 件</strong> は名前が一致するアイテムが既に存在します。` : '重複なし。');
    }
    const csvModal = document.getElementById('csv-modal');
    if (csvModal) csvModal.classList.add('open');
  };
  reader.readAsText(file, 'UTF-8');
}

function closeCsvModal() {
  const csvModal = document.getElementById('csv-modal');
  if (csvModal) csvModal.classList.remove('open');
  csvParsedRows = [];
}

function handleCsvOverlayClick(e) {
  if (e.target === document.getElementById('csv-modal')) closeCsvModal();
}

function confirmImport() {
  const dupRadio = document.querySelector('input[name="dup"]:checked');
  const dupMode  = dupRadio ? dupRadio.value : 'skip'; // skip | overwrite | add
  const now      = new Date().toISOString();
  let added = 0, skipped = 0, overwritten = 0;

  csvParsedRows.forEach(row => {
    const existingIdx = items.findIndex(
      item => item.name === row.name && item.brand === row.brand
    );

    if (existingIdx !== -1) {
      if (dupMode === 'skip') {
        skipped++;
      } else if (dupMode === 'overwrite') {
        // 着用回数・写真は既存を維持、メタ情報のみ上書き
        items[existingIdx] = {
          ...items[existingIdx],
          category: row.category || items[existingIdx].category,
          color:    row.color    || items[existingIdx].color,
          season:   row.season   || items[existingIdx].season,
        };
        overwritten++;
      } else {
        // add: 重複でも追加
        items.push(buildItem(row, now));
        added++;
      }
    } else {
      items.push(buildItem(row, now));
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

function buildItem(row, now) {
  return {
    id:       Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name:     row.name,
    brand:    row.brand    || '',
    category: row.category || 'その他',
    color:    row.color    || '',
    emoji:    EMOJIS[0],
    photo:    null,
    season:   row.season   || guessSeasonByCategory(row.category),
    count:    row.count    || 0,
    added:    now,
    lastWorn: (row.count > 0) ? now : null,
  };
}

function isDuplicate(row) {
  return items.some(item => item.name === row.name && item.brand === row.brand);
}

/**
 * CSV テキストをオブジェクト配列に変換する。
 * 1行目をヘッダーとして扱い、キーにする。
 * @param {string} text
 * @returns {object[]}
 */
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = splitCSVLine(lines[0]).map(h => h.trim().toLowerCase());

  return lines.slice(1).map(line => {
    const vals = splitCSVLine(line);
    const obj  = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] || '').trim(); });

    // 型変換
    const count = parseInt(obj.count, 10);
    obj.count = isNaN(count) ? 0 : count;

    // season バリデーション
    if (!['winter','spring','summer','all'].includes(obj.season)) {
      obj.season = guessSeasonByCategory(obj.category);
    }

    return obj;
  }).filter(r => r.name); // name が空の行は除外
}

/** CSV の1行をカンマで分割（ダブルクォートで囲まれたフィールドに対応） */
function splitCSVLine(line) {
  const result = [];
  let current  = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i+1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

/* =====================================================
   9. 写真処理
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
    const icon = document.getElementById('upload-icon');
    const text = document.getElementById('upload-text');
    if (icon) icon.style.display = 'none';
    if (text) text.style.display = 'none';
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
   10. ユーティリティ
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
   11. 初期データ（シード）
   ===================================================== */

const SEED = [
  { category:'ジャケット', brand:'Carhartt',          name:'Active Jacket',        color:'brown',       season:'winter', count:0 },
  { category:'ジャケット', brand:'USN',                name:'G-1 Flight Jacket',    color:'brown',       season:'winter', count:3 },
  { category:'ジャケット', brand:"Levi's",             name:'70505 Denim Jacket',   color:'blue',        season:'spring', count:5 },
  { category:'ジャケット', brand:'None',               name:'Quilting Jacket',      color:'red',         season:'winter', count:2 },
  { category:'ジャケット', brand:'Stone Island',       name:'Anorak Jacket',        color:'black',       season:'spring', count:2 },
  { category:'ジャケット', brand:'American Classics',  name:'Leather Jacket',       color:'black',       season:'spring', count:1 },
  { category:'ジャケット', brand:'Diesel',             name:'Jacket',               color:'real tree',   season:'spring', count:2 },
  { category:'ジャケット', brand:"Arc'teryx",          name:'Fleece Jacket',        color:'beige',       season:'winter', count:2 },
  { category:'ジャケット', brand:'Paul Smith Jeans',   name:'Quilting Jacket',      color:'blue',        season:'winter', count:1 },
  { category:'ジャケット', brand:'80s',                name:'Quilting Jacket',      color:'blue',        season:'winter', count:0 },
  { category:'ジャケット', brand:'L.L.Bean',           name:'Three-Season Jacket',  color:'pink',        season:'spring', count:1 },
  { category:'ジャケット', brand:'Adidas',             name:'Track Jacket',         color:'blue',        season:'spring', count:1 },
  { category:'ジャケット', brand:'Adidas',             name:'Track Jacket',         color:'red',         season:'spring', count:1 },
  { category:'ジャケット', brand:'None',               name:'Track Jacket',         color:'deep red',    season:'spring', count:0 },
  { category:'ジャケット', brand:'Gear',               name:'Anorak',               color:'black',       season:'spring', count:1 },
  { category:'アウター',   brand:'GAP',                name:'Ski Jacket',           color:'beige',       season:'winter', count:0 },
  { category:'アウター',   brand:'Eddie Bauer',        name:'Down Jacket',          color:'grey',        season:'winter', count:0 },
  { category:'アウター',   brand:'Papas',              name:'Tailored Jacket',      color:'brown',       season:'winter', count:2 },
  { category:'アウター',   brand:'R.Newbold',          name:'Collar Jacket',        color:'brown',       season:'winter', count:3 },
  { category:'アウター',   brand:'Patagonia',          name:'Puff Jacket',          color:'red',         season:'winter', count:0 },
  { category:'アウター',   brand:'Patagonia',          name:'Das Parka',            color:'orange',      season:'winter', count:2 },
  { category:'アウター',   brand:'Patagonia',          name:'Das Parka',            color:'light green', season:'winter', count:6 },
  { category:'アウター',   brand:'Erca',               name:'Coat',                 color:'black',       season:'winter', count:2 },
  { category:'ベスト',     brand:'EMS',                name:'Down Vest',            color:'blue',        season:'winter', count:2 },
  { category:'ベスト',     brand:'Catalina',           name:'Vest',                 color:'navy',        season:'spring', count:0 },
  { category:'シャツ',     brand:'Calvin Klein',       name:'Shirt',                color:'beige',       season:'spring', count:1 },
  { category:'シャツ',     brand:"St. John's Bay",     name:'Shirt',                color:'black',       season:'spring', count:2 },
  { category:'シャツ',     brand:'Preswick & Moore',   name:'Shirt',                color:'brown',       season:'spring', count:2 },
  { category:'シャツ',     brand:'GAP',                name:'Shirt',                color:'black/white', season:'spring', count:0 },
  { category:'シャツ',     brand:'L.L.Bean',           name:'Shirt',                color:'green',       season:'spring', count:0 },
  { category:'シャツ',     brand:'Wrangler',           name:'Shirt',                color:'purple',      season:'spring', count:0 },
  { category:'ニット',     brand:'Jantzen',            name:'Border Knit',          color:'navy',        season:'winter', count:3 },
  { category:'ニット',     brand:'Alfred Dunner',      name:'Leopard Knit',         color:'brown',       season:'winter', count:0 },
  { category:'ニット',     brand:'L.L.Bean',           name:'Cotton Knit',          color:'red',         season:'winter', count:0 },
  { category:'ニット',     brand:'Uniqlo',             name:'Merino Wool Knit',     color:'brown',       season:'winter', count:2 },
  { category:'パーカー',   brand:'Patagonia',          name:'Snap-T Fleece',        color:'green',       season:'winter', count:1 },
  { category:'パーカー',   brand:'None',               name:'Mexican Parka',        color:'blue',        season:'spring', count:3 },
  { category:'パーカー',   brand:'Territory',          name:'Leather Parka',        color:'beige',       season:'spring', count:1 },
  { category:'パーカー',   brand:'None',               name:'Border Parka',         color:'blue',        season:'spring', count:2 },
  { category:'パーカー',   brand:'Nike',               name:'Parka',                color:'navy',        season:'spring', count:0 },
  { category:'パーカー',   brand:'Schott',             name:'Parka',                color:'black',       season:'spring', count:1 },
  { category:'スウェット', brand:'None',               name:'Old English Sweat',    color:'red',         season:'spring', count:2 },
  { category:'スウェット', brand:'Champion',           name:'Reverse Weave',        color:'red',         season:'spring', count:0 },
  { category:'スウェット', brand:'Champion',           name:'Reverse Weave',        color:'black',       season:'spring', count:1 },
  { category:'パンツ',     brand:'Polar Skate Co.',    name:'Big Boy Pants',        color:'brown',       season:'all',    count:3 },
  { category:'パンツ',     brand:"Levi's",             name:'550',                  color:'black',       season:'all',    count:5 },
  { category:'パンツ',     brand:"Levi's",             name:'Bell Bottom',          color:'blue',        season:'all',    count:3 },
  { category:'パンツ',     brand:"Levi's",             name:'501 Kirakira',         color:'blue',        season:'all',    count:2 },
  { category:'パンツ',     brand:"Levi's",             name:'501',                  color:'blue',        season:'all',    count:0 },
  { category:'パンツ',     brand:"Levi's",             name:'501XX',                color:'blue',        season:'all',    count:0 },
  { category:'パンツ',     brand:'Polo Sport',         name:'Corduroy Pants',       color:'brown',       season:'winter', count:2 },
  { category:'パンツ',     brand:'Jos. A. Bank',       name:'Corduroy Pants',       color:'beige',       season:'winter', count:0 },
  { category:'パンツ',     brand:'Unknown',            name:'Corduroy Pants',       color:'black',       season:'winter', count:0 },
  { category:'パンツ',     brand:'Tommy',              name:'Corduroy Pants',       color:'blue',        season:'winter', count:0 },
  { category:'パンツ',     brand:'None',               name:'Real Tree Pants',      color:'real tree',   season:'all',    count:0 },
  { category:'パンツ',     brand:'US Army',            name:'M-65 Field Pants',     color:'green',       season:'spring', count:0 },
  { category:'パンツ',     brand:'Armani',             name:'Slacks',               color:'black',       season:'all',    count:4 },
  { category:'パンツ',     brand:'Dior',               name:'Slacks',               color:'beige',       season:'all',    count:5 },
  { category:'パンツ',     brand:'Perry Ellis',        name:'Slacks',               color:'brown',       season:'all',    count:5 },
  { category:'パンツ',     brand:'LA Apparel',         name:'Sweat Pants',          color:'gray',        season:'all',    count:2 },
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
      photo:    null,
      season:   d.season,
      count:    d.count,
      added:    now,
      lastWorn: d.count > 0 ? now : null,
    });
  });
  save();
}


/* =====================================================
   12. 初期化
   ブラウザ環境でのみ実行する（Vercelがサーバーで
   読み込んでもlocalStorageエラーにならないよう保護）
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
