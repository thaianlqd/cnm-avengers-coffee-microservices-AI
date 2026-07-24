import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeftIcon, CalendarIcon, TagIcon, UserIcon, EyeIcon, ArrowRightIcon, NewspaperIcon } from '@heroicons/react/24/outline';
import { apiClient } from '../lib/apiClient';
import { normalizeNewsArticle, FALLBACK_ARTICLES } from '../lib/news';

function parseInlineFormatting(text) {
  if (!text) return '';
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-black text-gray-900 bg-amber-100/60 px-1 py-0.5 rounded">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

function renderFormattedContent(rawContent) {
  if (!rawContent) return null;
  const lines = rawContent.split(/\n+/).map(l => l.trim()).filter(Boolean);

  return (
    <div className="space-y-6 text-[#2d2d2d] text-[16px] md:text-[17.5px] leading-[1.85] font-sans">
      {lines.map((line, index) => {
        // Section Headings (###, ##, #)
        if (line.startsWith('###') || line.startsWith('##') || line.startsWith('#')) {
          const headingText = line.replace(/^#+\s*/, '');
          return (
            <div key={index} className="pt-8 pb-3 mt-4 border-b-2 border-red-100">
              <h3 className="text-xl md:text-2xl font-black uppercase text-[#b22830] tracking-tight flex items-center gap-3">
                <span className="w-2 h-7 bg-[#b22830] rounded-full inline-block flex-shrink-0" />
                {headingText}
              </h3>
            </div>
          );
        }

        // Bullet list (- or *)
        if (line.startsWith('- ') || line.startsWith('* ')) {
          const listText = line.replace(/^[-*]\s*/, '');
          return (
            <div key={index} className="flex items-start gap-3.5 pl-3 my-3 bg-amber-50/40 p-3.5 rounded-xl border border-amber-100/60">
              <span className="w-2.5 h-2.5 rounded-full bg-[#b22830] mt-2 flex-shrink-0 shadow-sm" />
              <div className="flex-1 text-gray-800 font-medium leading-relaxed">
                {parseInlineFormatting(listText)}
              </div>
            </div>
          );
        }

        // Standard Paragraph
        return (
          <p key={index} className="text-gray-800 font-normal leading-[1.85] tracking-wide">
            {parseInlineFormatting(line)}
          </p>
        );
      })}
    </div>
  );
}

export default function NewsDetailPage({ selectedArticleId, onBack, onSelectArticle }) {
  const {
    data: article,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['news', 'detail', selectedArticleId],
    queryFn: async () => {
      const fallbackItem = FALLBACK_ARTICLES.find(item => item.id === selectedArticleId);
      if (String(selectedArticleId).startsWith('fb-')) {
        return fallbackItem || FALLBACK_ARTICLES[0];
      }
      try {
        const response = await apiClient.get(`/news/${selectedArticleId}`);
        const parsed = normalizeNewsArticle(response.data);
        return parsed || fallbackItem || FALLBACK_ARTICLES[0];
      } catch {
        return fallbackItem || FALLBACK_ARTICLES[0];
      }
    },
    enabled: Boolean(selectedArticleId),
    staleTime: 60 * 1000,
  });

  const { data: allArticlesPayload } = useQuery({
    queryKey: ['news', 'all-related'],
    queryFn: async () => {
      try {
        const response = await apiClient.get('/news?limit=20');
        return response.data;
      } catch {
        return null;
      }
    },
    staleTime: 60 * 1000,
  });

  const relatedArticles = useMemo(() => {
    const serverRows = (allArticlesPayload?.items || []).map((item) => normalizeNewsArticle(item)).filter(Boolean);
    const pool = serverRows.length > 0 ? serverRows : FALLBACK_ARTICLES;
    return pool.filter((item) => item.id !== selectedArticleId).slice(0, 3);
  }, [allArticlesPayload, selectedArticleId]);

  if (!selectedArticleId) return null;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 mt-[84px] py-16 flex items-center justify-center">
        <div className="animate-pulse space-y-4 text-center">
          <div className="w-12 h-12 rounded-full bg-red-200 mx-auto"></div>
          <p className="text-sm font-bold text-gray-500">Đang tải bài viết...</p>
        </div>
      </div>
    );
  }

  if (isError || !article) {
    return (
      <div className="min-h-screen bg-gray-50 mt-[84px] py-16 px-4">
        <div className="max-w-md mx-auto rounded-3xl border border-red-100 bg-white p-8 text-center shadow-lg">
          <p className="text-base font-bold text-gray-700">
            Không thể tải bài viết. Vui lòng thử lại.
          </p>
          <button
            type="button"
            onClick={onBack}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#b22830] text-white px-6 py-2.5 text-xs font-black uppercase tracking-wider shadow-md hover:bg-red-800 transition-all"
          >
            <ChevronLeftIcon className="h-4 w-4" />
            Quay lại danh sách
          </button>
        </div>
      </div>
    );
  }

  return (
    <article className="min-h-screen bg-gray-50/50 mt-[84px] pb-20">
      {/* Article Header & Cover */}
      <div className="w-full bg-white border-b border-gray-100 shadow-sm pt-8 pb-12 px-4">
        <div className="max-w-[880px] mx-auto space-y-6">
          {/* Back button */}
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 text-gray-600 hover:text-[#b22830] text-xs font-black uppercase tracking-wider transition-colors bg-gray-100 hover:bg-red-50 px-4 py-2 rounded-full"
          >
            <ChevronLeftIcon className="h-4 w-4" />
            Quay lại Tin Tức
          </button>

          {/* Category Badge & Meta */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <span className="bg-[#b22830] text-white text-[11px] font-black uppercase tracking-widest px-3.5 py-1 rounded-full shadow-sm flex items-center gap-1.5">
              <TagIcon className="w-3.5 h-3.5" />
              {article.category}
            </span>
            <span className="text-xs text-gray-400 font-medium">•</span>
            <span className="flex items-center gap-1 text-xs text-gray-500 font-bold">
              <CalendarIcon className="w-4 h-4 text-[#b22830]" />
              {article.date}
            </span>
            {article.author && (
              <>
                <span className="text-xs text-gray-400 font-medium">•</span>
                <span className="flex items-center gap-1 text-xs text-gray-600 font-bold bg-amber-50 px-2.5 py-0.5 rounded-md border border-amber-100">
                  <UserIcon className="w-3.5 h-3.5 text-amber-600" />
                  {article.author}
                </span>
              </>
            )}
            {article.views > 0 && (
              <>
                <span className="text-xs text-gray-400 font-medium">•</span>
                <span className="flex items-center gap-1 text-xs text-gray-500 font-bold">
                  <EyeIcon className="w-4 h-4 text-blue-500" />
                  {article.views} lượt xem
                </span>
              </>
            )}
          </div>

          {/* Main Title */}
          <h1 className="text-2xl md:text-4xl font-black text-gray-900 uppercase leading-tight tracking-tight font-sans">
            {article.title}
          </h1>

          {/* Featured Cover Image */}
          {article.image && (
            <div className="w-full pt-4">
              <img 
                src={article.image} 
                alt={article.title} 
                className="w-full max-h-[480px] object-cover rounded-3xl shadow-xl border border-gray-100" 
              />
            </div>
          )}
        </div>
      </div>

      {/* Main Body Content Box */}
      <div className="max-w-[880px] mx-auto px-4 -mt-4">
        <div className="bg-white rounded-3xl p-6 md:p-12 shadow-sm border border-gray-100 space-y-8">
          {/* Excerpt Summary Box */}
          {article.excerpt && (
            <div className="bg-red-50/60 border-l-4 border-l-[#b22830] p-6 rounded-r-2xl text-base md:text-lg font-bold text-gray-800 italic shadow-sm leading-relaxed">
              "{article.excerpt}"
            </div>
          )}

          {/* Formatted Content */}
          {renderFormattedContent(article.content)}
        </div>
      </div>

      {/* Related Articles Section */}
      {relatedArticles.length > 0 && (
        <div className="max-w-[1100px] mx-auto px-4 mt-16">
          <div className="flex items-center justify-between mb-8 border-b border-gray-200 pb-4">
            <div className="flex items-center gap-2">
              <NewspaperIcon className="w-6 h-6 text-[#b22830]" />
              <h2 className="text-xl md:text-2xl font-black uppercase text-gray-900 tracking-tight">
                Bài viết cùng chủ đề
              </h2>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {relatedArticles.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectArticle?.(item.id);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="group text-left bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col justify-between"
              >
                <div>
                  <div className="w-full overflow-hidden h-[180px] relative">
                    <img 
                      src={item.image} 
                      alt={item.title} 
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" 
                    />
                    <span className="absolute top-3 left-3 bg-black/60 backdrop-blur-md text-white text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-md">
                      {item.category}
                    </span>
                  </div>
                  <div className="p-5 space-y-2">
                    <h3 className="text-sm font-black uppercase text-gray-900 leading-snug group-hover:text-[#b22830] transition-colors line-clamp-2">
                      {item.title}
                    </h3>
                  </div>
                </div>

                <div className="p-5 pt-0 flex items-center justify-between text-xs text-gray-400 font-semibold border-t border-gray-50 mt-2">
                  <span className="flex items-center gap-1 text-gray-500">
                    <CalendarIcon className="w-3.5 h-3.5 text-[#b22830]" />
                    {item.date}
                  </span>
                  <span className="flex items-center gap-1 text-[#b22830] font-bold group-hover:translate-x-1 transition-transform">
                    Đọc ngay <ArrowRightIcon className="w-3.5 h-3.5" />
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}
