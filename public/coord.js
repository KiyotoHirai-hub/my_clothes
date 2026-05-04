/**
 * coord.js — コーデ提案エンジン（ルールベース・API不要）
 *
 * 共通ルール（全パターンに適用）:
 *   R1. 色は3色以内（同系色は1色扱い）
 *   R2. 派手な色は1色だけ
 *   R3. 派手な柄は1つだけ
 *   R4. ブラック / ホワイト / グリーン / ブラウン のいずれかを必ず1つ含む
 *   R5. 季節に合ったアイテムを優先
 *   R6. 気温に合わせた重ね着レベル
 *   R7. 素材が異なるアイテムを含む（レザーなど1種類だけ）
 *
 * 3パターンの差別化:
 *   rare   → wear_count が少ないアイテムを最優先
 *   color  → 共通ルールを最も厳密に守った「完璧な3色コーデ」
 *   season → 季節・気温の一致度を最優先
 */

/* ===================================================
   定数
   =================================================== */

var STYLES = [
  { id: 'american', icon: '🇺🇸', name: 'American Casual', desc: 'デニム・チノ・ミリタリー' },
  { id: 'outdoor',  icon: '🏕️',  name: 'Outdoor',         desc: 'アウトドア・機能系ブランド' },
  { id: 'street',   icon: '🛹',  name: 'Street',           desc: 'スケート・スポーツミックス' },
  { id: 'euro',     icon: '🇪🇺', name: 'Euro Casual',      desc: 'シンプル・クリーンなヨーロッパ系' },
  { id: 'work',     icon: '👔',  name: 'Work / Smart',     desc: 'きれいめ・オフィスカジュアル' },
  { id: 'vintage',  icon: '📼',  name: 'Vintage',          desc: '古着・ユーズド感のあるスタイル' },
];

// カテゴリ → 役割
var ROLE_TOPS    = ['shirt', 'knit', 'parka', 'sweat', 'vest'];
var ROLE_BOTTOMS = ['pants'];
var ROLE_OUTER   = ['jacket', 'outer'];

// 色グループ（同系色をまとめる）
var COLOR_GROUPS = {
  black:  ['black', 'charcoal', 'blackish', 'near black'],
  white:  ['white', 'off white', 'cream', 'ivory', 'light gray', 'light grey', 'pale'],
  gray:   ['gray', 'grey', 'silver', 'ash'],
  brown:  ['brown', 'tan', 'beige', 'camel', 'khaki', 'sand', 'earth', 'mocha', 'cafe'],
  navy:   ['navy', 'dark blue', 'midnight'],
  blue:   ['blue', 'denim', 'indigo', 'cobalt', 'sky', 'light blue', 'powder'],
  green:  ['green', 'olive', 'sage', 'forest', 'moss', 'light green', 'army', 'khaki green'],
  red:    ['red', 'burgundy', 'wine', 'maroon', 'deep red', 'brick', 'rust'],
  orange: ['orange', 'terra', 'apricot'],
  yellow: ['yellow', 'mustard', 'gold'],
  purple: ['purple', 'violet', 'lavender', 'lilac'],
  pink:   ['pink', 'rose', 'salmon', 'blush'],
  other:  [],
};

// 派手な色グループ（これに該当する色は1色だけ許可）
var VIVID_GROUPS = ['red', 'orange', 'yellow', 'purple', 'pink'];

// 「必ず1つ含む」べき色グループ（R4）
var BASE_GROUPS = ['black', 'white', 'brown', 'green'];

// 派手な柄キーワード（R3）
var VIVID_PATTERNS = ['leopard', 'zebra', 'animal', 'stripe', 'border', 'check', 'plaid',
                      'floral', 'flower', 'camo', 'real tree', 'pattern', 'print', 'graphic'];

// 素材グループ（R7: できるだけ異なる素材を含む）
var FABRIC_GROUPS = {
  leather:  ['leather', 'レザー', 'suede', 'スウェード'],
  denim:    ['denim', 'デニム', 'jean'],
  cotton:   ['cotton', 'コットン', 'canvas'],
  wool:     ['wool', 'ウール', 'knit', 'flannel'],
  nylon:    ['nylon', 'ナイロン', 'gore', 'shell', 'polyester'],
  fleece:   ['fleece', 'フリース'],
  corduroy: ['corduroy', 'コーデュロイ', 'cord'],
  down:     ['down', 'ダウン'],
};

