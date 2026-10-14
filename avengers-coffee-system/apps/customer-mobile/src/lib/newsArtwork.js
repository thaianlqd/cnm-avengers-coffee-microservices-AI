// Replace only the three legacy editorial placeholders. Uploaded/custom article images stay intact.
const images = {
  'photo-1514432324607-a09d9b4aefdd': require('../../assets/news/heritage.jpg'),
  'photo-1536256263959-770b48d82b0a': require('../../assets/news/lotus-tea.jpg'),
  'photo-1495474472287-4d71bcdd2085': require('../../assets/news/community.jpg'),
}
export function newsArtwork(url) {
  return Object.entries(images).find(([legacy]) => String(url || '').includes(legacy))?.[1]
}
