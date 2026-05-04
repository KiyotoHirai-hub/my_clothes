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

// 色: CLIP で判定（ピクセル解析は背景色に引きずられるため廃止）
// "a photo of" を前置することで CLIP の精度が上がる
const COLORS = [
  ['white',    ['a photo of white clothing',   'a photo of a white t-shirt or shirt', 'white fabric garment']],
  ['black',    ['a photo of black clothing',   'a photo of a black t-shirt or shirt', 'black fabric garment']],
  ['gray',     ['a photo of gray clothing',    'a photo of a grey sweatshirt or sweater']],
  ['navy',     ['a photo of navy blue clothing','a photo of a dark navy shirt']],
  ['blue',     ['a photo of blue clothing',    'a photo of a light blue denim shirt']],
  ['brown',    ['a photo of brown clothing',   'a photo of a tan brown jacket']],
  ['beige',    ['a photo of beige clothing',   'a photo of a cream khaki garment']],
  ['green',    ['a photo of green clothing',   'a photo of an olive green jacket']],
  ['red',      ['a photo of red clothing',     'a photo of a red shirt or top']],
  ['orange',   ['a photo of orange clothing',  'a photo of an orange top']],
  ['yellow',   ['a photo of yellow clothing',  'a photo of a yellow or mustard top']],
  ['purple',   ['a photo of purple clothing',  'a photo of a purple or violet top']],
  ['pink',     ['a photo of pink clothing',    'a photo of a pink top or shirt']],
];

// カテゴリ: Tシャツと正式なシャツを同じ "shirt" に分類（DBスキーマに合わせる）
const CATEGORIES = [
  ['shirt',     [
    'a plain casual t-shirt with round neck',
    'a short sleeve t-shirt',
    'a basic white or colored tee',
    'a button-up dress shirt',
    'a casual shirt',
  ]],
  ['knit',      ['a knit sweater', 'a woolen pullover sweater', 'a cable knit top']],
  ['sweat',     ['a crewneck sweatshirt', 'a plain sweatshirt without hood']],
  ['parka',     ['a hoodie with hood', 'a zip-up hoodie', 'a pullover hoodie parka']],
  ['jacket',    ['a denim jacket', 'a varsity jacket', 'a blouson jacket', 'a short jacket']],
  ['outer',     ['a long trench coat', 'a wool overcoat', 'a down jacket coat']],
  ['vest',      ['a vest gilet without sleeves', 'a padded vest sleeveless jacket']],
  ['pants',     ['pants jeans trousers', 'denim jeans', 'chino pants', 'shorts']],
  ['shoes',     ['shoes sneakers boots', 'leather shoes loafers', 'athletic sneakers']],
  ['bag',       ['a bag backpack tote', 'a shoulder bag', 'a briefcase bag']],
  ['accessory', ['a hat cap or headwear', 'a scarf or belt', 'sunglasses or watch']],
];

// 素材: より具体的な素材表現
const FABRICS = [
  ['denim',    ['denim fabric jeans material', 'a photo of denim clothing']],
  ['cotton',   ['smooth cotton jersey fabric', 'plain cotton t-shirt fabric']],
  ['wool',     ['wool fabric or woolen material', 'a woolen knitted texture']],
  ['leather',  ['leather or suede material', 'genuine leather jacket surface']],
  ['nylon',    ['nylon or polyester technical fabric', 'waterproof shell nylon fabric']],
  ['fleece',   ['soft fleece fabric', 'polar fleece fuzzy texture']],
  ['corduroy', ['corduroy ribbed fabric', 'corduroy texture with vertical ridges']],
  ['down',     ['quilted down padding', 'padded quilted jacket surface']],
];

// 系統: vintage の誤検出を減らすため、シンプルな服との境界を明確化
const CULTURES = [
  ['american casual', [
    'american workwear denim military surplus casual style',
    'american casual flannel shirt jeans work boots style',
  ]],
  ['outdoor', [
    'outdoor technical mountain hiking sports gear',
    'outdoor functional jacket with many pockets',
  ]],
  ['street', [
    'urban streetwear hip-hop sneaker skateboard style',
    'graphic logo streetwear oversized clothing style',
  ]],
  ['euro casual', [
    'minimalist clean european basic white t-shirt simple style',
    'simple plain well-fitted european casual minimal fashion',
    'clean basic everyday casual t-shirt minimalist look',
  ]],
  ['work smart', [
    'smart business casual office professional style',
    'tailored formal office shirt suit style',
  ]],
  ['vintage', [
    'worn faded distressed thrift store secondhand clothing',
    'retro 1980s 1990s colorful pattern graphic vintage style',
    'old used patchwork or heavily worn vintage fashion',
  ]],
];

// 季節: 体感気温ベースで判定
const SEASON_GROUPS = [
  ['winter', [
    'a very thick heavy down coat for freezing cold winter',
    'a heavy wool overcoat for extreme cold weather',
  ]],
  ['fall', [
    'a medium weight jacket or coat for cool autumn weather',
    'a light to medium layer for chilly fall weather',
  ]],
  ['spring', [
    'a light layer shirt jacket for mild spring weather',
    'a light cardigan or thin jacket for pleasant weather',
  ]],
  ['summer', [
    'a thin breathable t-shirt for hot summer weather',
    'a short sleeve light garment for warm summer days',
  ]],
];

/* ── CLIP 分類（共通） ──────────────────────────── */
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

/* ── メイン解析 ─────────────────────────────────── */
async function analyzeClothingPhoto(imageDataUrl, onStatus) {
  const s = onStatus || (() => {});

  s('AIモデルを準備中…');
  await _load(onStatus);

  s('色を判定中…');
  const colorResults = await _classify(imageDataUrl, COLORS);

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
    color:    colorResults[0].val,
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
window.preloadAIModel = () => _load(() => {}).catch(() => {});
