/**
 * detail.js — 詳細ページのロジック（detail.html 用）
 */

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

const params = new URLSearchParams(location.search);
const itemId = params.get('id');

let currentItem   = null;
let editPhotoB64  = null; // 編集モーダルで新たに選んだ写真

/* =====================================================
   初期描画
   ===================================================== */

async function init() {
  if (!itemId) { showNotFound(); return; }

  try {
    const item = await dbGetItem(itemId);
    if (!item) { showNotFound(); return; }
    currentItem = item;
    renderDetail(item);
    document.getElementById('detail-loading').style.display = 'none';
    document.getElementById('detail-body').style.display    = '';
  } catch (e) {
    console.error(e);
    showNotFound();
  }
}

function showNotFound() {
  document.getElementById('detail-loading').style.display = 'none';
  document.body.innerHTML = `
    <div style="text-align:center;padding:80px 20px;font-family:sans-serif;color:#888">
      <div style="font-size:48px;margin-bottom:16px">👗</div>
      アイテムが見つかりません。<br>
      <a href="index.html" style="color:#2c2c2c;margin-top:16px;display:inline-block">← 一覧に戻る</a>
    </div>`;
}

function renderDetail(item) {
  document.title = `${item.name} — MY WARDROBE`;

  // 写真
  const photoWrap = document.getElementById('detail-photo');
  photoWrap.innerHTML = item.photo_url
    ? `<img src="${escHtml(item.photo_url)}" alt="${escHtml(item.name)}" />`
    : `<div class="detail-photo-emoji">${item.emoji || '👕'}</div>`;

  // 季節チップ
  const seasonWrap = document.getElementById('detail-seasons');
  seasonWrap.innerHTML = ['spring','summer','fall','winter']
    .filter(s => item[s])
    .map(s => `<span class="detail-season-chip ${s}">${SEASON_META[s].label}</span>`)
    .join('');

  // 名前・ブランド
  const brandEl = document.getElementById('detail-brand');
  brandEl.textContent   = item.brand || '';
  brandEl.style.display = item.brand ? '' : 'none';
  document.getElementById('detail-name').textContent = item.name || '';

  // 全フィールド情報テーブル
  const infoFields = [
    { label: 'カテゴリ',   value: CATEGORY_LABEL[item.category] || item.category },
    { label: 'カラー',     value: item.color   },
    { label: '国',         value: item.country },
    { label: '素材',       value: item.fabric  },
    { label: 'カルチャー', value: item.culture },
    { label: '年代',       value: item.year    },
  ].filter(f => f.value);

  document.getElementById('detail-info-table').innerHTML = infoFields.length
    ? `<div class="info-table">
        ${infoFields.map(f => `
          <div class="info-row">
            <div class="info-label">${escHtml(f.label)}</div>
            <div class="info-value">${escHtml(f.value)}</div>
          </div>`).join('')}
       </div>`
    : '';

  // 統計
  document.getElementById('s-count').textContent = item.wear_count;
  document.getElementById('s-like').textContent  = item.like_count
    ? '★'.repeat(Math.min(item.like_count, 5))
    : '—';
  document.getElementById('s-last').textContent  = formatDate(item.last_worn);
  document.getElementById('s-added').textContent = formatDate(item.created_at);
}

/* =====================================================
   着用 +1
   ===================================================== */

async function wearItem() {
  if (!currentItem) return;
  try {
    const updated = await dbWear(currentItem.id, currentItem.wear_count);
    currentItem = updated || { ...currentItem, wear_count: currentItem.wear_count + 1 };
    renderDetail(currentItem);
    showToast('+1 着用を記録しました');
  } catch {
    showToast('更新に失敗しました');
  }
}

/* =====================================================
   写真変更（詳細ページから直接）
   ===================================================== */

async function changePhoto(event) {
  const file = event.target.files[0];
  if (!file || !currentItem) return;
  readAndCompress(file, 800, 0.82, async base64 => {
    try {
      const url = await dbUploadPhoto(currentItem.id, base64);
      await dbUpdateItem(currentItem.id, { photo_url: url });
      currentItem.photo_url = url;
      renderDetail(currentItem);
      showToast('写真を更新しました');
    } catch {
      showToast('写真の更新に失敗しました');
    }
  });
}

/* =====================================================
   削除
   ===================================================== */

async function deleteItem() {
  if (!currentItem || !confirm(`「${currentItem.name}」を削除しますか？`)) return;
  try {
    await dbDeletePhoto(currentItem.id);
    await dbDeleteItem(currentItem.id);
    location.href = 'index.html';
  } catch {
    showToast('削除に失敗しました');
  }
}

