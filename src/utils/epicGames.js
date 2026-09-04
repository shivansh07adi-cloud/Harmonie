export async function getFreeEpicGames() {
  const url =
    'https://store-site-backend-static-ipv4.ak.epicgames.com/freeGamesPromotions?locale=en-US&country=US&allowCountries=US';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Epic Games request failed: ${res.status}`);
  const data = await res.json();
  const elements = data?.data?.Catalog?.searchStore?.elements || [];

  const currentlyFree = [];
  for (const game of elements) {
    const promo = game.promotions?.promotionalOffers?.[0]?.promotionalOffers?.[0];
    if (!promo) continue;
    const now = Date.now();
    const start = new Date(promo.startDate).getTime();
    const end = new Date(promo.endDate).getTime();
    if (now >= start && now <= end) {
      const slug =
        game.catalogNs?.mappings?.[0]?.pageSlug || game.productSlug || game.urlSlug || '';
      currentlyFree.push({
        title: game.title,
        endDate: promo.endDate,
        url: slug ? `https://store.epicgames.com/en-US/p/${slug}` : 'https://store.epicgames.com/en-US/free-games'
      });
    }
  }
  return currentlyFree;
}
