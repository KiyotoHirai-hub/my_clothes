/**
 * db.js — Supabase JS SDK を使ったデータアクセス層
 * config.js で初期化された `supabase` クライアントを使う
 */

/* ── アイテム一覧取得 ─────────────────────────────────── */
async function dbGetItems({ season, search, sort } = {}) {
  let query = supabase.from('items').select('*');

  // 季節フィルター
  if (season && season !== 'all') {
    query = query.eq(season, true);
  }

  // 検索（複数フィールドをORで部分一致）
  if (search && search.trim()) {
    const q = search.trim();
    query = query.or(
      `name.ilike.%${q}%,brand.ilike.%${q}%,category.ilike.%${q}%,` +
      `culture.ilike.%${q}%,color.ilike.%${q}%,country.ilike.%${q}%,` +
      `fabric.ilike.%${q}%,year.ilike.%${q}%`
    );
  }

  // ソート
  const ORDER = {
    wear_count: { col: 'wear_count', asc: false },
    like_count: { col: 'like_count', asc: false },
    name:       { col: 'name',       asc: true  },
    created_at: { col: 'created_at', asc: false },
  };
  const o = ORDER[sort] || ORDER.wear_count;
  query = query.order(o.col, { ascending: o.asc, nullsFirst: false });

  const { data, error } = await query;
  if (error) throw new Error(`dbGetItems: ${error.message}`);
  return data || [];
}

/* ── アイテム1件取得 ──────────────────────────────────── */
async function dbGetItem(id) {
  const { data, error } = await supabase
    .from('items')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw new Error(`dbGetItem: ${error.message}`);
  return data;
}

/* ── アイテム追加 ─────────────────────────────────────── */
async function dbAddItem(data) {
  const { data: rows, error } = await supabase
    .from('items')
    .insert(data)
    .select()
    .single();
  if (error) throw new Error(`dbAddItem: ${error.message}`);
  return rows;
}

/* ── アイテム更新 ─────────────────────────────────────── */
async function dbUpdateItem(id, data) {
  const { data: rows, error } = await supabase
    .from('items')
    .update(data)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(`dbUpdateItem: ${error.message}`);
  return rows;
}

/* ── アイテム削除 ─────────────────────────────────────── */
async function dbDeleteItem(id) {
  const { error } = await supabase
    .from('items')
    .delete()
    .eq('id', id);
  if (error) throw new Error(`dbDeleteItem: ${error.message}`);
}

/* ── 着用 +1 ──────────────────────────────────────────── */
async function dbWear(id, currentCount) {
  return dbUpdateItem(id, {
    wear_count: (currentCount || 0) + 1,
    last_worn:  new Date().toISOString(),
  });
}

/* ── 写真アップロード（Supabase Storage） ────────────── */
async function dbUploadPhoto(itemId, base64DataUrl) {
  // Base64 → Blob 変換
  const [meta, b64] = base64DataUrl.split(',');
  const mime   = meta.match(/:(.*?);/)[1];
  const binary = atob(b64);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: mime });

  const filename = `${itemId}.jpg`;

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(filename, blob, { upsert: true, contentType: mime });

  if (error) throw new Error(`dbUploadPhoto: ${error.message}`);

  // 公開URLを取得
  const { data } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(filename);

  return `${data.publicUrl}?t=${Date.now()}`;
}

/* ── 写真削除 ─────────────────────────────────────────── */
async function dbDeletePhoto(itemId) {
  try {
    await supabase.storage
      .from(STORAGE_BUCKET)
      .remove([`${itemId}.jpg`]);
  } catch (e) {
    console.warn('[dbDeletePhoto]', e);
  }
}