// 系統 → キーワード
var STYLE_KEYWORDS = {
  american: ['american', 'us', 'military', 'denim', 'workwear', 'cadual', 'casual'],
  outdoor:  ['outdoor', 'mountain', 'patagonia', 'arcteryx', 'fleece', 'down', 'gore', 'nylon'],
  street:   ['street', 'skate', 'nike', 'adidas', 'sport', 'hoodie'],
  euro:     ['euro', 'european', 'minimal', 'clean', 'jp', 'tailored'],
  work:     ['work', 'tailored', 'slacks', 'smart', 'office', 'clean'],
  vintage:  ['vintage', '80s', '90s', '70s', '00s', 'used', 'retro', 'old'],
};

/* ===================================================
   状態
   =================================================== */
var selectedStyles = new Set();
var weatherData    = null;
var allItems       = [];

/* ===================================================
   起動
   =================================================== */
renderStyleGrid();

configReady.then(function() {
  loadWeatherData();
  loadItems();
}).catch(function(e) {
  document.getElementById('ws-temp').textContent = '初期化に失敗しました';
});

/* ===================================================
   天気取得
   =================================================== */
async function loadWeatherData() {
  try {
    var res = await fetch('/api/weather');
    if (!res.ok) throw new Error();
    weatherData = await res.json();
    var tempStr = (weatherData.tempMin != null && weatherData.tempMax != null)
      ? weatherData.tempMin + '℃ / ' + weatherData.tempMax + '℃'
      : (weatherData.temp != null ? weatherData.temp + '℃' : '—');
    document.getElementById('ws-temp').textContent =
      (weatherData.emoji || '🌡️') + '  ' + tempStr + '  ' + (weatherData.weather || '');
    var zone = getTempZone(currentTemp());
    document.getElementById('ws-desc').textContent =
      (weatherData.date || '') + ' · ' + getTempZoneLabel(zone);
  } catch (e) {
    document.getElementById('ws-temp').textContent = '天気を取得できませんでした';
  }
}

async function loadItems() {
  try {
    allItems = await dbGetItems({ sort: 'wear_count' });
  } catch (e) {
    showToast('アイテムの取得に失敗しました');
  }
}

/* ===================================================
   系統グリッド
   =================================================== */
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
  selectedStyles.has(id) ? selectedStyles.delete(id) : selectedStyles.add(id);
  el.classList.toggle('selected');
  document.getElementById('generate-btn').disabled = (selectedStyles.size === 0);
}

/* ===================================================
   コーデ生成メイン
   =================================================== */
function generateCoord() {
  if (!selectedStyles.size) return;
  if (allItems.length < 2) { showToast('アイテムが少なすぎます。'); return; }

  document.getElementById('coord-results').innerHTML = '';
  document.getElementById('generating').style.display = 'block';
  document.getElementById('generate-btn').disabled    = true;

  setTimeout(function() {
    try {
      var month  = new Date().getMonth() + 1;
      var temp   = currentTemp();
      var season = detectSeason(month, temp);
      var styles = Array.from(selectedStyles);

      // アイテムに系統・季節スコアを付与
      var scored = scoreItems(allItems, styles, season);

      var results = [
        buildRareCoord(scored, season, temp),
        buildColorCoord(scored, season, temp),
        buildSeasonCoord(scored, season, temp),
      ].filter(Boolean);

      renderCoords(results);
    } catch (e) {
      console.error(e);
      document.getElementById('coord-results').innerHTML =
        '<div class="coord-error">生成に失敗しました: ' + escHtml(e.message) + '</div>';
    } finally {
      document.getElementById('generating').style.display = 'none';
      document.getElementById('generate-btn').disabled    = false;
    }
  }, 500);
}

/* ===================================================
   スコアリング
   =================================================== */
function scoreItems(items, styles, season) {
  return items.map(function(item) {
    var score = 0;
    // 季節一致
    if (item[season]) score += 4;
    // 系統一致
    var hay = [item.culture, item.category, item.fabric, item.brand, item.name]
                .join(' ').toLowerCase();
    styles.forEach(function(sid) {
      (STYLE_KEYWORDS[sid] || []).forEach(function(kw) {
        if (hay.indexOf(kw) !== -1) score += 2;
      });
    });
    return Object.assign({}, item, { _score: score });
  });
}

