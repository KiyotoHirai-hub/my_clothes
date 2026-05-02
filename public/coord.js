/**
 * coord.js — コーデ提案ロジック（API不要・ルールベース）
 *
 * 3パターンを生成:
 *   rare   : 着用回数が少ないアイテム優先
 *   color  : 全体の色を3色以内に絞ったコーデ
 *   season : 今日の気温・季節に最も適したコーデ
 */

/* =====================================================
   定数
   ===================================================== */

var STYLES = [
  { id: 'american', icon: '🇺🇸', name: 'American Casual', desc: 'デニム・チノ・ミリタリー' },
  { id: 'outdoor',  icon: '🏕️',  name: 'Outdoor',         desc: 'アウトドア・機能系ブランド' },
  { id: 'street',   icon: '🛹',  name: 'Street',           desc: 'スケート・スポーツミックス' },
  { id: 'euro',     icon: '🇪🇺', name: 'Euro Casual',      desc: 'シンプル・クリーンなヨーロッパ系' },
  { id: 'work',     icon: '👔',  name: 'Work / Smart',     desc: 'きれいめ・オフィスカジュアル' },
  { id: 'vintage',  icon: '📼',  name: 'Vintage',          desc: '古着・ユーズド感のあるスタイル' },
];

// カテゴリ → 役割マッピング
var ROLE = {
  tops:    ['shirt', 'knit', 'parka', 'sweat', 'vest'],
  bottoms: ['pants'],
  outer:   ['jacket', 'outer'],
  all:     ['shirt', 'knit', 'parka', 'sweat', 'vest', 'pants', 'jacket', 'outer', 'shoes', 'bag', 'accessory', 'other'],
};

// 系統 → 関連キーワード（culture / category / fabric でスコアリング）
var STYLE_KEYWORDS = {
  american: ['american', 'us', 'military', 'denim', 'workwear', 'cadual', 'casual', 'anorak'],
  outdoor:  ['outdoor', 'mountain', 'patagonia', 'arcteryx', 'fleece', 'down', 'gore', 'nylon'],
  street:   ['street', 'skate', 'nike', 'adidas', 'sport', 'hoodie', 'parka', 'sweat'],
  euro:     ['euro', 'european', 'minimal', 'clean', 'jp', 'tailored', 'corduroy'],
  work:     ['work', 'tailored', 'slacks', 'shirt', 'smart', 'office', 'clean'],
  vintage:  ['vintage', '80s', '90s', '70s', '00s', 'used', 'retro', 'old'],
};

// 色グループ（近い色をまとめる）
var COLOR_GROUPS = {
  dark:   ['black', 'navy', 'dark', 'charcoal', 'blackish'],
  white:  ['white', 'off white', 'cream', 'ivory', 'light gray', 'light grey'],
  gray:   ['gray', 'grey', 'silver'],
  brown:  ['brown', 'tan', 'beige', 'camel', 'khaki', 'sand', 'earth'],
  blue:   ['blue', 'denim', 'indigo', 'cobalt', 'sky'],
  green:  ['green', 'olive', 'khaki', 'sage', 'forest', 'moss', 'light green'],
  red:    ['red', 'burgundy', 'wine', 'maroon', 'deep red', 'brick'],
  other:  [],
};

/* =====================================================
   状態
   ===================================================== */
var selectedStyles = new Set();
var weatherData    = null;
var allItems       = [];

/* =====================================================
   起動
   ===================================================== */
renderStyleGrid();

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
    var temp   = currentTemp();
    var season = detectSeason(month, temp);
    document.getElementById('ws-desc').textContent =
      (weatherData.date || '') + ' · ' + seasonLabel(season) + 'の気温帯';

  } catch (e) {
    document.getElementById('ws-temp').textContent = '天気を取得できませんでした';
  }
}

/* =====================================================
   アイテム取得
   ===================================================== */
async function loadItems() {
  try {
    allItems = await dbGetItems({ sort: 'wear_count' });
  } catch (e) {
    showToast('アイテムの取得に失敗しました');
  }
}

