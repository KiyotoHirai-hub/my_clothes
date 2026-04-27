/**
 * db.js — Supabase との全通信を担当するレイヤー
 * app.js / detail.js はこのファイルの関数を通してデータを読み書きする。
 */

// Supabase JS SDK（CDN から読み込み済み想定 → index.html / detail.html に追加する）
// ここでは fetch ベースの薄いラッパーとして実装（SDK 不要）

const API = `${SUPABASE_URL}/rest/v1`;
const STORAGE_URL = `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}`;

const HEADERS = {
  'apikey':        SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type':  'application/json',
  'Prefer':        'return=representation',
};

/* =====================================================
   汎用 fetch ラッパー
   ===================================================== */

async function sbFetch(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { ...HEADERS, ...options.headers },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase error ${res.status}: ${err}`);
  }
  // 204 No Content
  if (res.status === 204) return null;
  return res.json();
}

/* =====================================================
   アイテム一覧取得
   ===================================================== */

/**
 * アイテムを取得する。
 * @param {{ season?: string, search?: string, sort?: string }} opts
 * @returns {Promise<Item[]>}
 */
async function dbGetItems({ season, search, sort } = {}) {
  const params = new URLSearchParams();

  // 季節フィルター
  if (season && season !== 'all') {
    params.set(season, 'eq.true');
  }

  // 全文検索（PostgreSQL の ilike で複数フィールド検索）
  if (search && search.trim()) {
    const q = search.trim();
    // or クエリ: 複数フィールドに部分一致
    params.set('or', `(name.ilike.*${q}*,brand.ilike.*${q}*,category.ilike.*${q}*,culture.ilike.*${q}*,color.ilike.*${q}*,country.ilike.*${q}*,fabric.ilike.*${q}*,year.ilike.*${q}*)`);
  }

  // ソート
  const sortMap = {
    'wear_count':  'wear_count.desc',
    'like_count':  'like_count.desc',
    'name':        'name.asc',
    'created_at':  'created_at.desc',
  };
  params.set('order', sortMap[sort] || 'wear_count.desc');

  const query = params.toString() ? `?${params}` : '';
  return sbFetch(`/items${query}`);
}

/* =====================================================
   アイテム1件取得
   ===================================================== */

async function dbGetItem(id) {
  const rows = await sbFetch(`/items?id=eq.${id}`);
  return rows?.[0] || null;
}

/* =====================================================
   アイテム追加
   ===================================================== */

async function dbAddItem(data) {
  const rows = await sbFetch('/items', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return rows?.[0] || null;
}

/* =====================================================
   アイテム更新
   ===================================================== */

async function dbUpdateItem(id, data) {
  const rows = await sbFetch(`/items?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  return rows?.[0] || null;
}

/* =====================================================
   アイテム削除
   ===================================================== */

async function dbDeleteItem(id) {
  await sbFetch(`/items?id=eq.${id}`, { method: 'DELETE' });
}

/* =====================================================
   着用回数 +1
   ===================================================== */

async function dbWear(id, currentCount) {
  return dbUpdateItem(id, {
    wear_count: currentCount + 1,
    last_worn:  new Date().toISOString(),
  });
}

/* =====================================================
   写真アップロード（Supabase Storage）
   ===================================================== */

/**
 * Base64 画像を Supabase Storage にアップロードして URL を返す。
 * @param {string} itemId
 * @param {string} base64DataUrl
 * @returns {Promise<string>} 公開 URL
 */
async function dbUploadPhoto(itemId, base64DataUrl) {
  // Base64 → Blob に変換
  const [meta, data] = base64DataUrl.split(',');
  const mime = meta.match(/:(.*?);/)[1];
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: mime });

  const filename = `${itemId}.jpg`;

  // Storage にアップロード（upsert）
  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${filename}`,
    {
      method: 'POST',
      headers: {
        'apikey':        SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type':  mime,
        'x-upsert':      'true',
      },
      body: blob,
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Storage upload error: ${err}`);
  }

  // 公開 URL を返す（キャッシュバスター付き）
  return `${STORAGE_URL}/${filename}?t=${Date.now()}`;
}

/* =====================================================
   写真削除（Supabase Storage）
   ===================================================== */

async function dbDeletePhoto(itemId) {
  await fetch(
    `${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${itemId}.jpg`,
    {
      method: 'DELETE',
      headers: {
        'apikey':        SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
    }
  );
}
