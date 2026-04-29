/**
 * config.js
 * /api/config から Supabase の接続情報を取得して
 * グローバル変数にセットする。
 * db.js より先に読み込まれること。
 */

// グローバル変数（db.js が参照する）
let SUPABASE_URL      = '';
let SUPABASE_ANON_KEY = '';
let STORAGE_BUCKET    = 'item-photos';

// 設定を取得する Promise（app.js / detail.js は await configReady してから使う）
const configReady = fetch('/api/config')
  .then(r => r.json())
  .then(d => {
    SUPABASE_URL      = d.supabaseUrl;
    SUPABASE_ANON_KEY = d.supabaseAnonKey;
    STORAGE_BUCKET    = d.storageBucket || 'item-photos';
    console.log('[config] loaded. URL:', SUPABASE_URL ? '✓' : '✗ MISSING');
  })
  .catch(e => {
    console.error('[config] failed to load:', e);
  });
