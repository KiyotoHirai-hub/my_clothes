/**
 * MY WARDROBE — detail.js
 * detail.html 専用ロジック。app.js の後に読み込まれる。
 */

const params = new URLSearchParams(location.search);
const itemId = params.get('id');

function currentItem() {
  return items.find(x => x.id === itemId) || null;
}

async function renderDetailPage() {
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

  // 写真（IndexedDB から非同期取得）
  const photoWrap = document.getElementById('detail-photo');
  photoWrap.innerHTML = `<div class="detail-photo-emoji">${item.emoji}</div>`;
  loadPhoto(item.id).then(photo => {
    if (!photo) return;
    photoWrap.innerHTML = `<img src="${photo}" alt="${item.name}" />`;
  }).catch(() => {});

  // 季節チップ群
  const seasonsWrap = document.getElementById('detail-seasons');
  seasonsWrap.innerHTML = (item.seasons || []).map(s => {
    const meta = SEASON_META[s];
    return meta
      ? `<span class="detail-season-chip ${s}">${meta.label}</span>`
      : '';
  }).join('');

  // 名前・ブランド
  const brandEl = document.getElementById('detail-brand');
  brandEl.textContent   = item.brand || '';
  brandEl.style.display = item.brand ? '' : 'none';
  document.getElementById('detail-name').textContent = item.name || '';

  // 情報チップ（CSVの全フィールドを表示）
  const chips = [];
  if (item.category) chips.push(`<span class="info-chip">📂 ${escHtml(item.category)}</span>`);
  if (item.color)    chips.push(`<span class="info-chip">🎨 ${escHtml(item.color)}</span>`);
  if (item.notes)    chips.push(`<span class="info-chip">📝 ${escHtml(item.notes)}</span>`);
  document.getElementById('detail-chips').innerHTML = chips.join('');

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
  deletePhoto(itemId).catch(() => {});
  location.href = 'index.html';
}

function changePhoto(event) {
  const file = event.target.files[0];
  if (!file) return;
  readAndCompress(file, 800, 0.82, async base64 => {
    await savePhoto(itemId, base64).catch(() => {});
    renderDetailPage();
    showToast('写真を更新しました');
  });
}

renderDetailPage();
