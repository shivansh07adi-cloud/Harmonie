const IG_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'x-ig-app-id': '936619743392459' // public web app id used by instagram.com itself, not a secret
};

/**
 * Get a public Instagram profile picture URL by username.
 * Instagram has no official free API for this — this uses their public web endpoint,
 * with a fallback to scraping the og:image meta tag. Both are unofficial and may
 * break or get rate-limited if Instagram changes their site.
 */
export async function getInstagramProfilePic(username) {
  const clean = username.replace(/^@/, '').trim();

  try {
    const apiUrl = `https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(clean)}`;
    const res = await fetch(apiUrl, { headers: IG_HEADERS });
    if (res.ok) {
      const data = await res.json();
      const user = data?.data?.user;
      if (user) {
        return {
          username: user.username,
          fullName: user.full_name,
          picUrl: user.profile_pic_url_hd || user.profile_pic_url,
          isPrivate: user.is_private
        };
      }
    }
  } catch {
    // fall through to HTML scrape fallback
  }

  const pageRes = await fetch(`https://www.instagram.com/${encodeURIComponent(clean)}/`, {
    headers: IG_HEADERS
  });
  if (!pageRes.ok) throw new Error(`Couldn't reach Instagram profile "${clean}".`);
  const html = await pageRes.text();
  const match = html.match(/<meta property="og:image" content="([^"]+)"/);
  if (!match) throw new Error(`Couldn't find a profile picture for "${clean}".`);
  return { username: clean, fullName: null, picUrl: match[1].replace(/&amp;/g, '&'), isPrivate: null };
}
