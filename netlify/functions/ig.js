// Netlify Function: /.netlify/functions/ig  (zmapowane na /api/ig przez netlify.toml)
export async function handler() {
  const profile = 'ewamrozowska.makeup';

  async function fetchHtml(url) {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
        'Accept-Language': 'pl-PL,pl;q=0.9,en;q=0.8',
        'Accept': 'text/html,application/xhtml+xml'
      }
    });
    return await r.text();
  }

  function extractFromHtml(html) {
    // 1) klasyczny "edge_owner_to_timeline_media"
    const edgesMatch = html.match(/"edge_owner_to_timeline_media":\s*\{[^}]*"edges"\s*:\s*(\[\{.+?\}\])\s*\}/s);
    let edges = [];
    try { edges = edgesMatch ? JSON.parse(edgesMatch[1]) : []; } catch {}

    // 2) awaryjnie łap "display_url" i "shortcode"
    const displayUrls = [...html.matchAll(/"display_url":"(https:[^"]+?)"/g)]
      .map(m => decodeURIComponent(m[1].replace(/\\u0026/g, '&')));
    const shortcodes = [...html.matchAll(/"shortcode":"([^"]+?)"/g)].map(m => m[1]);

    const posts = [];
    if (edges.length) {
      edges.forEach(e => {
        const n = e.node || e;
        if ((n.display_url || n.thumbnail_src) && (n.shortcode || n.code)) {
          const url = n.display_url || n.thumbnail_src;
          const sc = n.shortcode || n.code;
          posts.push({
            url, thumb: url,
            permalink: `https://www.instagram.com/p/${sc}/`,
            alt: (n.accessibility_caption || '').slice(0, 80)
          });
        }
      });
    }
    // fallback – buduj z par url/shortcode
    if (!posts.length && displayUrls.length) {
      for (let i = 0; i < Math.min(displayUrls.length, 12); i++) {
        const u = displayUrls[i];
        const sc = shortcodes[i] || '';
        posts.push({
          url: u, thumb: u,
          permalink: sc ? `https://www.instagram.com/p/${sc}/` : `https://www.instagram.com/${profile}/`,
          alt: 'Instagram post'
        });
      }
    }
    return posts.slice(0, 12);
  }

  try {
    // 1) Próba bezpośrednio z IG
    const html1 = await fetchHtml(`https://www.instagram.com/${profile}/`);
    let posts = extractFromHtml(html1);

    // 2) Jeśli pusto, użyj proxy r.jina.ai (mirror treści strony)
    if (!posts.length) {
      const html2 = await fetchHtml(`https://r.jina.ai/http://www.instagram.com/${profile}/`);
      posts = extractFromHtml(html2);
    }

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=900' },
      body: JSON.stringify(posts)
    };
  } catch (e) {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' };
  }
}
