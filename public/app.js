/**
 * app.js — 一覧ページのロジック（index.html 用）
 */

/* =====================================================
   定数
   ===================================================== */

const EMOJIS = [
  '👕','👖','🧥','👔','👗','🧣','🧤','🧢',
  '👟','👞','👠','👡','👜','👝','🎒','🧦',
  '🩱','🩲','🩳','🩴','🕶️','⌚','💍','🧳',
  '👒','🎩','🥾','👓','🪖','⛑️',
];

const SEASON_META = {
  spring: { label: '🌸 春', cls: 'spring' },
  summer: { label: '☀ 夏',  cls: 'summer' },
  fall:   { label: '🍂 秋', cls: 'fall'   },
  winter: { label: '❄ 冬', cls: 'winter'  },
};

const CATEGORY_LABEL = {
  jacket:'ジャケット', outer:'アウター', parka:'パーカー',
  sweat:'スウェット', shirt:'シャツ', knit:'ニット',
  vest:'ベスト', pants:'パンツ', shoes:'シューズ',
  bag:'バッグ', accessory:'アクセサリー', other:'その他',
};

/* =====================================================
   状態
   ===================================================== */

let currentSeason = 'all';
let currentSort   = 'wear_count';
let currentSearch = '';
let searchTimer   = null;
let selEmoji      = EMOJIS[0];
let modalPhotoB64 = null; // 追加モーダルで選択した写真のBase64
let editingId     = null; // 編集中のアイテムID
let csvParsedRows = [];

/* =====================================================
   天気・季節判定（気温優先、春秋は月で区別）
   ===================================================== */

function detectSeason(month, temp) {
  // 気温で大まかに判定
  if (temp >= 25) return 'summer';
  if (temp <= 10) return 'winter';
  // 気温 11〜24℃ は春秋の境界 → 月で区別
  if (month >= 3 && month <= 6)  return 'spring';
  if (month >= 9 && month <= 11) return 'fall';
  if (month >= 7 && month <= 8)  return 'summer';
  return 'winter';
}

async function loadWeather() {
  const el = {
    date:   document.getElementById('w-date'),
    icon:   document.getElementById('w-icon'),
    label:  document.getElementById('w-label'),
    temp:   document.getElementById('w-temp'),
    season: document.getElementById('w-season'),
  };
  if (!el.date) return;

  try {
    const res = await fetch('/api/weather');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const d = await res.json();

    el.date.textContent  = d.date    || '';
    el.icon.textContent  = d.emoji   || '🌡️';
    el.label.textContent = d.weather || '';
    el.temp.textContent  = (d.tempMin != null && d.tempMax != null)
      ? `${d.tempMin}℃ / ${d.tempMax}℃`
      : (d.temp != null ? `${d.temp}℃` : '');

    const month  = new Date().getMonth() + 1;
    const season = detectSeason(month, d.temp ?? d.tempMax);
    const meta   = SEASON_META[season];
    el.season.textContent = meta.label;
    el.season.className   = `weather-season-badge ${meta.cls}`;

    // 季節フィルターを自動適用
    const btn = document.querySelector(`.chip.season[data-s="${season}"]`);
    if (btn) setSeason(season, btn);

  } catch {
    el.date.textContent = '天気を取得できませんでした';
    el.icon.textContent = '🌡️';
  }
}

/* =====================================================
   フィルター・ソート
   ===================================================== */

function setSort(col, btn) {
  currentSort = col;
  document.querySelectorAll('.chip:not(.season)').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  loadAndRender();
}

function setSeason(s, btn) {
  currentSeason = s;
  document.querySelectorAll('.chip.season').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  loadAndRender();
}

function onSearch(val) {
  clearTimeout(searchTimer);
  const clear = document.getElementById('search-clear');
  if (clear) clear.style.display = val ? '' : 'none';
  searchTimer = setTimeout(() => {
    currentSearch = val;
    loadAndRender();
  }, 350); // デバウンス
}

function clearSearch() {
  const inp = document.getElementById('search-input');
  if (inp) inp.value = '';
  const clear = document.getElementById('search-clear');
  if (clear) clear.style.display = 'none';
  currentSearch = '';
  loadAndRender();
}