/* ===================================================
   パターン① rare: 着用少なめ優先
   =================================================== */
function buildRareCoord(items, season, temp) {
  // wear_count 昇順 → score 降順
  var sorted = items.slice().sort(function(a, b) {
    if (a.wear_count !== b.wear_count) return a.wear_count - b.wear_count;
    return b._score - a._score;
  });

  var combo = findBestCombo(sorted, season, temp, 'rare');
  if (!combo) return null;

  var avgWorn = Math.round(
    combo.reduce(function(s, i) { return s + (i.wear_count || 0); }, 0) / combo.length
  );

  return {
    theme:       'rare',
    title:       '眠っている服を起こすコーデ',
    description: '平均着用 ' + avgWorn + ' 回。出番が少なかったアイテムを組み合わせました。',
    items:       combo,
    rules:       describeRules(combo, season, temp),
  };
}

/* ===================================================
   パターン② color: ルール最優先の「完璧な3色コーデ」
   =================================================== */
function buildColorCoord(items, season, temp) {
  // score 降順（系統・季節一致が高いものを優先）
  var sorted = items.slice().sort(function(a, b) { return b._score - a._score; });

  var combo = findBestCombo(sorted, season, temp, 'color');
  if (!combo) return null;

  var groups = getColorGroups(combo);
  var colorStr = Array.from(groups).join(' · ');

  return {
    theme:       'color',
    title:       groups.size + '色でまとめたコーデ',
    description: colorStr + ' の ' + groups.size + ' 色構成。ルールに最も忠実なコーデです。',
    items:       combo,
    rules:       describeRules(combo, season, temp),
  };
}

/* ===================================================
   パターン③ season: 季節・気温最優先
   =================================================== */
function buildSeasonCoord(items, season, temp) {
  // 季節一致 → score 降順
  var sorted = items.slice().sort(function(a, b) {
    var am = a[season] ? 1 : 0;
    var bm = b[season] ? 1 : 0;
    if (bm !== am) return bm - am;
    return b._score - a._score;
  });

  var combo = findBestCombo(sorted, season, temp, 'season');
  if (!combo) return null;

  var tempComment = getTempComment(temp);
  var zone = getTempZone(temp);

  return {
    theme:       'season',
    title:       getTempZoneLabel(zone) + 'のコーデ',
    description: tempComment + ' 季節タグが一致するアイテムで組みました。',
    items:       combo,
    rules:       describeRules(combo, season, temp),
  };
}

/* ===================================================
   コンボ探索
   候補リストからルールを満たす最良の組み合わせを探す

   「最良」= ルールスコアが最も高いもの
   ルールスコア:
     +10 色3色以内
     +5  派手色1色以内
     +5  派手柄1つ以内
     +8  ベース色（黒/白/緑/茶）が含まれる
     +4  素材バリエーションあり
     +3  季節フラグ一致アイテムが過半数
   =================================================== */
