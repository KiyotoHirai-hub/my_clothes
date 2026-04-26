/**
 * MY WARDROBE — detail.js
 * detail.html 専用ロジック。app.js の後に読み込まれる。
 */

const params = new URLSearchParams(location.search);
const itemId = params.get('id');

function currentItem() {
  return items.find(x => x.id === itemId) || null;
}

function renderDetailPage() {
  const item = currentItem();
  if (!item) {
    document.body.innerHTML = `
      <div style="text-align:center;padding:80px 20px;font-family:sans-serif;color:#888">
        <div style="font-size:48px;margin-bottom:16px">👗</div>
        アイテムが見つかりません。<br>
        <a href="index.html"
           style="color:#2c2c2c;margin-top:16px;display:inline-block">← 一覧に戻る</a>
      </div>`;
    return;
  }

  document.title = `${item.name} — MY WARDROBE`;

  // 写真
  const photoWrap = document.getElementById('detail-photo');
  photoWrap.innerHTML = item.photo
    ? `<img src="${item.photo}" alt="${item.name}" />`
    : `<div class="detail-photo-emoji">${item.emoji}</div>`;

  // 季節チップ
  const s  = item.season || 'spring';
  const sc = document.getElementById('detail-season');
  sc.textContent = SEASON_LABEL[s] || s;
  sc.className   = `detail-season-chip ${s}`;

  // 名前・ブランド
  const brandEl = document.getElementById('detail-brand');
  brandEl.textContent    = item.brand || '';
  brandEl.style.display  = item.brand ? '' : 'none';
  document.getElementById('detail-name').textContent = item.name || '';

  // チップ群
  document.getElementById('detail-chips').innerHTML = [
    item.category ? `<span class="info-chip">${item.category}</span>` : '',
    item.color    ? `<span class="info-chip">🎨 ${item.color}</span>` : '',
  ].join('');

  // 統計
  document.getElementById('s-count').textContent = item.count;
  document.getElementById('s-last').textContent  = formatDate(item.lastWorn);
  document.getElementById('s-added').textContent = formatDate(item.added);
}

function wearItem() {
  const item = currentItem();
  if (!item) return;
  item.count++;
  item.lastWorn = new Date().toISOString();
  save();
  renderDetailPage();
  showToast('+1 着用を記録しました');
}

function deleteItem() {
  const item = currentItem();
  if (!item || !confirm(`「${item.name}」を削除しますか？`)) return;
  items = items.filter(x => x.id !== itemId);
  save();
  location.href = 'index.html';
}

function changePhoto(event) {
  const file = event.target.files[0];
  if (!file) return;
  readAndCompress(file, 800, 0.82, base64 => {
    const item = currentItem();
    if (!item) return;
    item.photo = base64;
    save();
    renderDetailPage();
    showToast('写真を更新しました');
  });
}

renderDetailPage();
