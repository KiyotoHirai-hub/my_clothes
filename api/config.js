/**
 * api/config.js
 * Vercel の環境変数をフロントエンドに安全に渡す Serverless Function。
 * GET /api/config
 */
module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    supabaseUrl:     process.env.SUPABASE_URL      || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
    storageBucket:   process.env.STORAGE_BUCKET    || 'item-photos',
  });
};