function findBestCombo(sorted, season, temp, mode) {
  var tops    = sorted.filter(function(i) { return ROLE_TOPS.indexOf(i.category)    !== -1; });
  var bottoms = sorted.filter(function(i) { return ROLE_BOTTOMS.indexOf(i.category) !== -1; });
  var outers  = sorted.filter(function(i) { return ROLE_OUTER.indexOf(i.category)   !== -1; });

  if (!tops.length || !bottoms.length) return null;

  // 気温ゾーンでアウターの必要性を判定
  var zone = getTempZone(temp);
  var outerRequired = zone === 'cold_winter' || zone === 'cold_spring';
  var outerOptional = zone === 'mild_spring';
  // warm_spring / summer はアウターなし

  // ゾーンに合ったアウターの重さ優先順にソート
  var weightPriority = {
    cold_winter: { heavy: 0, fleece: 1, light: 2, thin: 3 },
    cold_spring: { light: 0, fleece: 1, thin: 2, heavy: 3 }, // フリースは寒い春でOK
    mild_spring: { thin: 0, light: 1, fleece: 2, heavy: 3 }, // フリースは少し暑め
  };
  if (weightPriority[zone]) {
    var order = weightPriority[zone];
    outers = outers.slice().sort(function(a, b) {
      var wa = order[getOuterWeight(a)]; if (wa == null) wa = 3;
      var wb = order[getOuterWeight(b)]; if (wb == null) wb = 3;
      return wa - wb;
    });
  }

  var bestCombo = null;
  var bestRuleScore = -Infinity;

  // tops × bottoms（最大5×5）、アウターあり/なし を探索
  var tLimit = Math.min(tops.length, 5);
  var bLimit = Math.min(bottoms.length, 5);
  var oLimit = Math.min(outers.length, 4);

  for (var t = 0; t < tLimit; t++) {
    for (var b = 0; b < bLimit; b++) {
      var top    = tops[t];
      var bottom = bottoms[b];
      if (top.id === bottom.id) continue;

      // アウターなしで試す
      if (!outerRequired) {
        var combo2 = [top, bottom];
        var rs2    = ruleScore(combo2, season, temp);
        if (mode === 'rare') rs2 += rareBonus(combo2);
        if (rs2 > bestRuleScore) { bestRuleScore = rs2; bestCombo = combo2; }
      }

      // アウターありで試す
      if ((outerRequired || outerOptional) && outers.length) {
        for (var o = 0; o < oLimit; o++) {
          var outer = outers[o];
          if (outer.id === top.id || outer.id === bottom.id) continue;
          var combo3 = [top, bottom, outer];
          var rs3    = ruleScore(combo3, season, temp);
          if (mode === 'rare') rs3 += rareBonus(combo3);
          if (outerRequired) rs3 += 3;
          if (rs3 > bestRuleScore) { bestRuleScore = rs3; bestCombo = combo3; }
        }
      }
    }
  }

  return bestCombo;
}

/* ===================================================
   ルールスコア計算
   =================================================== */
function ruleScore(combo, season, temp) {
  var score = 0;

  // R1: 色は3色以内
  var colorG = getColorGroups(combo);
  if (colorG.size <= 3) score += 10;
  else if (colorG.size === 4) score += 4;

  // R2: 派手な色は1色だけ
  var vividCount = 0;
  combo.forEach(function(item) {
    if (item.color && VIVID_GROUPS.indexOf(getColorGroup(item.color)) !== -1) vividCount++;
  });
  if (vividCount <= 1) score += 5;

  // R3: 派手な柄は1つだけ
  var patternCount = 0;
  combo.forEach(function(item) {
    var hay = (item.name + ' ' + item.culture + ' ' + item.fabric).toLowerCase();
    var hasPattern = VIVID_PATTERNS.some(function(p) { return hay.indexOf(p) !== -1; });
    if (hasPattern) patternCount++;
  });
  if (patternCount <= 1) score += 5;

  // R4: ベース色（黒/白/緑/茶）が1つ以上
  var hasBase = combo.some(function(item) {
    return item.color && BASE_GROUPS.indexOf(getColorGroup(item.color)) !== -1;
  });
  if (hasBase) score += 8;

  // R5: 季節フラグ一致
  var seasonMatch = combo.filter(function(item) { return item[season]; }).length;
  score += seasonMatch * 3;

  // R7: 素材バリエーション（2種類以上）
  var fabrics = new Set();
  combo.forEach(function(item) {
    fabrics.add(getFabricGroup(item.fabric));
  });
  if (fabrics.size >= 2) score += 4;

  // 素材のうち1種類だけ「特殊素材」（レザー等）が含まれる
  var specialFabrics = ['leather', 'corduroy', 'denim', 'fleece', 'down'];
  var specialCount = 0;
  combo.forEach(function(item) {
    var fg = getFabricGroup(item.fabric);
    if (specialFabrics.indexOf(fg) !== -1) specialCount++;
  });
  if (specialCount === 1) score += 3;

  // R6: 気温ゾーンに合ったアウター選択
  var zone = getTempZone(temp != null ? temp : 20);
  var outerItems = combo.filter(function(i) { return ROLE_OUTER.indexOf(i.category) !== -1; });
  var hasOuter = outerItems.length > 0;

  if (zone === 'cold_winter') {
    // コート・ダウン必須
    if (hasOuter) {
      score += 8;
      if (outerItems.some(function(i) { return getOuterWeight(i) === 'heavy'; })) score += 5;
    } else {
      score -= 10;
    }
  } else if (zone === 'cold_spring') {
    // ライトアウター or フリース1枚でOK
    if (hasOuter) {
      score += 8;
      var goodColdOuter = outerItems.some(function(i) {
        var w = getOuterWeight(i); return w === 'light' || w === 'fleece';
      });
      if (goodColdOuter) score += 5;
    } else {
      score -= 8;
    }
  } else if (zone === 'mild_spring') {
    // 薄手羽織りは加点、フリース・重いアウターは減点
    if (hasOuter) {
      if (outerItems.some(function(i) { return getOuterWeight(i) === 'thin'; })) score += 4;
      else if (outerItems.some(function(i) { return getOuterWeight(i) === 'light'; })) score += 2;
      else if (outerItems.some(function(i) { return getOuterWeight(i) === 'fleece'; })) score -= 1;
      else score -= 3;
    }
  } else if (zone === 'warm_spring') {
    // フリース・重いアウターは暑すぎる
    if (hasOuter) {
      var toHotOuter = outerItems.some(function(i) {
        var w = getOuterWeight(i); return w === 'heavy' || w === 'fleece';
      });
      score -= toHotOuter ? 10 : 3;
    }
  } else if (zone === 'summer') {
    // アウター厳禁
    if (hasOuter) score -= 10;
  }

  // カテゴリに関わらず、フリース・ダウン素材は暑い春/夏に強くペナルティ
  // （ベストなど ROLE_TOPS に入るアイテムも対象）
  if (zone === 'warm_spring' || zone === 'summer') {
    combo.forEach(function(item) {
      var hay = [item.name, item.fabric, item.category, item.culture, item.brand]
                  .filter(Boolean).join(' ').toLowerCase();
      if (/fleece|フリース|down|ダウン/.test(hay)) score -= 10;
      if (/knit|ニット|wool|ウール/.test(hay)) score -= 10;
    });
  } else if (zone === 'mild_spring') {
    combo.forEach(function(item) {
      var hay = [item.name, item.fabric, item.category, item.culture, item.brand]
                  .filter(Boolean).join(' ').toLowerCase();
      if (/fleece|フリース|down|ダウン/.test(hay)) score -= 3;
    });
  }

  return score;
}

