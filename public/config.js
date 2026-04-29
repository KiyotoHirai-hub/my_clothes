/**
 * config.js — /api/config から接続情報を取得して Supabase クライアントを初期化する
 */

let SUPABASE_URL      = '';
let SUPABASE_ANON_KEY = '';
let STORAGE_BUCKET    = 'item-photos';
let supabase          = null; // Supabase JS SDK クライアント

const configReady = fetch('/api/config')
  .then(r => r.json())
  .then(d => {
    SUPABASE_URL      = d.supabaseUrl;
    SUPABASE_ANON_KEY = d.supabaseAnonKey;
    STORAGE_BUCKET    = d.storageBucket || 'item-photos';

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error('Supabase の接続情報が設定されていません（Vercel環境変数を確認）');
    }

    // Supabase JS SDK でクライアントを生成
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('[config] Supabase client initialized ✓');
  })
  .catch(e => {
    console.error('[config] failed:', e);
    throw e;
  });
