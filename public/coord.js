/**
 * coord.js — コーデ提案ページのロジック
 */

/* =====================================================
   ファッション系統
   ===================================================== */
var STYLES = [
  { id: 'american', icon: '🇺🇸', name: 'American Casual', desc: 'デニム・チノ・ミリタリー' },
  { id: 'outdoor',  icon: '🏕️',  name: 'Outdoor',         desc: 'アウトドア・機能系ブランド' },
  { id: 'street',   icon: '🛹',  name: 'Street',           desc: 'スケート・スポーツミックス' },
  { id: 'euro',     icon: '🇪🇺', name: 'Euro Casual',      desc: 'シンプル・クリーンなヨーロッパ系' },
  { id: 'work',     icon: '👔',  name: 'Work / Smart',     desc: 'きれいめ・オフィスカジュアル' },
  { id: 'vintage',  icon: '📼',  name: 'Vintage',          desc: '古着・ユーズド感のあるスタイル' },
];

/* =====================================================
   状態
   ===================================================== */
var selectedStyles = new Set();
var weatherData    = null;
var allItems       = [];

/* =====================================================
   起動
   系統グリッドはすぐ描画。天気・アイテムは config 待ち。
   ===================================================== */

// 系統グリッドは config に依存しないのでページ読み込み直後に描画
renderStyleGrid();

// 天気・アイテムは configReady 後
configReady.then(function() {
  loadWeatherData();
  loadItems();
}).catch(function(e) {
  console.error('configReady failed:', e);
  document.getElementById('ws-temp').textContent = '初期化に失敗しました';
});

/* =====================================================
   天気取得
   ===================================================== */
