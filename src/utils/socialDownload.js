const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// Instagram/Facebook routinely serve a stripped-down login-wall page to a
// plain browser UA hitting from a server IP, but still serve full og:*
// preview metadata to known crawler UAs (so link previews keep working) —
// this is the standard workaround used to read public post/reel data without login.
const CRAWLER_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

const OG_TAG_RE = /<meta property="og:(video|image)/;

async function fetchPreviewHtml(url) {
  const baseHeaders = { 'Accept-Language': 'en-US,en;q=0.9' };

  const first = await fetch(url, { headers: { ...baseHeaders, 'User-Agent': BROWSER_UA } });
  const firstHtml = first.ok ? await first.text() : '';
  if (first.ok && OG_TAG_RE.test(firstHtml)) return { html: firstHtml, status: first.status };

  // Fall back to a crawler UA before giving up.
  const second = await fetch(url, { headers: { ...baseHeaders, 'User-Agent': CRAWLER_UA } });
  if (second.ok) {
    const secondHtml = await second.text();
    if (OG_TAG_RE.test(secondHtml)) return { html: secondHtml, status: second.status };
  }

  return { html: firstHtml, status: first.ok ? first.status : first.status || second.status };
}

export function detectPlatform(url) {
  if (/instagram\.com/i.test(url)) return 'instagram';
  if (/twitter\.com|x\.com/i.test(url)) return 'twitter';
  if (/tiktok\.com/i.test(url)) return 'tiktok';
  if (/facebook\.com|fb\.watch/i.test(url)) return 'facebook';
  return null;
}

const IG_APP_ID = '936619743392459'; // Instagram's own public web-client app id — sending it as a
// header is the standard technique used by most open-source IG scrapers to
// read a post's real media API response (full-resolution, full-length video)
// without logging in, instead of relying on the truncated preview clip
// Instagram puts in its og:video link-preview tag.

const IG_SHORTCODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function shortcodeToMediaId(shortcode) {
  let id = 0n;
  for (const char of shortcode) {
    const value = IG_SHORTCODE_ALPHABET.indexOf(char);
    if (value === -1) return null;
    id = id * 64n + BigInt(value);
  }
  return id.toString();
}

function extractInstagramShortcode(url) {
  const match = url.match(/instagram\.com\/(?:[^/]+\/)?(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
  return match ? match[1] : null;
}

/**
 * Pull the actual media (video/image) out of one IG media API "item".
 * media_type 2 = video/reel, 1 = photo, 8 = carousel. A video item's own
 * image_versions2 is just its thumbnail — if a video item is missing its
 * video_versions for some reason, return null (don't silently substitute
 * the thumbnail as "the media", which is what previously made reels come
 * through as a static photo).
 */
function mediaFromInstagramItem(item) {
  const isVideo = item.media_type === 2 || !!item.video_versions;
  if (isVideo) {
    return item.video_versions?.length ? { type: 'video', url: item.video_versions[0].url } : null;
  }
  if (item.image_versions2?.candidates?.length) {
    return { type: 'image', url: item.image_versions2.candidates[0].url };
  }
  return null;
}

/**
 * Preferred path: resolve the shortcode to a media id and hit Instagram's own
 * media-info API (the same one the web app itself calls) for the real,
 * full-length/full-resolution media — not the shortened preview clip.
 */
async function downloadInstagramViaApi(url) {
  const shortcode = extractInstagramShortcode(url);
  if (!shortcode) {
    console.error('[ig-api] no shortcode extracted from', url);
    return null;
  }
  const mediaId = shortcodeToMediaId(shortcode);
  if (!mediaId) {
    console.error('[ig-api] shortcode-to-id conversion failed for', shortcode);
    return null;
  }

  const res = await fetch(`https://i.instagram.com/api/v1/media/${mediaId}/info/`, {
    headers: {
      'User-Agent': BROWSER_UA,
      'X-IG-App-ID': IG_APP_ID,
      'X-ASBD-ID': '198337',
      'X-IG-WWW-Claim': '0',
      Origin: 'https://www.instagram.com',
      Referer: 'https://www.instagram.com/',
      'Accept-Language': 'en-US,en;q=0.9',
      Accept: '*/*'
    }
  });
  console.error(`[ig-api] fetch status: ${res.status} for mediaId ${mediaId}`);
  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    console.error('[ig-api] non-OK body (first 300 chars):', bodyText.slice(0, 300));
    return null;
  }

  const data = await res.json().catch((e) => {
    console.error('[ig-api] JSON parse failed:', e.message);
    return null;
  });
  const item = data?.items?.[0];
  if (!item) {
    console.error('[ig-api] no items[0] in response. Top-level keys:', data ? Object.keys(data) : 'null data');
    return null;
  }
  console.error('[ig-api] item media_type:', item.media_type, '| has video_versions:', !!item.video_versions, '| has carousel_media:', !!item.carousel_media?.length);

  const media = [];
  if (item.carousel_media?.length) {
    for (const child of item.carousel_media) {
      const m = mediaFromInstagramItem(child);
      if (m) media.push(m);
    }
  } else {
    const m = mediaFromInstagramItem(item);
    if (m) media.push(m);
  }
  console.error('[ig-api] resolved media count:', media.length, media.map((m) => m.type));
  if (media.length === 0) return null;

  return { media, caption: item.caption?.text ? decodeHtmlEntities(item.caption.text) : '' };
}

/**
 * Fallback: scrape the public og:video / og:image meta tags off the post page
 * itself. Only used if the API path above fails — note og:video is a short
 * preview clip Instagram generates for link previews, not the full reel.
 */
async function downloadInstagramViaScrape(url) {
  const { html, status } = await fetchPreviewHtml(url);
  if (!html) throw new Error(`Couldn't reach that Instagram link (${status}).`);

  const videoMatch = html.match(/<meta property="og:video" content="([^"]+)"/);
  const imageMatch = html.match(/<meta property="og:image" content="([^"]+)"/);
  const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
  console.error('[ig-scrape] og:video found:', !!videoMatch, '| og:image found:', !!imageMatch, '| html length:', html.length);

  const media = [];
  if (videoMatch) media.push({ type: 'video', url: decodeHtmlEntities(videoMatch[1]) });
  else if (imageMatch) media.push({ type: 'image', url: decodeHtmlEntities(imageMatch[1]) });

  if (media.length === 0) {
    throw new Error("Couldn't find downloadable media on that Instagram link (it may be private).");
  }

  return { media, caption: titleMatch ? decodeHtmlEntities(titleMatch[1]) : '' };
}

