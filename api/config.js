/**
 * api/config.js — Supabase 接続情報を環境変数から返す
 */
module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const url = process.env.SUPABASE_URL      || '';
  const key = process.env.SUPABASE_ANON_KEY || '';

  // デバッグ用: 環境変数の有無だけ確認（値は隠す）
  console.log('[api/config] SUPABASE_URL set:', !!url);
  console.log('[api/config] SUPABASE_ANON_KEY set:', !!key);
  console.log('[api/config] All env keys:', Object.keys(process.env).filter(k => k.startsWith('SUPABASE')));

  res.status(200).json({
    supabaseUrl:     url,
    supabaseAnonKey: key,
    storageBucket:   process.env.STORAGE_BUCKET || 'item-photos',
    // デバッグ用（デプロイ確認後に削除）
    _debug: {
      urlSet: !!url,
      keySet: !!key,
      nodeEnv: process.env.NODE_ENV,
    }
  });
};
