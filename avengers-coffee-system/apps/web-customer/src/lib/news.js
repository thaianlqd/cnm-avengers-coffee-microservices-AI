const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export function resolveNewsImageUrl(rawUrl) {
  if (!rawUrl) {
    return 'https://images.unsplash.com/photo-1470337458703-46ad1756a187?auto=format&fit=crop&w=1200&q=80';
  }

  const value = String(rawUrl);
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return value;
  }

  if (value.startsWith('/')) {
    return `${API_BASE_URL}${value}`;
  }

  return `${API_BASE_URL}/${value}`;
}

export function formatNewsDate(value) {
  if (!value) return '---';
  try {
    return new Date(value).toLocaleDateString('vi-VN');
  } catch {
    return String(value);
  }
}

export function normalizeNewsArticle(article) {
  if (!article) return null;
  return {
    id: article.id,
    category: String(article.category || 'BLOG').toUpperCase(),
    title: article.title || 'Bai viet',
    excerpt: article.description || '',
    date: formatNewsDate(article.created_at),
    image: resolveNewsImageUrl(article.image_url),
    content: article.content || '',
    author: article.author_name || 'Editorial Team',
    views: Number(article.views || 0),
    createdAt: article.created_at,
  };
}