async function loadWeatherData() {
  try {
    var res = await fetch('/api/weather');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    weatherData = await res.json();

    var tempStr = (weatherData.tempMin != null && weatherData.tempMax != null)
      ? weatherData.tempMin + '℃ / ' + weatherData.tempMax + '℃'
      : weatherData.temp != null ? weatherData.temp + '℃' : '—';

    document.getElementById('ws-temp').textContent =
      (weatherData.emoji || '🌡️') + '  ' + tempStr + '  ' + (weatherData.weather || '');

    var month  = new Date().getMonth() + 1;
    var temp   = weatherData.temp != null ? weatherData.temp : weatherData.tempMax;
    var season = detectSeason(month, temp);
    document.getElementById('ws-desc').textContent =
      (weatherData.date || '') + ' · ' + seasonLabel(season) + 'の気温帯';

  } catch (e) {
    console.error('loadWeatherData:', e);
    document.getElementById('ws-temp').textContent = '天気を取得できませんでした';
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
  var map = { spring: '春', summer: '夏', fall: '秋', winter: '冬' };
  return map[s] || s;
}

/* =====================================================
   アイテム取得
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
  var grid = document.getElementById('style-grid');
  if (!grid) return;
  grid.innerHTML = STYLES.map(function(s) {
    return '<div class="style-card" data-id="' + s.id + '" onclick="toggleStyle(\'' + s.id + '\', this)">'
      + '<div class="style-card-icon">' + s.icon + '</div>'
      + '<div class="style-card-name">' + s.name + '</div>'
      + '<div class="style-card-desc">'  + s.desc + '</div>'
      + '</div>';
  }).join('');
}

function toggleStyle(id, el) {
  if (selectedStyles.has(id)) {
    selectedStyles.delete(id);
    el.classList.remove('selected');
  } else {
    selectedStyles.add(id);
    el.classList.add('selected');
  }
  document.getElementById('generate-btn').disabled = (selectedStyles.size === 0);
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

  document.getElementById('generate-btn').disabled = true;
  document.getElementById('generating').style.display = 'block';
  document.getElementById('coord-results').innerHTML  = '';

  try {
    var month  = new Date().getMonth() + 1;
    var temp   = weatherData && weatherData.temp != null ? weatherData.temp
               : weatherData && weatherData.tempMax != null ? weatherData.tempMax : 20;
    var season = detectSeason(month, temp);

    var itemList = allItems.map(function(item) {
      return {
        id:         item.id,
        name:       item.name        || '',
        brand:      item.brand       || '',
        category:   item.category    || '',
        color:      item.color       || '',
        culture:    item.culture     || '',
        spring:     !!item.spring,
        summer:     !!item.summer,
        fall:       !!item.fall,
        winter:     !!item.winter,
        wear_count: item.wear_count  || 0,
      };
    });

    var selectedStyleNames = Array.from(selectedStyles)
      .map(function(id) {
        var found = STYLES.find(function(s) { return s.id === id; });
        return found ? found.name : id;
      }).join('、');

    var prompt = buildPrompt(selectedStyleNames, season, temp, month, itemList);

    var response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages:   [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      var errText = await response.text();
      throw new Error('API error ' + response.status + ': ' + errText);
    }

    var data    = await response.json();
    var content = data.content || [];
    var text    = '';
    for (var i = 0; i < content.length; i++) {
      if (content[i].type === 'text') { text = content[i].text; break; }
    }

    // JSON 配列を抽出
    var jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('JSONが見つかりません。レスポンス:\n' + text.slice(0, 300));

    var coords = JSON.parse(jsonMatch[0]);
    renderCoords(coords);

  } catch (e) {
    console.error('generateCoord:', e);
    document.getElementById('coord-results').innerHTML =
      '<div class="coord-error">コーデの生成に失敗しました。<br>' + escHtml(e.message) + '</div>';
  } finally {
    document.getElementById('generating').style.display = 'none';
    document.getElementById('generate-btn').disabled    = false;
  }
}

/* =====================================================
   プロンプト構築
   テンプレートリテラルのネストを避けるため文字列結合で組み立てる
   ===================================================== */
function buildPrompt(styles, season, temp, month, itemList) {
  var fence     = '```';
  var itemJson  = JSON.stringify(itemList, null, 2);
  var sLabel    = seasonLabel(season);

  return 'あなたはファッションコーディネーターです。\n'
    + 'ユーザーの手持ちのアイテムから、今日のコーデを3パターン提案してください。\n\n'
    + '## 条件\n'
    + '- 希望する系統: ' + styles + '\n'
    + '- 今日の気温: ' + temp + '℃（' + month + '月・' + sLabel + '）\n'
    + '- ' + season + '=true のアイテムを優先してください\n\n'
    + '## アイテム一覧（JSON）\n'
    + fence + 'json\n'
    + itemJson + '\n'
    + fence + '\n\n'
    + '## 出力ルール\n'
    + '以下の3パターンを必ず含めてください:\n'
    + '1. theme="rare"   : wear_countが少ないアイテムを中心にしたコーデ\n'
    + '2. theme="color"  : 全体の色を3色以内に抑えたコーデ（colorフィールドを参照）\n'
    + '3. theme="season" : 今日の気温・季節に最も適したコーデ\n\n'
    + '各コーデはトップス1点・ボトムス1点・必要ならアウター1点（合計2〜4点）を選んでください。\n\n'
    + '以下のJSON配列のみを出力してください（前置きや説明は不要）:\n\n'
    + '[\n'
    + '  {\n'
    + '    "theme": "rare",\n'
    + '    "title": "コーデのタイトル（10文字以内）",\n'
    + '    "description": "コーデのポイント（80文字以内）",\n'
    + '    "item_ids": ["id1", "id2", "id3"]\n'
    + '  },\n'
    + '  { "theme": "color",  "title": "...", "description": "...", "item_ids": [...] },\n'
    + '  { "theme": "season", "title": "...", "description": "...", "item_ids": [...] }\n'
    + ']\n\n'
    + 'item_ids には上記アイテム一覧の id フィールドの値のみを使ってください。';
}

/* =====================================================
   コーデ描画
   ===================================================== */
var THEME_META = {
  rare:   { label: '着用少なめ',     cls: 'rare'   },
  color:  { label: '3色コーデ',      cls: 'color'  },
  season: { label: '今日の気温向け',  cls: 'season' },
};

function renderCoords(coords) {
  var wrap = document.getElementById('coord-results');

  if (!coords || !coords.length) {
    wrap.innerHTML = '<div class="coord-error">コーデを生成できませんでした。再度お試しください。</div>';
    return;
  }

  wrap.innerHTML = coords.map(function(coord, i) {
    var meta  = THEME_META[coord.theme] || { label: coord.theme, cls: 'style' };
    var ids   = coord.item_ids || [];
    var items = ids.map(function(id) {
      return allItems.find(function(item) { return item.id === id; });
    }).filter(Boolean);

    var itemsHtml = items.map(function(item) {
      var photo = item.photo_url
        ? '<img src="' + escHtml(item.photo_url) + '" alt="' + escHtml(item.name) + '" loading="lazy" />'
        : '<div class="coord-item-photo-emoji">' + (item.emoji || '👕') + '</div>';
      return '<div class="coord-item">'
        + '<div class="coord-item-photo">' + photo + '</div>'
        + '<div class="coord-item-name">'  + escHtml(item.name)             + '</div>'
        + '<div class="coord-item-brand">' + escHtml(item.brand || '')      + '</div>'
        + '<div class="coord-item-worn">'  + (item.wear_count || 0) + '回' + '</div>'
        + '</div>';
    }).join('');

    return '<div class="coord-card" style="animation-delay:' + (i * 0.1) + 's">'
      + '<div class="coord-card-header">'
      + '<span class="coord-theme-badge ' + meta.cls + '">' + meta.label + '</span>'
      + '<span class="coord-card-title">' + escHtml(coord.title || '') + '</span>'
      + '</div>'
      + '<div class="coord-items">' + itemsHtml + '</div>'
      + '<div class="coord-description">' + escHtml(coord.description || '') + '</div>'
      + '</div>';
  }).join('');
}

/* =====================================================
   ユーティリティ
   ===================================================== */
function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/[&<>"']/g, function(c) {
    return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":"&#39;" }[c];
  });
}

var toastTimer;
function showToast(msg) {
  var t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function() { t.classList.remove('show'); }, 2500);
}
