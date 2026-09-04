export async function getWikiSummary(query) {
  const searchUrl =
    `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=` +
    `${encodeURIComponent(query)}&format=json&srlimit=1`;
  const searchRes = await fetch(searchUrl, {
    headers: { 'User-Agent': 'WhatsAppBot/1.0 (personal project)' }
  });
  if (!searchRes.ok) throw new Error(`Wikipedia search failed: ${searchRes.status}`);
  const searchData = await searchRes.json();
  const title = searchData?.query?.search?.[0]?.title;
  if (!title) throw new Error(`No Wikipedia article found for "${query}".`);

  const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const summaryRes = await fetch(summaryUrl, {
    headers: { 'User-Agent': 'WhatsAppBot/1.0 (personal project)' }
  });
  if (!summaryRes.ok) throw new Error(`Wikipedia summary failed: ${summaryRes.status}`);
  const data = await summaryRes.json();

  return {
    title: data.title,
    extract: data.extract,
    url: data.content_urls?.desktop?.page
  };
}
