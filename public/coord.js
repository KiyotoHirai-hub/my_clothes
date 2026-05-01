/**
 * coord.js — コーデ提案ページのロジック
 * Claude API を使って、アイテム一覧から複数パターンのコーデを生成する。
 */

/* =====================================================
   ファッション系統の定義
   ===================================================== */
const STYLES = [
  { id: 'american',  icon: '🇺🇸', name: 'American Casual', desc: 'デニム・チノ・ミリタリー' },
  { id: 'outdoor',   icon: '🏕️',  name: 'Outdoor',         desc: 'アウトドア・機能系ブランド' },
  { id: 'street',    icon: '🛹',  name: 'Street',           desc: 'スケート・スポーツミックス' },
  { id: 'euro',      icon: '🇪🇺', name: 'Euro Casual',      desc: 'シンプル・クリーンなヨーロッパ系' },
  { id: 'work',      icon: '👔',  name: 'Work / Smart',     desc: 'きれいめ・オフィスカジュアル' },
  { id: 'vintage',   icon: '📼',  name: 'Vintage',          desc: '古着・ユーズド感のあるスタイル' },
];

/* =====================================================
   状態
   ===================================================== */
let selectedStyles = new Set();
let weatherData    = null;
let allItems       = [];

/* =====================================================
   初期化
   ===================================================== */
async function init() {
  renderStyleGrid();
  await configReady;
  await Promise.all([loadWeatherData(), loadItems()]);
}

/* =====================================================
   天気データ取得
   ===================================================== */
async function loadWeatherData() {
  try {
    const res = await fetch('/api/weather');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    weatherData = await res.json();

    const tempStr = weatherData.tempMin != null && weatherData.tempMax != null
      ? `${weatherData.tempMin}℃ / ${weatherData.tempMax}℃`
      : weatherData.temp != null ? `${weatherData.temp}℃` : '—';

    document.getElementById('ws-temp').textContent =
      `${weatherData.emoji || '🌡️'}  ${tempStr}  ${weatherData.weather || ''}`;

    const month  = new Date().getMonth() + 1;
    const temp   = weatherData.temp ?? weatherData.tempMax;
    const season = detectSeason(month, temp);
    document.getElementById('ws-desc').textContent =
      `${weatherData.date || ''} · ${seasonLabel(season)}の気温帯`;

  } catch {
    document.getElementById('ws-temp').textContent = '天気の取得に失敗しました';
  }
}

function detectSeason(month, temp) {
  if (temp >= 25) return 'summer';
  if (temp <= 10) return 'winter';
  if (month >= 3 && month <= 6)  return 'spring';
  if (month >= 9 && month <= 11) return 'fall';
  if (month >= 7 && month <= 8)  return 'summer';
  return 'winter';
}

function seasonLabel(s) {
  return { spring:'春', summer:'夏', fall:'秋', winter:'冬' }[s] || s;
}

/* =====================================================
   アイテム一覧取得
   ===================================================== */
async function loadItems() {
  try {
    allItems = await dbGetItems({ sort: 'wear_count' });
  } catch (e) {
    console.error('loadItems:', e);
    showToast('アイテムの取得に失敗しました');
  }
}

/* =====================================================
   系統グリッド描画
   ===================================================== */
function renderStyleGrid() {
  const grid = document.getElementById('style-grid');
  grid.innerHTML = STYLES.map(s => `
    <div class="style-card" data-id="${s.id}" onclick="toggleStyle('${s.id}', this)">
      <div class="style-card-icon">${s.icon}</div>
      <div class="style-card-name">${s.name}</div>
      <div class="style-card-desc">${s.desc}</div>
    </div>
  `).join('');
}

function toggleStyle(id, el) {
  if (selectedStyles.has(id)) {
    selectedStyles.delete(id);
    el.classList.remove('selected');
  } else {
    selectedStyles.add(id);
    el.classList.add('selected');
  }
  document.getElementById('generate-btn').disabled = selectedStyles.size === 0;
}

/* =====================================================
   コーデ生成
   ===================================================== */
async function generateCoord() {
  if (selectedStyles.size === 0) return;
  if (allItems.length === 0) {
    showToast('アイテムがありません。先に服を登録してください。');
    return;
  }

  // UI 切り替え
  document.getElementById('generate-btn').disabled = true;
  document.getElementById('generating').style.display = 'block';
  document.getElementById('coord-results').innerHTML  = '';

  try {
    const month  = new Date().getMonth() + 1;
    const temp   = weatherData?.temp ?? weatherData?.tempMax ?? 20;
    const season = detectSeason(month, temp);

    // Claude API に渡すアイテムリスト（写真URLは除いてサイズを抑える）
    const itemList = allItems.map(item => ({
      id:         item.id,
      name:       item.name,
      brand:      item.brand      || '',
      category:   item.category   || '',
      color:      item.color      || '',
      culture:    item.culture    || '',
      fabric:     item.fabric     || '',
      year:       item.year       || '',
      spring:     item.spring,
      summer:     item.summer,
      fall:       item.fall,
      winter:     item.winter,
      wear_count: item.wear_count || 0,
      has_photo:  !!item.photo_url,
    }));

    const selectedStyleNames = [...selectedStyles]
      .map(id => STYLES.find(s => s.id === id)?.name || id)
      .join('、');

    const prompt = buildPrompt({
      styles:   selectedStyleNames,
      season,
      temp,
      month,
      itemList,
    });

    // Claude API 呼び出し
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`API error: ${err}`);
    }

    const data = await response.json();
    const text = data.content?.find(b => b.type === 'text')?.text || '';

    // JSON を抽出してパース
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) ||
                      text.match(/(\[[\s\S]*\])/);
    if (!jsonMatch) throw new Error('JSONが見つかりません:\n' + text);

    const coords = JSON.parse(jsonMatch[1]);
    renderCoords(coords);

  } catch (e) {
    console.error('generateCoord:', e);
    document.getElementById('coord-results').innerHTML = `
      <div class="coord-error">
        コーデの生成に失敗しました。<br>
        ${escHtml(e.message)}
      </div>`;
  } finally {
    document.getElementById('generating').style.display = 'none';
    document.getElementById('generate-btn').disabled    = false;
  }
}

