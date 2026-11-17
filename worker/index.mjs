const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/tts') {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      }
      if (request.method !== 'GET') {
        return new Response('Method Not Allowed', { status: 405, headers: CORS_HEADERS });
      }
      return handleTTS(request, url, ctx);
    }

    return env.ASSETS.fetch(request);
  },
};

async function handleTTS(request, url, ctx) {
  const text = (url.searchParams.get('text') || '').trim();
  const lang = (url.searchParams.get('lang') || 'ko').trim();

  if (!text) {
    return new Response(JSON.stringify({ error: 'Missing text parameter' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  if (text.length > 200) {
    return new Response(JSON.stringify({ error: 'Text too long (max 200 chars)' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  const cache = caches.default;
  const cacheKey = new Request(url.toString(), { method: 'GET' });
  const cached = await cache.match(cacheKey);
  if (cached) {
    return cached;
  }

  const upstreamUrl = new URL('https://translate.google.com/translate_tts');
  upstreamUrl.searchParams.set('ie', 'UTF-8');
  upstreamUrl.searchParams.set('client', 'tw-ob');
  upstreamUrl.searchParams.set('tl', lang);
  upstreamUrl.searchParams.set('q', text);

  const upstreamRes = await fetch(upstreamUrl.toString(), {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      Referer: 'https://translate.google.com/',
    },
  });

  if (!upstreamRes.ok) {
    return new Response(JSON.stringify({ error: `Upstream TTS failed: ${upstreamRes.status}` }), {
      status: 502,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  const audioBuffer = await upstreamRes.arrayBuffer();
  const response = new Response(audioBuffer, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });

  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
