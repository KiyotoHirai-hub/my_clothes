/**
 * api/coord.js
 * Vercel Serverless Function — Anthropic API のプロキシ。
 * ブラウザから直接 api.anthropic.com を叩くと CORS でブロックされるため、
 * サーバー側で中継する。
 *
 * POST /api/coord
 * Body: { prompt: string }
 * Response: { content: [{ type: 'text', text: string }] }
 */

const https = require('https');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // プリフライトリクエスト（OPTIONS）への対応
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY が設定されていません' });
    return;
  }

  // リクエストボディを取得
  let body = '';
  for await (const chunk of req) { body += chunk; }

  let prompt;
  try {
    const parsed = JSON.parse(body);
    prompt = parsed.prompt;
    if (!prompt) throw new Error('prompt が空です');
  } catch (e) {
    res.status(400).json({ error: 'リクエストボディが不正です: ' + e.message });
    return;
  }

  // Anthropic API へのリクエストボディ
  const anthropicBody = JSON.stringify({
    model:      'claude-sonnet-4-20250514',
    max_tokens: 1000,
    messages:   [{ role: 'user', content: prompt }],
  });

  // Anthropic API を呼び出す
  try {
    const result = await new Promise((resolve, reject) => {
      const reqOptions = {
        hostname: 'api.anthropic.com',
        path:     '/v1/messages',
        method:   'POST',
        headers: {
          'Content-Type':      'application/json',
          'x-api-key':         apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Length':    Buffer.byteLength(anthropicBody),
        },
      };

      const apiReq = https.request(reqOptions, (apiRes) => {
        let data = '';
        apiRes.setEncoding('utf8');
        apiRes.on('data', chunk => { data += chunk; });
        apiRes.on('end', () => {
          if (apiRes.statusCode >= 400) {
            reject(new Error('Anthropic API error ' + apiRes.statusCode + ': ' + data));
          } else {
            try { resolve(JSON.parse(data)); }
            catch (e) { reject(new Error('JSON parse error: ' + data)); }
          }
        });
      });

      apiReq.on('error', reject);
      apiReq.setTimeout(30000, () => { apiReq.destroy(); reject(new Error('timeout')); });
      apiReq.write(anthropicBody);
      apiReq.end();
    });

    res.status(200).json(result);

  } catch (e) {
    console.error('[api/coord]', e.message);
    res.status(500).json({ error: e.message });
  }
};