/* =====================================================
   プロンプト構築
   ===================================================== */
function buildPrompt({ styles, season, temp, month, itemList }) {
  return `あなたはファッションコーディネーターです。
ユーザーの手持ちのアイテムから、今日のコーデを3パターン提案してください。

## 条件
- 希望する系統: ${styles}
- 今日の気温: ${temp}℃（${month}月・${seasonLabel(season)}）
- 季節フィールドがtrueのものを優先（例: ${season}=trueのアイテム）

## アイテム一覧（JSON）
\`\`\`json
${JSON.stringify(itemList, null, 2)}
\`\`\`

## 出力形式
以下の3パターンを必ず含めてください:
1. **rare** — 着用回数(wear_count)が少ないアイテムを中心にしたコーデ
2. **color** — 全体の色を3色以内に抑えたコーデ（colorフィールドを参照）
3. **season** — 今日の気温・季節に最も適したコーデ

各コーデには tops（トップス系）1点、bottoms（ボトムス系）1点、outer（アウター）0〜1点 を選んでください。
必要に応じてその他カテゴリのアイテムも追加できます（合計2〜4点）。

以下のJSON配列のみを出力してください（説明文・前置き・コードブロック記号```json...```を含めてよい）:

[
  {
    "theme": "rare",
    "title": "コーデのタイトル（10文字以内）",
    "description": "このコーデのポイントや着こなしのコツ（80文字以内）",
    "item_ids": ["アイテムのidをカンマ区切りで"]
  },
  {
    "theme": "color",
    "title": "...",
    "description": "...",
    "item_ids": [...]
  },
  {
    "theme": "season",
    "title": "...",
    "description": "...",
    "item_ids": [...]
  }
]

item_ids には上記アイテム一覧の id フィールドの値を使ってください。
存在するIDのみを使い、実際のアイテムの色・カテゴリ・素材を考慮してコーデを組んでください。`;
}

/* =====================================================
   コーデ描画
   ===================================================== */
const THEME_META = {
  rare:   { label: '着用少なめ',    cls: 'rare'   },
  color:  { label: '3色コーデ',     cls: 'color'  },
  season: { label: '今日の気温向け', cls: 'season' },
};

function renderCoords(coords) {
  const wrap = document.getElementById('coord-results');

  if (!coords || !coords.length) {
    wrap.innerHTML = '<div class="coord-error">コーデを生成できませんでした。</div>';
    return;
  }

  wrap.innerHTML = coords.map((coord, i) => {
    const meta  = THEME_META[coord.theme] || { label: coord.theme, cls: 'style' };
    const items = (coord.item_ids || [])
      .map(id => allItems.find(item => item.id === id))
      .filter(Boolean);

    const itemsHtml = items.map(item => {
      const photo = item.photo_url
        ? `<img src="${escHtml(item.photo_url)}" alt="${escHtml(item.name)}" loading="lazy" />`
        : `<div class="coord-item-photo-emoji">${item.emoji || '👕'}</div>`;
      return `
        <div class="coord-item">
          <div class="coord-item-photo">${photo}</div>
          <div class="coord-item-name">${escHtml(item.name)}</div>
          <div class="coord-item-brand">${escHtml(item.brand || '')}</div>
          <div class="coord-item-worn">${item.wear_count}回着用</div>
        </div>`;
    }).join('');

    return `
      <div class="coord-card" style="animation-delay:${i*0.1}s">
        <div class="coord-card-header">
          <span class="coord-theme-badge ${meta.cls}">${meta.label}</span>
          <span class="coord-card-title">${escHtml(coord.title || '')}</span>
        </div>
        <div class="coord-items">${itemsHtml}</div>
        <div class="coord-description">${escHtml(coord.description || '')}</div>
      </div>`;
  }).join('');
}

/* =====================================================
   ユーティリティ
   ===================================================== */
function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
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
   起動
   ===================================================== */
configReady.then(() => init()).catch(e => {
  console.error('init failed:', e);
  document.getElementById('ws-temp').textContent = '初期化に失敗しました';
});
