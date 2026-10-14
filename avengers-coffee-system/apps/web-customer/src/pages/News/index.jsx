import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ArrowRightIcon } from '@heroicons/react/24/outline';
import { apiClient } from '../../lib/apiClient';
import { normalizeNewsArticle } from '../../lib/news';

export default function NewsPage({ onSelectArticle }) {
  const { i18n } = useTranslation();
  const copy = (vi, en) => i18n.resolvedLanguage === 'en' ? en : vi;
  const [category, setCategory] = useState('all');
  const query = useQuery({
    queryKey: ['news', 'all'],
    queryFn: async () => (await apiClient.get('/news?limit=100')).data,
    staleTime: 10 * 60 * 1000,
  });
  const articles = useMemo(() => (query.data?.items || []).map(normalizeNewsArticle).filter(Boolean), [query.data]);
  const categories = [...new Set(articles.map(a => a.category).filter(Boolean))];
  const selected = category === 'all' ? articles : articles.filter(a => a.category === category);
  const [featured, ...rest] = selected;
  const categoryName = value => ({ COFFEEHOLIC: copy('Chuyện cà phê', 'Coffee stories'), TEAHOLIC: copy('Chuyện trà', 'Tea stories'), LIFESTYLE: copy('Đời sống', 'Lifestyle') }[value] || value);
  return <div className="news-editorial">
    <header className="editorial-heading">
      <p className="editorial-eyebrow">AVENGERS COFFEE / {copy('TIN TỨC', 'JOURNAL')}</p>
      <h1>{copy('Chuyện bên ly cà phê.', 'Stories over coffee.')}</h1>
      <p>{copy('Tin mới, những hương vị quen và câu chuyện từ Avengers.', 'News, familiar flavours and stories from Avengers.')}</p>
    </header>
    <nav className="news-filters" aria-label={copy('Chủ đề tin tức', 'News topics')}>
      {['all', ...categories].map(value => <button type="button" key={value} aria-pressed={category === value} onClick={() => setCategory(value)}>
        {value === 'all' ? copy('Tất cả', 'All stories') : categoryName(value)}
      </button>)}
    </nav>
    {query.isPending ? <div className="news-skeleton" role="status" aria-label={copy('Đang tải tin tức', 'Loading stories')} /> : query.isError && !articles.length ? <div className="editorial-empty">
      <p>{copy('Chưa tải được tin tức. Bạn thử lại nhé.', 'Stories could not be loaded. Please try again.')}</p>
      <button onClick={() => query.refetch()}>{copy('Thử lại', 'Retry')}</button>
    </div> : !featured ? <p className="editorial-empty">{copy('Chưa có bài viết trong chủ đề này.', 'There are no stories in this topic yet.')}</p> : <>
      <button type="button" className="news-feature" onClick={() => onSelectArticle(featured.id)}>
        <div className="news-image"><img src={featured.image} alt={featured.title} decoding="async" fetchPriority="high" /></div>
        <div className="news-feature-copy">
          <span className="editorial-eyebrow">{categoryName(featured.category)}</span>
          <h2>{featured.title}</h2>
          <p>{featured.excerpt}</p>
          <div className="news-meta"><time>{featured.date}</time><span>{copy('Đọc câu chuyện', 'Read the story')} <ArrowRightIcon /></span></div>
        </div>
      </button>
      <div className="news-grid">
        {rest.map(article => <article key={article.id} data-reveal className="news-story">
          <button type="button" onClick={() => onSelectArticle(article.id)}>
            <div className="news-image"><img src={article.image} alt={article.title} loading="lazy" decoding="async" /></div>
            <div className="news-story-copy">
              <span className="editorial-eyebrow">{categoryName(article.category)}</span>
              <h2>{article.title}</h2><p>{article.excerpt}</p>
              <div className="news-meta"><time>{article.date}</time><span>{copy('Xem bài viết', 'Read article')} <ArrowRightIcon /></span></div>
            </div>
          </button>
        </article>)}
      </div>
    </>}
  </div>;
}