/* =====================================================
   データ取得 & 描画
   ===================================================== */

async function loadAndRender() {
  const listEl    = document.getElementById('list');
  const loadingEl = document.getElementById('loading');
  if (!listEl) return;

  listEl.style.display    = 'none';
  loadingEl.style.display = 'flex';

  try {
    const items = await dbGetItems({
      season: currentSeason,
      search: currentSearch,
      sort:   currentSort,
    });
    renderList(items);
  } catch (e) {
    showToast('データの取得に失敗しました');
    console.error(e);
  } finally {
    loadingEl.style.display = 'none';
    listEl.style.display    = '';
  }
}

function renderList(items) {
  const listEl  = document.getElementById('list');
  const countEl = document.getElementById('header-count');
  if (countEl) countEl.textContent = `${items.length} アイテム`;

  if (!items.length) {
    const msg = currentSearch
      ? `「${escHtml(currentSearch)}」に一致するアイテムがありません`
      : currentSeason !== 'all'
        ? `${SEASON_META[currentSeason]?.label} のアイテムがありません`
        : 'まだアイテムがありません';
    listEl.innerHTML = `
      <div class="empty">
        <div class="empty-icon">👗</div>
        <div class="empty-text">${msg}</div>
      </div>`;
    return;
  }

  listEl.innerHTML = items.map((item, i) => {
    const b = badge(item.wear_count);
    const dots = seasonDotsHtml(item);
    const photo = item.photo_url
      ? `<img src="${escHtml(item.photo_url)}" alt="${escHtml(item.name)}" loading="lazy" />`
      : `<div class="card-photo-emoji">${item.emoji || '👕'}</div>`;
    const catLabel = CATEGORY_LABEL[item.category] || item.category || '';
    const stars = item.like_count ? '★'.repeat(Math.min(item.like_count, 5)) : '';

    return `
      <a class="card" href="detail.html?id=${item.id}"
         style="animation-delay:${Math.min(i,14)*0.03}s">
        <div class="card-photo">
          ${photo}
          ${dots}
        </div>
        <div class="card-body">
          <div class="card-name">${escHtml(item.name)}</div>
          ${item.brand ? `<div class="card-brand">${escHtml(item.brand)}</div>` : ''}
          <div class="card-meta">
            ${escHtml(catLabel)}${item.color ? ' · ' + escHtml(item.color) : ''}
          </div>
          ${stars ? `<div class="card-stars">${stars}</div>` : ''}
          <span class="card-badge ${b.cls}">${b.label}</span>
        </div>
        <div class="card-footer">
          <div>
            <div class="wear-num">${item.wear_count}</div>
            <div class="wear-label">WORN</div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:center;gap:5px">
            <button class="wear-btn"
              onclick="event.preventDefault();event.stopPropagation();quickWear('${item.id}',${item.wear_count},this)">＋</button>
            <button class="del-btn"
              onclick="event.preventDefault();event.stopPropagation();deleteItem('${item.id}')">✕</button>
          </div>
        </div>
      </a>`;
  }).join('');
}

function badge(count) {
  if (count === 0)  return { cls: '',     label: '未着用' };
  if (count >= 20)  return { cls: 'high', label: `${count}回 ⭐ ヘビロテ` };
  if (count >= 10)  return { cls: 'mid',  label: `${count}回 よく使う` };
  return { cls: '', label: `${count}回` };
}

function seasonDotsHtml(item) {
  const dots = ['spring','summer','fall','winter']
    .filter(s => item[s])
    .map(s => `<div class="season-dot ${s}"></div>`)
    .join('');
  return dots ? `<div class="card-seasons">${dots}</div>` : '';
}

function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

/* =====================================================
   着用 +1（一覧から）
   ===================================================== */

async function quickWear(id, currentCount, btn) {
  btn.disabled = true;
  try {
    await dbWear(id, currentCount);
    await loadAndRender();
    showToast('+1 着用を記録しました');
  } catch {
    showToast('更新に失敗しました');
  } finally {
    btn.disabled = false;
  }
}

/* =====================================================
   削除（一覧から）
   ===================================================== */

async function deleteItem(id) {
  if (!confirm('このアイテムを削除しますか？')) return;
  try {
    await dbDeletePhoto(id);
    await dbDeleteItem(id);
    await loadAndRender();
    showToast('削除しました');
  } catch {
    showToast('削除に失敗しました');
  }
}