/* =====================================================
   系統グリッド
   ===================================================== */
function renderStyleGrid() {
  var grid = document.getElementById('style-grid');
  if (!grid) return;
  grid.innerHTML = STYLES.map(function(s) {
    return '<div class="style-card" data-id="' + s.id + '" onclick="toggleStyle(\'' + s.id + '\', this)">'
      + '<div class="style-card-icon">' + s.icon + '</div>'
      + '<div class="style-card-name">' + s.name + '</div>'
      + '<div class="style-card-desc">' + s.desc + '</div>'
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
   コーデ生成メイン
   ===================================================== */
function generateCoord() {
  if (selectedStyles.size === 0) return;
  if (allItems.length < 2) {
    showToast('アイテムが少なすぎます。先に服を登録してください。');
    return;
  }

  document.getElementById('coord-results').innerHTML = '';
  document.getElementById('generating').style.display = 'block';
  document.getElementById('generate-btn').disabled    = true;

  // 非同期に見せるため setTimeout で少し遅延
  setTimeout(function() {
    try {
      var month  = new Date().getMonth() + 1;
      var temp   = currentTemp();
      var season = detectSeason(month, temp);
      var styles = Array.from(selectedStyles);

      // 系統スコアでフィルタリング
      var scoredItems = scoreItems(allItems, styles, season);

      var coords = [
        buildRareCoord(scoredItems, season),
        buildColorCoord(scoredItems, season),
        buildSeasonCoord(scoredItems, season, temp),
      ].filter(Boolean);

      renderCoords(coords, season, temp);
    } catch (e) {
      console.error('generateCoord:', e);
      document.getElementById('coord-results').innerHTML =
        '<div class="coord-error">コーデの生成に失敗しました。<br>' + escHtml(e.message) + '</div>';
    } finally {
      document.getElementById('generating').style.display = 'none';
      document.getElementById('generate-btn').disabled    = false;
    }
  }, 600);
}

/* =====================================================
   アイテムのスコアリング
   選択した系統・季節に合うアイテムにスコアを付ける
   ===================================================== */
function scoreItems(items, styles, season) {
  return items.map(function(item) {
    var score = 0;

    // 季節スコア（今の季節のフラグが true なら加点）
    if (item[season]) score += 3;

    // 系統スコア
    var haystack = [
      item.culture   || '',
      item.category  || '',
      item.fabric    || '',
      item.brand     || '',
      item.name      || '',
    ].join(' ').toLowerCase();

    styles.forEach(function(styleId) {
      var keywords = STYLE_KEYWORDS[styleId] || [];
      keywords.forEach(function(kw) {
        if (haystack.indexOf(kw) !== -1) score += 2;
      });
    });

    return Object.assign({}, item, { _score: score });
  });
}

/* =====================================================
   パターン① 着用少なめコーデ
   wear_count が少ないアイテムを優先しつつ、
   選択系統に合ったものを組み合わせる
   ===================================================== */
function buildRareCoord(items, season) {
  // wear_count 昇順でソート（少ないものが先）、スコア降順を第2キー
  var sorted = items.slice().sort(function(a, b) {
    if (a.wear_count !== b.wear_count) return a.wear_count - b.wear_count;
    return b._score - a._score;
  });

  var tops    = pickByRole(sorted, 'tops',    null);
  var bottoms = pickByRole(sorted, 'bottoms', tops);
  var outer   = pickByRole(sorted, 'outer',   tops || bottoms, true);

  if (!tops || !bottoms) return null;

  var selected = [tops, bottoms, outer].filter(Boolean);
  var avgWorn  = Math.round(selected.reduce(function(s, i) { return s + i.wear_count; }, 0) / selected.length);

  return {
    theme:       'rare',
    title:       '眠っている服を起こすコーデ',
    description: '平均着用回数 ' + avgWorn + ' 回。出番が少なかったアイテムを主役に。',
    items:       selected,
  };
}

/* =====================================================
   パターン② 3色コーデ
   使われている色を色グループに分類し、
   3グループ以内で収まる組み合わせを選ぶ
   ===================================================== */
function buildColorCoord(items, season) {
  // スコア降順（系統一致度が高いものを優先）
  var sorted = items.slice().sort(function(a, b) { return b._score - a._score; });

  // 全組み合わせを試して3色以内のものを探す
  var topCandidates    = filterByRole(sorted, 'tops');
  var bottomCandidates = filterByRole(sorted, 'bottoms');
  var outerCandidates  = filterByRole(sorted, 'outer');

  var best = null;
  var bestColorCount = 99;

  // tops × bottoms の組み合わせを最大30パターン試す
  var limit = Math.min(topCandidates.length, 6);
  var blimit = Math.min(bottomCandidates.length, 5);

  for (var t = 0; t < limit; t++) {
    for (var b = 0; b < blimit; b++) {
      var top    = topCandidates[t];
      var bottom = bottomCandidates[b];
      if (top.id === bottom.id) continue;

      // アウターを加えてみる
      var outerPick = null;
      for (var o = 0; o < Math.min(outerCandidates.length, 4); o++) {
        var candidate = outerCandidates[o];
        if (candidate.id === top.id || candidate.id === bottom.id) continue;
        var groups = getColorGroups([top, bottom, candidate]);
        if (groups.size <= 3 && groups.size < bestColorCount) {
          bestColorCount = groups.size;
          outerPick = candidate;
          best = [top, bottom, candidate];
        }
      }

      // アウターなし
      var groups2 = getColorGroups([top, bottom]);
      if (groups2.size <= 3 && groups2.size < bestColorCount) {
        bestColorCount = groups2.size;
        best = [top, bottom];
      }
    }
  }

  if (!best) {
    // 見つからなければ色数を気にせず2点で返す
    var t0 = topCandidates[0];
    var b0 = bottomCandidates[0];
    if (!t0 || !b0) return null;
    best = [t0, b0];
    bestColorCount = getColorGroups([t0, b0]).size;
  }

  var colorNames = Array.from(getColorGroups(best)).join('・');

  return {
    theme:       'color',
    title:       bestColorCount + '色でまとめたコーデ',
    description: colorNames + ' の ' + bestColorCount + ' 色でシンプルにまとめたコーデ。統一感が出やすい。',
    items:       best,
  };
}

/* =====================================================
   パターン③ 今日の気温コーデ
   季節フラグが一致するアイテムを優先し、
   スコア上位で組み合わせる
   ===================================================== */
function buildSeasonCoord(items, season, temp) {
  // 今日の季節フラグが true のものを優先、次にスコア順
  var sorted = items.slice().sort(function(a, b) {
    var aMatch = a[season] ? 1 : 0;
    var bMatch = b[season] ? 1 : 0;
    if (bMatch !== aMatch) return bMatch - aMatch;
    return b._score - a._score;
  });

  var tops    = pickByRole(sorted, 'tops',    null);
  var bottoms = pickByRole(sorted, 'bottoms', tops);
  var outer   = pickByRole(sorted, 'outer',   tops || bottoms, true);

  if (!tops || !bottoms) return null;

  var selected = [tops, bottoms, outer].filter(Boolean);

  // 気温に応じたコメント
  var tempComment = '';
  if (temp <= 10)      tempComment = '寒い日なので重ね着が基本。';
  else if (temp <= 16) tempComment = 'やや肌寒い。アウターがあると安心。';
  else if (temp <= 23) tempComment = '快適な気温。軽めのレイヤードで。';
  else if (temp <= 28) tempComment = '暖かい日。インナーを薄手に。';
  else                 tempComment = '暑い日。通気性のある素材を選んで。';

  return {
    theme:       'season',
    title:       seasonLabel(season) + 'の気温向けコーデ',
    description: tempComment + ' 今日の ' + temp + '℃ に合わせて' + seasonLabel(season) + 'タグのアイテムで組みました。',
    items:       selected,
  };
}

/* =====================================================
   ヘルパー: 役割別にアイテムを選ぶ
   ===================================================== */
function filterByRole(items, role) {
  var cats = ROLE[role] || [];
  return items.filter(function(item) {
    return cats.indexOf(item.category) !== -1;
  });
}

function pickByRole(items, role, exclude, optional) {
  var candidates = filterByRole(items, role);
  // exclude と同じアイテムは除外
  if (exclude) {
    candidates = candidates.filter(function(item) {
      return item.id !== exclude.id;
    });
  }
  if (!candidates.length) return optional ? null : null;
  return candidates[0]; // スコア順で先頭
}

/* =====================================================
   ヘルパー: 色グループを取得
   ===================================================== */
function getColorGroup(colorStr) {
  if (!colorStr) return 'other';
  var c = colorStr.toLowerCase();
  var groups = Object.keys(COLOR_GROUPS);
  for (var i = 0; i < groups.length; i++) {
    var groupName = groups[i];
    var keywords  = COLOR_GROUPS[groupName];
    for (var j = 0; j < keywords.length; j++) {
      if (c.indexOf(keywords[j]) !== -1) return groupName;
    }
  }
  // マッチしない場合は色文字列そのものをグループ名に
  return c.split(' ')[0] || 'other';
}

function getColorGroups(items) {
  var groups = new Set();
  items.forEach(function(item) {
    if (item.color) groups.add(getColorGroup(item.color));
  });
  return groups;
}

/* =====================================================
   コーデ描画
   ===================================================== */
var THEME_META = {
  rare:   { label: '着用少なめ',    cls: 'rare'   },
  color:  { label: '3色コーデ',     cls: 'color'  },
  season: { label: '今日の気温向け', cls: 'season' },
};

function renderCoords(coords, season, temp) {
  var wrap = document.getElementById('coord-results');

  if (!coords || !coords.length) {
    wrap.innerHTML = '<div class="coord-error">アイテムが少なくコーデを生成できませんでした。<br>トップス・ボトムスのカテゴリを設定した服を登録してください。</div>';
    return;
  }

  wrap.innerHTML = coords.map(function(coord, i) {
    var meta = THEME_META[coord.theme] || { label: coord.theme, cls: 'style' };

    var itemsHtml = coord.items.map(function(item) {
      var photo = item.photo_url
        ? '<img src="' + escHtml(item.photo_url) + '" alt="' + escHtml(item.name) + '" loading="lazy" />'
        : '<div class="coord-item-photo-emoji">' + (item.emoji || '👕') + '</div>';

      return '<div class="coord-item">'
        + '<div class="coord-item-photo">' + photo + '</div>'
        + '<div class="coord-item-name">'  + escHtml(item.name || '') + '</div>'
        + '<div class="coord-item-brand">' + escHtml(item.brand || '') + '</div>'
        + '<div class="coord-item-meta">'
        +   escHtml(item.color || '') + (item.color && item.wear_count != null ? ' · ' : '')
        +   (item.wear_count != null ? item.wear_count + '回' : '')
        + '</div>'
        + '</div>';
    }).join('');

    return '<div class="coord-card" style="animation-delay:' + (i * 0.1) + 's">'
      + '<div class="coord-card-header">'
      + '<span class="coord-theme-badge ' + meta.cls + '">' + meta.label + '</span>'
      + '<span class="coord-card-title">' + escHtml(coord.title) + '</span>'
      + '</div>'
      + '<div class="coord-items">' + itemsHtml + '</div>'
      + '<div class="coord-description">' + escHtml(coord.description) + '</div>'
      + '</div>';
  }).join('');
}

/* =====================================================
   ユーティリティ
   ===================================================== */
function currentTemp() {
  if (!weatherData) return 20;
  if (weatherData.temp   != null) return weatherData.temp;
  if (weatherData.tempMax != null) return weatherData.tempMax;
  return 20;
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
  return { spring: '春', summer: '夏', fall: '秋', winter: '冬' }[s] || s;
}

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
