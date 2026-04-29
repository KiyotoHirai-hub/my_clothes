/**
 * config.js
 * Supabase クライアントを初期化する。
 * window.supabase は CDN の SDK が設定済みなので let 宣言しない。
 */

// db.js が参照するグローバル変数
var SUPABASE_URL      = '';
var SUPABASE_ANON_KEY = '';
var STORAGE_BUCKET    = 'item-photos';
var supabaseClient    = null; // SDKクライアント（supabase という名前を避ける）

var configReady = fetch('/api/config')
  .then(function(r) { return r.json(); })
  .then(function(d) {
    SUPABASE_URL      = d.supabaseUrl      || '';
    SUPABASE_ANON_KEY = d.supabaseAnonKey  || '';
    STORAGE_BUCKET    = d.storageBucket    || 'item-photos';

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error('Supabase の接続情報が取得できませんでした');
    }

    // window.supabase は CDN SDK のオブジェクト、createClient を呼ぶ
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('[config] Supabase client ready ✓');
  })
  .catch(function(e) {
    console.error('[config] 初期化失敗:', e.message);
    // エラーでも configReady を reject させて呼び出し元でキャッチできるようにする
    return Promise.reject(e);
  });