async function downloadInstagram(url) {
  const apiResult = await downloadInstagramViaApi(url).catch((e) => {
    console.error('[ig-api] threw:', e.message);
    return null;
  });
  if (apiResult) {
    console.error('[ig] used API path, media types:', apiResult.media.map((m) => m.type));
    return apiResult;
  }
  console.error('[ig] API path returned nothing usable, falling back to scrape');
  const scrapeResult = await downloadInstagramViaScrape(url);
  console.error('[ig] used SCRAPE path, media types:', scrapeResult.media.map((m) => m.type));
  return scrapeResult;
}

/**
 * Twitter/X: uses the free public vxtwitter.com mirror API (no key), the same
 * technique many open-source Twitter-embed/download bots use.
 */
async function downloadTwitter(url) {
  const path = url.replace(/https?:\/\/(twitter\.com|x\.com)/i, '');
  const apiUrl = `https://api.vxtwitter.com${path}`;
  const res = await fetch(apiUrl, { headers: { 'User-Agent': BROWSER_UA } });
  if (!res.ok) throw new Error(`Couldn't fetch that tweet (${res.status}).`);
  const data = await res.json();

  const media = (data.media_extended || []).map((m) => ({
    type: m.type === 'image' ? 'image' : 'video',
    url: m.url
  }));
  if (media.length === 0) throw new Error("That tweet doesn't have any photo or video attached.");

  return { media, caption: data.text || '' };
}

/**
 * TikTok: uses the free public tikwm.com API (no key) for watermark-free video,
 * or photo-post images.
 */
async function downloadTikTok(url) {
  const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`;
  const res = await fetch(apiUrl, { headers: { 'User-Agent': BROWSER_UA } });
  if (!res.ok) throw new Error(`Couldn't fetch that TikTok (${res.status}).`);
  const data = await res.json();
  if (data.code !== 0 || !data.data) throw new Error("Couldn't fetch that TikTok link.");

  const media = [];
  if (data.data.images?.length) {
    for (const imgUrl of data.data.images) media.push({ type: 'image', url: imgUrl });
  } else if (data.data.play) {
    media.push({ type: 'video', url: data.data.play });
  }
  if (media.length === 0) throw new Error("Couldn't find downloadable media on that TikTok link.");

  return { media, caption: data.data.title || '' };
}

/**
 * Facebook: no free official API, and unlike Instagram there's no public
 * "app id" header trick to get a real media API response — so this is
 * scrape-only. og:video is often empty for Reels/Watch content specifically
 * (Facebook doesn't populate it as consistently as Instagram does for
 * reels), so on top of the og:* tags this also checks the mobile page
 * (m.facebook.com), which frequently embeds a direct hd_src/sd_src video
 * URL in its page source even when the preview meta tags don't have one —
 * a common fallback used by most open-source FB downloaders.
 */
async function downloadFacebook(url) {
  const { html, status } = await fetchPreviewHtml(url);
  if (!html) throw new Error(`Couldn't reach that Facebook link (${status}).`);

  const videoMatch =
    html.match(/<meta property="og:video:secure_url" content="([^"]+)"/) ||
    html.match(/<meta property="og:video:url" content="([^"]+)"/) ||
    html.match(/<meta property="og:video" content="([^"]+)"/) ||
    html.match(/"(?:browser_native_hd_url|hd_src)":"([^"]+)"/) ||
    html.match(/"(?:browser_native_sd_url|sd_src)":"([^"]+)"/);
  const imageMatch = html.match(/<meta property="og:image" content="([^"]+)"/);
  const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);

  const media = [];
  if (videoMatch) {
    media.push({ type: 'video', url: decodeHtmlEntities(videoMatch[1].replace(/\\\//g, '/')) });
  } else if (imageMatch) {
    media.push({ type: 'image', url: decodeHtmlEntities(imageMatch[1]) });
  }

  if (media.length === 0) {
    throw new Error("Couldn't find downloadable media on that Facebook link — it may be private or behind a login wall.");
  }

  return { media, caption: titleMatch ? decodeHtmlEntities(titleMatch[1]) : '' };
}

function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
}

/**
 * Given any supported social media URL, detect the platform and return
 * { media: [{type, url}], caption } — or throws if unsupported/failed.
 */
export async function downloadSocialPost(url) {
  const platform = detectPlatform(url);
  if (!platform) {
    throw new Error("That doesn't look like an Instagram, Twitter/X, or TikTok link.");
  }
  if (platform === 'instagram') return { platform, ...(await downloadInstagram(url)) };
  if (platform === 'twitter') return { platform, ...(await downloadTwitter(url)) };
  if (platform === 'tiktok') return { platform, ...(await downloadTikTok(url)) };
  if (platform === 'facebook') return { platform, ...(await downloadFacebook(url)) };
}
