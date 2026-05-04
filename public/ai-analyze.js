/**
 * ai-analyze.js — 服の写真から AI でアイテム情報を自動検出
 * Transformers.js (CLIP zero-shot) 使用 — 外部 API 不要
 * 初回のみモデルをダウンロード（以降はブラウザキャッシュ）
 */
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2/dist/transformers.min.js';

env.allowLocalModels = false;
env.useBrowserCache  = true;

const MODEL = 'Xenova/clip-vit-base-patch32';
let _pipe = null;

/* ── モデル読み込み ─────────────────────────────── */
async function _load(onStatus) {
  if (_pipe) return;
  _pipe = await pipeline('zero-shot-image-classification', MODEL, {
    progress_callback: (info) => {
      if (!onStatus) return;
      if (info.status === 'progress' && info.total > 0) {
        const pct = Math.round(info.loaded / info.total * 100);
        onStatus('モデルを読み込み中… ' + pct + '%（初回のみ）');
      }
    },
  });
}

/* ── ラベル定義 ─────────────────────────────────── */
const CATEGORIES = [
  ['shirt',     ['a shirt', 't-shirt', 'button-up shirt', 'polo shirt']],
  ['knit',      ['a knit sweater', 'woolen pullover', 'knitwear']],
  ['sweat',     ['a sweatshirt', 'crewneck sweatshirt']],
  ['parka',     ['a hoodie', 'zip-up hoodie', 'parka jacket']],
  ['jacket',    ['a denim jacket', 'blazer jacket', 'varsity jacket', 'blouson']],
  ['outer',     ['a long coat', 'overcoat', 'trench coat', 'down jacket']],
  ['vest',      ['a vest', 'gilet', 'sleeveless jacket']],
  ['pants',     ['pants', 'jeans', 'trousers', 'chinos', 'shorts']],
  ['shoes',     ['shoes', 'sneakers', 'boots', 'sandals']],
  ['bag',       ['a bag', 'backpack', 'tote bag']],
  ['accessory', ['a hat', 'cap', 'belt', 'watch', 'scarf', 'sunglasses']],
];

const FABRICS = [
  ['denim',    ['denim fabric', 'jeans material']],
  ['cotton',   ['cotton jersey fabric']],
  ['wool',     ['wool fabric', 'woolen knit']],
  ['leather',  ['leather material', 'suede material']],
  ['nylon',    ['nylon fabric', 'polyester shell', 'technical fabric']],
  ['fleece',   ['fleece fabric', 'polar fleece']],
  ['corduroy', ['corduroy fabric', 'ribbed velvet fabric']],
  ['down',     ['quilted down fabric', 'padded quilted material']],
];

const CULTURES = [
  ['american casual', ['american workwear style', 'american casual military surplus']],
  ['outdoor',         ['outdoor mountain sports clothing', 'hiking technical gear']],
  ['street',          ['streetwear skateboard style', 'urban street fashion']],
  ['euro casual',     ['european minimal clean style', 'simple european fashion']],
  ['work smart',      ['smart casual office style', 'business casual clothing']],
  ['vintage',         ['vintage retro used clothing', 'thrift store vintage fashion']],
];

const SEASON_GROUPS = [
  ['winter', ['heavy winter coat or thick jacket for very cold freezing weather']],
  ['fall',   ['autumn fall jacket or light coat for cool chilly weather']],
  ['spring', ['light spring layer jacket or shirt for mild pleasant weather']],
  ['summer', ['thin breathable t-shirt or shorts for hot summer weather']],
];

/* ── CLIP 分類 ──────────────────────────────────── */
async function _classify(imageUrl, groups) {
  const allLabels = groups.flatMap(([, prompts]) => prompts);
  const results   = await _pipe(imageUrl, allLabels);
  const scoreMap  = Object.fromEntries(results.map(r => [r.label, r.score]));

  return groups
    .map(([val, prompts]) => ({
      val,
      score: Math.max(...prompts.map(p => scoreMap[p] || 0)),
    }))
    .sort((a, b) => b.score - a.score);
}

/* ── 支配色をピクセル解析で検出 ────────────────── */
function _detectColor(imageDataUrl) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 64; canvas.height = 64;
      const ctx = canvas.getContext('2d');
      // 中央 60% の領域だけ使う（背景を除外）
      const sx = img.width  * 0.2, sy = img.height * 0.1;
      const sw = img.width  * 0.6, sh = img.height * 0.8;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, 64, 64);
      const d = ctx.getImageData(0, 0, 64, 64).data;
      const counts = {};
      for (let i = 0; i < d.length; i += 4) {
        const name = _rgb2name(d[i], d[i+1], d[i+2]);
        counts[name] = (counts[name] || 0) + 1;
      }
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      resolve(top[0]?.[0] || 'black');
    };
    img.onerror = () => resolve('black');
    img.src = imageDataUrl;
  });
}

function _rgb2name(r, g, b) {
  const rn = r/255, gn = g/255, bn = b/255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;

  if (d < 0.08) {
    if (l > 0.80) return 'white';
    if (l < 0.20) return 'black';
    return 'gray';
  }
  const s = d / (l > 0.5 ? 2 - max - min : max + min);
  let h;
  if (max === rn)      h = ((gn - bn) / d + 6) % 6 * 60;
  else if (max === gn) h = ((bn - rn) / d + 2) * 60;
  else                 h = ((rn - gn) / d + 4) * 60;

  if (l < 0.22)            return 'black';
  if (l > 0.85 && s < 0.2) return 'white';
  if (s < 0.14)            return 'gray';

  if (h < 25 || h >= 345) return l < 0.38 ? 'burgundy' : 'red';
  if (h < 45)  return 'orange';
  if (h < 70)  return 'yellow';
  if (h < 155) return l < 0.32 ? 'olive' : 'green';
  if (h < 195) return 'teal';
  if (h < 255) return l < 0.35 ? 'navy' : 'blue';
  if (h < 290) return 'purple';
  return 'pink';
}

/* ── メイン解析 ─────────────────────────────────── */
async function analyzeClothingPhoto(imageDataUrl, onStatus) {
  const s = onStatus || (() => {});

  s('AIモデルを準備中…');
  await _load(onStatus);

  s('色を検出中…');
  const color = await _detectColor(imageDataUrl);

  s('カテゴリを判定中…');
  const cats = await _classify(imageDataUrl, CATEGORIES);

  s('素材を判定中…');
  const fabrics = await _classify(imageDataUrl, FABRICS);

  s('系統を判定中…');
  const cultures = await _classify(imageDataUrl, CULTURES);

  s('気温・季節を判定中…');
  const seasons = await _classify(imageDataUrl, SEASON_GROUPS);

  // 上位 2 シーズンをセット（隣接シーズンも追加）
  const top2 = new Set([seasons[0].val, seasons[1].val]);
  if (top2.has('winter')) top2.add('fall');
  if (top2.has('summer')) top2.add('spring');

  return {
    category: cats[0].val,
    color,
    fabric:   fabrics[0].val,
    culture:  cultures[0].val,
    spring:   top2.has('spring'),
    summer:   top2.has('summer'),
    fall:     top2.has('fall'),
    winter:   top2.has('winter'),
  };
}

/* ── グローバル公開 ─────────────────────────────── */
window.analyzeClothingPhoto = analyzeClothingPhoto;

// モーダルが開いたとき等に事前ロードできるよう公開
window.preloadAIModel = () => _load(() => {}).catch(() => {});