function rareBonus(combo) {
  // wear_count の平均が低いほど高スコア
  var avg = combo.reduce(function(s, i) { return s + (i.wear_count || 0); }, 0) / combo.length;
  return Math.max(0, 20 - avg);
}

/* ===================================================
   ルール達成状況の説明文生成
   =================================================== */
function describeRules(combo, season, temp) {
  var lines = [];

  // 色
  var colorG = getColorGroups(combo);
  lines.push('🎨 ' + colorG.size + '色構成（' + Array.from(colorG).join('・') + '）');

  // 素材
  var fabrics = new Set();
  combo.forEach(function(item) {
    var fg = getFabricGroup(item.fabric);
    if (fg !== 'other') fabrics.add(fg);
  });
  if (fabrics.size >= 2) lines.push('🧵 ' + Array.from(fabrics).join('・') + ' の異素材ミックス');

  // 気温ゾーン
  var zone = getTempZone(temp);
  var outerHint = {
    cold_winter: '：3層レイヤー（アウター必須）',
    cold_spring: '：ライトアウター推奨',
    mild_spring: '：薄手羽織りOK',
    warm_spring: '：アウターほぼ不要',
    summer:      '：半袖がベスト',
  }[zone] || '';
  lines.push('🌡️ ' + temp + '℃' + outerHint);

  return lines.join('　');
}

/* ===================================================
   描画
   =================================================== */
var THEME_META = {
  rare:   { label: '着用少なめ',    cls: 'rare'   },
  color:  { label: '3色コーデ',     cls: 'color'  },
  season: { label: '今日の気温向け', cls: 'season' },
};

