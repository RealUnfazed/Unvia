// Keyword-based topic tagging for posts.

const TOPICS = [
  { slug: 'technology', name: 'Technology', emoji: '💻', kw: 'tech technology software ai ml coding code programming javascript typescript python rust developer devs api startup startups app apps gadget gadgets iphone android linux cybersecurity robot robots chip chips gpu cloud opensource github openai chatgpt' },
  { slug: 'sports', name: 'Sports', emoji: '⚽', kw: 'football soccer basketball nba nfl mlb nhl tennis golf cricket f1 formula1 olympics goal match league champions worldcup athlete training marathon boxing mma ufc' },
  { slug: 'music', name: 'Music', emoji: '🎵', kw: 'music song songs album albums band concert rapper hiphop rap pop rock jazz playlist spotify guitar piano singer lyrics dj' },
  { slug: 'gaming', name: 'Gaming', emoji: '🎮', kw: 'gaming gamer gamers game games playstation ps5 xbox nintendo switch steam esports fortnite minecraft zelda pokemon valorant twitch speedrun rpg fps' },
  { slug: 'science', name: 'Science', emoji: '🔬', kw: 'science scientist physics chemistry biology astronomy space nasa spacex rocket planet mars moon quantum research study experiment climate dna' },
  { slug: 'art', name: 'Art & design', emoji: '🎨', kw: 'art artist drawing painting illustration design designer ux ui sketch digital photography photo photographer gallery sculpture animation' },
  { slug: 'food', name: 'Food', emoji: '🍕', kw: 'food recipe recipes cooking cook dinner lunch breakfast pizza burger coffee tea baking dessert restaurant chef vegan sushi' },
  { slug: 'travel', name: 'Travel', emoji: '✈️', kw: 'travel trip vacation flight flights hotel beach mountains hiking tourism journey passport roadtrip airport' },
  { slug: 'news', name: 'News & politics', emoji: '📰', kw: 'news breaking politics election president government senate vote voting law policy minister parliament war economy' },
  { slug: 'entertainment', name: 'Movies & TV', emoji: '🎬', kw: 'movie movies film films cinema series show netflix hbo disney trailer actor actress oscar anime episode season director' },
  { slug: 'business', name: 'Business & finance', emoji: '📈', kw: 'business finance stocks stock market investing investor crypto bitcoin ethereum economy startup founder revenue profit trading bank inflation' },
  { slug: 'health', name: 'Health & fitness', emoji: '💪', kw: 'health fitness gym workout running yoga diet nutrition sleep wellness mental therapy doctor medicine exercise' },
  { slug: 'humor', name: 'Humor', emoji: '😂', kw: 'meme memes funny joke jokes lol lmao humor comedy haha' },
].map((t) => ({ ...t, kw: new Set(t.kw.split(' ')) }));

// Keyword-based topic tagging at write time (no ML): a post gets up to 3 topics from words and #hashtags it contains.
const topicsOf = (text) => {
  const words = new Set((String(text || '').toLowerCase().match(/#?[a-z0-9_']+/g) || []).map((w) => (w[0] === '#' ? w.slice(1) : w)));
  return TOPICS.filter((t) => [...words].some((w) => t.kw.has(w))).map((t) => t.slug).slice(0, 3);
};

module.exports = { TOPICS, topicsOf };
