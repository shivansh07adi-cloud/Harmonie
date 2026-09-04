function normalizeRedditUrl(url, host = 'www.reddit.com') {
  const clean = url.split('?')[0].replace(/\/$/, '');
  return clean.replace(/^https?:\/\/(www\.|old\.)?reddit\.com/i, `https://${host}`) + '.json';
}

const REDDIT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'application/json, text/html;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1'
};

async function fetchRedditJson(resolvedUrl) {
  // www.reddit.com's .json endpoint has gotten aggressive with bot detection
  // lately, even on residential IPs — old.reddit.com's is usually looser, so
  // try it as a fallback rather than giving up on the first 403.
  for (const host of ['www.reddit.com', 'old.reddit.com']) {
    const jsonUrl = normalizeRedditUrl(resolvedUrl, host);
    const res = await fetch(jsonUrl, { headers: { ...REDDIT_HEADERS, Referer: `https://${host}/` } });
    if (res.ok) return res.json();
    if (res.status !== 403) throw new Error(`Reddit request failed: ${res.status}`);
  }
  throw new Error('Reddit blocked this request (403) on both endpoints — their anti-bot detection is being strict right now. Try again in a bit.');
}

/**
 * Given a reddit post URL, return its title, text (if any), and direct media URLs
 * (image / video / gallery) using Reddit's public JSON endpoint — no auth needed.
 */
export async function fetchRedditPost(postUrl) {
  // Reddit's mobile "share" shortlinks (reddit.com/r/x/s/xxxx) are redirect
  // stubs — appending .json to the shortlink itself 404s/403s. Resolve the
  // redirect to the real /comments/... URL first, then build the .json URL
  // from that.
  let resolvedUrl = postUrl;
  if (/\/s\/[A-Za-z0-9]+/i.test(postUrl)) {
    const redirectRes = await fetch(postUrl, { headers: REDDIT_HEADERS, redirect: 'follow' });
    resolvedUrl = redirectRes.url || postUrl;
  }

  const data = await fetchRedditJson(resolvedUrl);
  const post = data?.[0]?.data?.children?.[0]?.data;
  if (!post) throw new Error('Could not read that Reddit post.');

  const media = [];

  if (post.is_video && post.media?.reddit_video?.fallback_url) {
    media.push({ type: 'video', url: post.media.reddit_video.fallback_url });
  } else if (post.post_hint === 'image' && post.url) {
    media.push({ type: 'image', url: post.url });
  } else if (post.is_gallery && post.media_metadata) {
    for (const key of Object.keys(post.media_metadata)) {
      const item = post.media_metadata[key];
      const src = item?.s?.u || item?.s?.gif;
      if (src) media.push({ type: 'image', url: src.replace(/&amp;/g, '&') });
    }
  } else if (/\.(jpg|jpeg|png|gif)$/i.test(post.url || '')) {
    media.push({ type: 'image', url: post.url });
  }

  return {
    title: post.title,
    selftext: post.selftext,
    author: post.author,
    subreddit: post.subreddit_name_prefixed,
    media
  };
}