function renderCoords(coords) {
  var wrap = document.getElementById('coord-results');

  if (!coords.length) {
    wrap.innerHTML = '<div class="coord-error">'
      + 'コーデを生成できませんでした。<br>'
      + 'トップス・ボトムスのカテゴリを設定した服を登録してください。'
      + '</div>';
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
        + '<div class="coord-item-name">'  + escHtml(item.name  || '') + '</div>'
        + '<div class="coord-item-brand">' + escHtml(item.brand || '') + '</div>'
        + '<div class="coord-item-meta">'
        + escHtml(item.color || '')
        + (item.color && item.wear_count != null ? ' · ' : '')
        + (item.wear_count != null ? item.wear_count + '回' : '')
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
      + '<div class="coord-rules">' + escHtml(coord.rules || '') + '</div>'
      + '</div>';
  }).join('');
}

/* ===================================================
   色・素材ヘルパー
   =================================================== */
function getColorGroup(colorStr) {
  if (!colorStr) return 'other';
  var c = colorStr.toLowerCase();
  var keys = Object.keys(COLOR_GROUPS);
  for (var i = 0; i < keys.length; i++) {
    var g = keys[i];
    for (var j = 0; j < COLOR_GROUPS[g].length; j++) {
      if (c.indexOf(COLOR_GROUPS[g][j]) !== -1) return g;
    }
  }
  return c.split(/[\s,/]/)[0] || 'other';
}

function getColorGroups(items) {
  var groups = new Set();
  items.forEach(function(item) {
    if (item.color) groups.add(getColorGroup(item.color));
  });
  return groups;
}

function getFabricGroup(fabricStr) {
  if (!fabricStr) return 'other';
  var f = fabricStr.toLowerCase();
  var keys = Object.keys(FABRIC_GROUPS);
  for (var i = 0; i < keys.length; i++) {
    var kws = FABRIC_GROUPS[keys[i]];
    for (var j = 0; j < kws.length; j++) {
      if (f.indexOf(kws[j]) !== -1) return keys[i];
    }
  }
  return 'other';
}

// アウターの重さを heavy / light / thin に分類
function getOuterWeight(item) {
  var hay = [item.name, item.category, item.fabric, item.culture, item.brand]
              .filter(Boolean).join(' ').toLowerCase();
  if (/down|ダウン|coat|コート/.test(hay)) return 'heavy';
  if (/fleece|フリース/.test(hay)) return 'fleece'; // 寒い春はOK、暑い春はNG
  if (/cardigan|カーディガン|shirt.?jacket|シャツジャケ/.test(hay)) return 'thin';
  return 'light'; // トレンチ・デニムジャケット・MA-1 等
}

/* ===================================================
   ユーティリティ
   =================================================== */
function currentTemp() {
  if (!weatherData) return 20;
  return weatherData.temp != null ? weatherData.temp
       : weatherData.tempMax != null ? weatherData.tempMax : 20;
}

function detectSeason(month, temp) {
  if (temp >= 25) return 'summer';
  if (temp <= 10) return 'winter';
  if (month >= 3 && month <= 6)  return 'spring';
  if (month >= 9 && month <= 11) return 'fall';
  return 'winter';
}

function seasonLabel(s) {
  return { spring:'春', summer:'夏', fall:'秋', winter:'冬' }[s] || s;
}

// 気温を5ゾーンに分類
function getTempZone(temp) {
  if (temp <= 10) return 'cold_winter';  // ほぼ冬
  if (temp <= 15) return 'cold_spring';  // 寒い春
  if (temp <= 20) return 'mild_spring';  // ちょうどいい春
  if (temp <= 25) return 'warm_spring';  // 暑い春
  return 'summer';                        // ほぼ夏
}

function getTempZoneLabel(zone) {
  return {
    cold_winter: '〜10℃（ほぼ冬）',
    cold_spring: '10〜15℃（寒い春）',
    mild_spring: '15〜20℃（ベストゾーン）',
    warm_spring: '20〜25℃（暑い春）',
    summer:      '25℃〜（ほぼ夏）',
  }[zone] || '';
}

function getTempComment(temp) {
  var zone = getTempZone(temp);
  return {
    cold_winter: 'コート・ダウン必須。インナー＋中間着＋アウターの3層で防寒を。',
    cold_spring: 'ライトアウターが活躍。脱ぎ着できる前提で組んで。',
    mild_spring: '一番おしゃれできる気温帯。シャツ1枚か薄手羽織りで。',
    warm_spring: '夏っぽさ7割。半袖＋朝晩用の薄い羽織りで。',
    summer:      '完全に半袖。通気性のある素材を優先して。',
  }[zone] || '';
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