/* =====================================================
   編集モーダル
   ===================================================== */

function openEditModal() {
  if (!currentItem) return;
  const item = currentItem;

  // フォームに現在の値をセット
  const s = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val || '';
  };
  s('edit-name',    item.name);
  s('edit-brand',   item.brand);
  s('edit-color',   item.color);
  s('edit-country', item.country);
  s('edit-fabric',  item.fabric);
  s('edit-culture', item.culture);
  s('edit-year',    item.year);
  s('edit-like',    item.like_count);
  s('edit-count',   item.wear_count);

  const catEl = document.getElementById('edit-cat');
  if (catEl) catEl.value = item.category || 'other';

  // 季節チェックボックス
  document.querySelectorAll('input[name="edit-seasons"]').forEach(cb => {
    cb.checked = !!item[cb.value];
  });

  // 写真プレビュー
  editPhotoB64 = null;
  const area = document.getElementById('edit-photo-area');
  if (area) {
    area.querySelectorAll('img').forEach(el => el.remove());
    const icon = document.getElementById('edit-upload-icon');
    const text = document.getElementById('edit-upload-text');
    if (icon) icon.style.display = '';
    if (text) text.style.display = '';
    if (item.photo_url) {
      const img = document.createElement('img');
      img.src = item.photo_url;
      area.prepend(img);
      if (icon) icon.style.display = 'none';
      if (text) text.style.display = 'none';
    }
    const inp = document.getElementById('edit-photo-input');
    if (inp) inp.value = '';
  }

  document.getElementById('edit-modal')?.classList.add('open');
  setTimeout(() => document.getElementById('edit-name')?.focus(), 300);
}

function closeEditModal() {
  document.getElementById('edit-modal')?.classList.remove('open');
}

function handleEditOverlayClick(e) {
  if (e.target === document.getElementById('edit-modal')) closeEditModal();
}

function previewEditPhoto(event) {
  const file = event.target.files[0];
  if (!file) return;
  readAndCompress(file, 800, 0.82, base64 => {
    editPhotoB64 = base64;
    const area = document.getElementById('edit-photo-area');
    if (!area) return;
    area.querySelectorAll('img').forEach(el => el.remove());
    const img = document.createElement('img');
    img.src = base64;
    area.prepend(img);
    document.getElementById('edit-upload-icon').style.display = 'none';
    document.getElementById('edit-upload-text').style.display = 'none';
  });
}

async function saveEdit() {
  const name = document.getElementById('edit-name')?.value.trim();
  if (!name) { showToast('アイテム名を入力してください'); return; }

  const seasons = [...document.querySelectorAll('input[name="edit-seasons"]:checked')]
    .map(cb => cb.value);
  if (!seasons.length) { showToast('季節を1つ以上選択してください'); return; }

  const btn = document.querySelector('#edit-modal .btn-add');
  if (btn) { btn.disabled = true; btn.textContent = '保存中...'; }

  try {
    const data = {
      name,
      brand:      document.getElementById('edit-brand')?.value.trim()   || null,
      category:   document.getElementById('edit-cat')?.value            || 'other',
      color:      document.getElementById('edit-color')?.value.trim()   || null,
      country:    document.getElementById('edit-country')?.value.trim() || null,
      fabric:     document.getElementById('edit-fabric')?.value.trim()  || null,
      culture:    document.getElementById('edit-culture')?.value.trim() || null,
      year:       document.getElementById('edit-year')?.value.trim()    || null,
      like_count: parseInt(document.getElementById('edit-like')?.value,  10) || 0,
      wear_count: parseInt(document.getElementById('edit-count')?.value, 10) || 0,
      spring: seasons.includes('spring'),
      summer: seasons.includes('summer'),
      fall:   seasons.includes('fall'),
      winter: seasons.includes('winter'),
    };

    // 新しい写真があればアップロード
    if (editPhotoB64) {
      const url = await dbUploadPhoto(currentItem.id, editPhotoB64);
      data.photo_url = url;
    }

    const updated = await dbUpdateItem(currentItem.id, data);
    currentItem = updated || { ...currentItem, ...data };

    closeEditModal();
    renderDetail(currentItem);
    showToast('保存しました');
  } catch (e) {
    showToast('保存に失敗しました');
    console.error(e);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '保存する'; }
  }
}

/* =====================================================
   共通ユーティリティ
   ===================================================== */

function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getMonth()+1}/${d.getDate()}`;
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
   起動（configReady を待ってから実行）
   ===================================================== */
configReady.then(() => init());
