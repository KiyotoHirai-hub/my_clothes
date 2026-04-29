/**
 * db.js — Supabase REST API との通信レイヤー
 */

const API         = `${SUPABASE_URL}/rest/v1`;
const STORAGE_API = `${SUPABASE_URL}/storage/v1/object`;
const STORAGE_PUB = `${SUPABASE_URL}/storage/v1/object/public`;

const BASE_HEADERS = {
  'apikey':        SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type':  'application/json',
  'Prefer':        'return=representation',
};

/* ── 汎用 fetch ───────────────────────────────────────── */
async function sbFetch(path, options = {}) {
  const url = `${API}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: { ...BASE_HEADERS, ...options.headers },
  });

  if (!res.ok) {
    const body = await res.text();
    console.error('[Supabase] error', res.status, url, body);
    throw new Error(`Supabase ${res.status}: ${body}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

/* ── アイテム一覧 ─────────────────────────────────────── */
async function dbGetItems({ season, search, sort } = {}) {
  const params = new URLSearchParams();

  // 季節フィルター: PostgREST では ?spring=eq.true の形
  if (season && season !== 'all') {
    params.append(season, 'eq.true');
  }

  // 検索: 複数フィールドを OR で部分一致
  if (search && search.trim()) {
    const q = encodeURIComponent(search.trim());
    params.append(
      'or',
      `(name.ilike.*${q}*,brand.ilike.*${q}*,category.ilike.*${q}*,` +
      `culture.ilike.*${q}*,color.ilike.*${q}*,country.ilike.*${q}*,` +
      `fabric.ilike.*${q}*,year.ilike.*${q}*)`
    );
  }

  // ソート
  const ORDER = {
    wear_count: 'wear_count.desc.nullslast',
    like_count: 'like_count.desc.nullslast',
    name:       'name.asc.nullslast',
    created_at: 'created_at.desc.nullslast',
  };
  params.append('order', ORDER[sort] || 'wear_count.desc.nullslast');

  const qs = params.toString();
  return sbFetch(`/items${qs ? '?' + qs : ''}`);
}

/* ── アイテム1件 ──────────────────────────────────────── */
async function dbGetItem(id) {
  const rows = await sbFetch(`/items?id=eq.${id}&limit=1`);
  return rows?.[0] ?? null;
}

/* ── アイテム追加 ─────────────────────────────────────── */
async function dbAddItem(data) {
  const rows = await sbFetch('/items', {
    method: 'POST',
    body:   JSON.stringify(data),
  });
  return rows?.[0] ?? null;
}

/* ── アイテム更新 ─────────────────────────────────────── */
async function dbUpdateItem(id, data) {
  const rows = await sbFetch(`/items?id=eq.${id}`, {
    method: 'PATCH',
    body:   JSON.stringify(data),
  });
  return rows?.[0] ?? null;
}

/* ── アイテム削除 ─────────────────────────────────────── */
async function dbDeleteItem(id) {
  await sbFetch(`/items?id=eq.${id}`, { method: 'DELETE' });
}

/* ── 着用 +1 ──────────────────────────────────────────── */
async function dbWear(id, currentCount) {
  return dbUpdateItem(id, {
    wear_count: (currentCount || 0) + 1,
    last_worn:  new Date().toISOString(),
  });
}

/* ── 写真アップロード ─────────────────────────────────── */
async function dbUploadPhoto(itemId, base64DataUrl) {
  const [meta, b64] = base64DataUrl.split(',');
  const mime   = meta.match(/:(.*?);/)[1];
  const binary = atob(b64);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: mime });

  const filename = `${itemId}.jpg`;
  const res = await fetch(`${STORAGE_API}/${STORAGE_BUCKET}/${filename}`, {
    method:  'POST',
    headers: {
      'apikey':        SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type':  mime,
      'x-upsert':      'true',
    },
    body: blob,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Storage upload failed: ${err}`);
  }

  // キャッシュバスター付き公開 URL
  return `${STORAGE_PUB}/${STORAGE_BUCKET}/${filename}?t=${Date.now()}`;
}

/* ── 写真削除 ─────────────────────────────────────────── */
async function dbDeletePhoto(itemId) {
  // エラーになっても続行（写真がない場合もある）
  try {
    await fetch(`${STORAGE_API}/${STORAGE_BUCKET}/${itemId}.jpg`, {
      method:  'DELETE',
      headers: {
        'apikey':        SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
  } catch (e) {
    console.warn('[dbDeletePhoto]', e);
  }
}
