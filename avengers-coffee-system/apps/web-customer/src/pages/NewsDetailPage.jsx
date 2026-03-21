import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeftIcon } from '@heroicons/react/24/outline';
import { apiClient } from '../lib/apiClient';
import { normalizeNewsArticle } from '../lib/news';

export default function NewsDetailPage({ selectedArticleId, onBack }) {
  const {
    data: article,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['news', 'detail', selectedArticleId],
    queryFn: async () => {
      const response = await apiClient.get(`/news/${selectedArticleId}`);
      return normalizeNewsArticle(response.data);
    },
    enabled: Boolean(selectedArticleId),
    staleTime: 60 * 1000,
  });

  const { data: relatedPayload } = useQuery({
    queryKey: ['news', 'related', article?.category],
    queryFn: async () => {
      const response = await apiClient.get(
        `/news/category/${encodeURIComponent(article.category)}?limit=4`,
      );
      return response.data;
    },
    enabled: Boolean(article?.category),
    staleTime: 60 * 1000,
  });

  const relatedArticles = useMemo(() => {
    const rows = (relatedPayload?.items || [])
      .map((item) => normalizeNewsArticle(item))
      .filter(Boolean);
    return rows.filter((item) => item.id !== selectedArticleId).slice(0, 3);
  }, [relatedPayload, selectedArticleId]);

  if (!selectedArticleId) {
    return null;
  }

  if (isLoading) {
    return (
      <section className="mx-auto max-w-[960px] px-4 py-16 md:px-6">
        <p className="text-center text-lg font-semibold text-[#6f6258]">Đang tải bài viết...</p>
      </section>
    );
  }

  if (isError || !article) {
    return (
      <section className="mx-auto max-w-[960px] px-4 py-16 md:px-6">
        <div className="rounded-3xl border border-[#f0d4b8] bg-white p-8 text-center">
          <p className="text-lg font-semibold text-[#6f6258]">
            Không thể tải bài viết. Vui lòng thử lại.
          </p>
          <button
            type="button"
            onClick={onBack}
            className="mt-6 inline-flex items-center gap-2 rounded-full border border-[#e9b58f] px-5 py-2 text-sm font-black uppercase tracking-[0.16em] text-[#cc6a2d]"
          >
            <ChevronLeftIcon className="h-5 w-5" />
            Quay lại
          </button>
        </div>
      </section>
    );
  }

  return (
    <article className="min-h-screen overflow-hidden bg-white">
      <div className="border-b border-[#ece3cc] bg-gradient-to-b from-[#f3e8bb] to-[#fbf7ea]">
        <div className="mx-auto max-w-[960px] px-4 py-6 md:px-6 md:py-8">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-full border border-[#e9b58f] px-5 py-2 text-sm font-black uppercase tracking-[0.16em] text-[#cc6a2d]"
          >
            <ChevronLeftIcon className="h-5 w-5" />
            Quay lại danh sách tin
          </button>

          <div className="mt-8 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 text-[12px] font-black uppercase tracking-[0.2em]">
              <span className="rounded-full bg-[#e67a3a] px-4 py-2 text-white shadow-md">{article.category}</span>
              <span className="text-[#9d968f]">{article.date}</span>
            </div>
            <h1 className="text-4xl font-black uppercase leading-tight text-[#161616] md:text-6xl" style={{ fontFamily: 'Georgia, serif' }}>
              {article.title}
            </h1>
            {article.excerpt ? (
              <p className="max-w-[600px] text-lg font-semibold leading-relaxed text-[#3d362f] md:text-xl">
                {article.excerpt}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="relative overflow-hidden bg-[#f7f0df]">
        <div className="mx-auto max-w-[960px] px-0 md:px-6 md:py-4">
          <img src={article.image} alt={article.title} className="h-[300px] w-full object-cover md:h-[500px] md:rounded-3xl" />
        </div>
      </div>

      <div className="border-b border-[#ece3cc] bg-white">
        <div className="mx-auto max-w-[960px] px-4 py-12 md:px-6 md:py-16">
          <div className="space-y-6 text-lg font-semibold leading-relaxed text-[#413a33] md:text-xl">
            {(article.content || '')
              .split(/\n+/)
              .map((text) => text.trim())
              .filter(Boolean)
              .map((paragraph, index) => (
                <p key={`${article.id}-${index}`} className="first-letter:text-2xl">
                  {paragraph}
                </p>
              ))}
          </div>

          <div className="mt-12 rounded-2xl border border-[#e7b48d] bg-[#f7f0df] p-6 space-y-3">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#d67b3c]">Thông tin bài viết</p>
            <div className="grid gap-4 text-sm font-semibold text-[#433d38] md:grid-cols-3">
              <div>
                <span className="block text-[11px] font-black uppercase tracking-[0.16em] text-[#9d968f]">Danh mục</span>
                <span className="mt-1 block text-base">{article.category}</span>
              </div>
              <div>
                <span className="block text-[11px] font-black uppercase tracking-[0.16em] text-[#9d968f]">Ngày đăng</span>
                <span className="mt-1 block text-base">{article.date}</span>
              </div>
              <div>
                <span className="block text-[11px] font-black uppercase tracking-[0.16em] text-[#9d968f]">Tác giả</span>
                <span className="mt-1 block text-base">{article.author}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {relatedArticles.length > 0 && (
        <div className="border-t border-[#ece3cc] bg-gradient-to-b from-white to-[#fbf7ea]">
          <div className="mx-auto max-w-[960px] px-4 py-12 md:px-6 md:py-16">
            <div className="mb-10">
              <p className="text-[12px] font-black uppercase tracking-[0.4em] text-[#d67b3c]">Bài viết khác</p>
              <h2 className="mt-3 text-3xl font-black uppercase text-[#161616] md:text-4xl">Có thể bạn sẽ thích</h2>
            </div>

            <div className="grid gap-8 md:grid-cols-3">
              {relatedArticles.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => (window.location.hash = `#news/${item.id}`)}
                  className="group overflow-hidden rounded-[28px] bg-[#f7f0df] text-left shadow-sm shadow-orange-100 transition-transform hover:-translate-y-2"
                >
                  <div className="relative overflow-hidden">
                    <img src={item.image} alt={item.title} className="h-[240px] w-full object-cover transition-transform group-hover:scale-105" />
                  </div>
                  <div className="p-5">
                    <div className="flex items-center justify-between gap-3 text-[11px] font-black uppercase tracking-[0.18em] text-[#d67b3c]">
                      <span>{item.category}</span>
                      <span className="text-[#9d968f]">{item.date}</span>
                    </div>
                    <h3 className="mt-4 text-2xl font-black uppercase leading-tight text-[#171717]">{item.title}</h3>
                    {item.excerpt ? (
                      <p className="mt-3 line-clamp-2 text-base font-semibold leading-relaxed text-[#433d38]">
                        {item.excerpt}
                      </p>
                    ) : null}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