/* =====================================================
   追加モーダル
   ===================================================== */

function openAddModal() {
  editingId = null;
  document.getElementById('modal-title').textContent = 'New Item';
  document.getElementById('modal-submit-btn').textContent = '追加する';

  ['inp-name','inp-brand','inp-color','inp-country','inp-fabric','inp-culture','inp-year'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('inp-cat').value   = 'jacket';
  document.getElementById('inp-like').value  = '';
  document.getElementById('inp-count').value = '0';

  document.querySelectorAll('input[name="inp-seasons"]').forEach(cb => { cb.checked = false; });

  modalPhotoB64 = null;
  resetPhotoArea('modal-photo-area', 'upload-icon', 'upload-text');

  selEmoji = EMOJIS[0];
  renderEmojiGrid();
  document.getElementById('modal').classList.add('open');
  setTimeout(() => document.getElementById('inp-name')?.focus(), 300);
}

function closeModal() {
  document.getElementById('modal')?.classList.remove('open');
}

function handleOverlayClick(e) {
  if (e.target === document.getElementById('modal')) closeModal();
}

async function submitItem() {
  const name = document.getElementById('inp-name')?.value.trim();
  if (!name) { showToast('アイテム名を入力してください'); return; }

  const seasons = [...document.querySelectorAll('input[name="inp-seasons"]:checked')]
    .map(cb => cb.value);
  if (!seasons.length) { showToast('季節を1つ以上選択してください'); return; }

  const btn = document.getElementById('modal-submit-btn');
  btn.disabled = true;
  btn.textContent = '保存中...';

  try {
    const data = buildItemData('inp', seasons, selEmoji);

    let photoUrl = null;
    const item = await dbAddItem(data);

    if (modalPhotoB64 && item) {
      photoUrl = await dbUploadPhoto(item.id, modalPhotoB64);
      await dbUpdateItem(item.id, { photo_url: photoUrl });
    }

    closeModal();
    await loadAndRender();
    showToast(`${name} を追加しました`);
  } catch (e) {
    showToast('追加に失敗しました');
    console.error(e);
  } finally {
    btn.disabled = false;
    btn.textContent = '追加する';
  }
}

function buildItemData(prefix, seasons, emoji) {
  const g = id => document.getElementById(`${prefix}-${id}`)?.value.trim() || null;
  return {
    name:       g('name'),
    brand:      g('brand'),
    category:   g('cat') || 'other',
    color:      g('color'),
    country:    g('country'),
    fabric:     g('fabric'),
    culture:    g('culture'),
    year:       g('year'),
    like_count: parseInt(g('like'), 10) || 0,
    wear_count: parseInt(g('count'), 10) || 0,
    spring:     seasons.includes('spring'),
    summer:     seasons.includes('summer'),
    fall:       seasons.includes('fall'),
    winter:     seasons.includes('winter'),
    emoji:      emoji || '👕',
  };
}

function selectEmoji(e, el) {
  selEmoji = e;
  document.querySelectorAll('.emoji-opt').forEach(x => x.classList.remove('sel'));
  el.classList.add('sel');
}

function renderEmojiGrid() {
  const grid = document.getElementById('emoji-grid');
  if (!grid) return;
  grid.innerHTML = EMOJIS.map(e =>
    `<div class="emoji-opt${e === selEmoji ? ' sel' : ''}" onclick="selectEmoji('${e}',this)">${e}</div>`
  ).join('');
}

/* =====================================================
   写真処理（追加モーダル）
   ===================================================== */

function previewPhoto(event) {
  const file = event.target.files[0];
  if (!file) return;
  readAndCompress(file, 800, 0.82, base64 => {
    modalPhotoB64 = base64;
    setPhotoPreview('modal-photo-area', 'upload-icon', 'upload-text', base64);
  });
}

function resetPhotoArea(areaId, iconId, textId) {
  const area = document.getElementById(areaId);
  if (!area) return;
  area.querySelectorAll('img').forEach(el => el.remove());
  const icon = document.getElementById(iconId);
  const text = document.getElementById(textId);
  if (icon) icon.style.display = '';
  if (text) text.style.display = '';
  const inp = area.querySelector('input[type=file]');
  if (inp) inp.value = '';
}

function setPhotoPreview(areaId, iconId, textId, base64) {
  const area = document.getElementById(areaId);
  if (!area) return;
  area.querySelectorAll('img').forEach(el => el.remove());
  const img = document.createElement('img');
  img.src = base64;
  area.prepend(img);
  const icon = document.getElementById(iconId);
  const text = document.getElementById(textId);
  if (icon) icon.style.display = 'none';
  if (text) text.style.display = 'none';
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
   CSV インポート
   CSVフォーマット:
     category,brand,name,color,country,fabric,culture,
     year,spring,summer,fall,winter,times,like
   ===================================================== */

let csvParsed = [];

function importCSV(event) {
  const file = event.target.files[0];
  if (!file) return;
  event.target.value = '';
  const reader = new FileReader();
  reader.onload = e => {
    const rows = parseCSV(e.target.result);
    if (!rows.length) { showToast('有効なデータがありません'); return; }
    csvParsed = rows;
    const previewEl = document.getElementById('csv-preview-text');
    if (previewEl) previewEl.innerHTML = `<strong>${rows.length} 件</strong> のアイテムが見つかりました。インポートしますか？`;
    document.getElementById('csv-modal')?.classList.add('open');
  };
  reader.readAsText(file, 'UTF-8');
}

function closeCsvModal() {
  document.getElementById('csv-modal')?.classList.remove('open');
  csvParsed = [];
}

function handleCsvOverlayClick(e) {
  if (e.target === document.getElementById('csv-modal')) closeCsvModal();
}

async function confirmImport() {
  const dupMode = document.querySelector('input[name="dup"]:checked')?.value || 'skip';
  const btn = document.querySelector('#csv-modal .btn-add');
  if (btn) { btn.disabled = true; btn.textContent = 'インポート中...'; }

  try {
    // 既存データを取得して重複チェック
    const existing = await dbGetItems({ sort: 'created_at' });
    let added = 0, skipped = 0, overwritten = 0;

    for (const row of csvParsed) {
      const dup = existing.find(
        item => item.name?.toLowerCase() === row.name?.toLowerCase()
             && item.brand?.toLowerCase() === row.brand?.toLowerCase()
      );
      if (dup) {
        if (dupMode === 'skip') { skipped++; continue; }
        if (dupMode === 'overwrite') {
          await dbUpdateItem(dup.id, csvRowToData(row));
          overwritten++;
          continue;
        }
      }
      await dbAddItem(csvRowToData(row));
      added++;
    }

    closeCsvModal();
    await loadAndRender();
    const msgs = [];
    if (added)       msgs.push(`${added} 件追加`);
    if (overwritten) msgs.push(`${overwritten} 件上書き`);
    if (skipped)     msgs.push(`${skipped} 件スキップ`);
    showToast(msgs.join(' / '));
  } catch (e) {
    showToast('インポートに失敗しました');
    console.error(e);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'インポート実行'; }
  }
}

function csvRowToData(row) {
  return {
    name:       row.name       || '',
    brand:      row.brand      || '',
    category:   row.category   || 'other',
    color:      row.color      || '',
    country:    row.country    || '',
    fabric:     row.fabric     || '',
    culture:    row.culture    || '',
    year:       row.year       || '',
    spring:     toBool(row.spring),
    summer:     toBool(row.summer),
    fall:       toBool(row.fall),
    winter:     toBool(row.winter),
    wear_count: toInt(row.times || row.wear_count),
    like_count: toInt(row.like  || row.like_count),
    emoji:      '👕',
  };
}

function toBool(v) { return v === '1' || v === 'true' || v === true; }
function toInt(v)  { const n = parseInt(v, 10); return isNaN(n) ? 0 : n; }

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = splitCSVLine(lines[0]).map(h => h.trim().toLowerCase());
  return lines.slice(1).map(line => {
    const vals = splitCSVLine(line);
    const obj  = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] || '').trim(); });
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
   トースト
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

/* =====================================================
   初期化
   ===================================================== */

if (typeof window !== 'undefined') {
  renderEmojiGrid();
  loadWeather();
  loadAndRender();
}
