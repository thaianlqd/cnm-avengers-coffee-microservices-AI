import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarIcon, EyeIcon, TagIcon, NewspaperIcon, ArrowRightIcon } from '@heroicons/react/24/outline';
import { apiClient } from '../../lib/apiClient';
import { normalizeNewsArticle, FALLBACK_ARTICLES } from '../../lib/news';

export default function NewsPage({ onSelectArticle }) {
  const { data: newsPayload, isLoading: isNewsLoading } = useQuery({
    queryKey: ['news', 'all'],
    queryFn: async () => {
      try {
        const response = await apiClient.get('/news?limit=100');
        return response.data;
      } catch {
        return null;
      }
    },
    staleTime: 60 * 1000,
    refetchInterval: 90 * 1000,
  });

  const newsArticles = useMemo(() => {
    const serverRows = (newsPayload?.items || []).map((item) => normalizeNewsArticle(item)).filter(Boolean);
    if (serverRows.length > 0) return serverRows;
    return FALLBACK_ARTICLES;
  }, [newsPayload]);

  const featuredArticle = newsArticles[0];
  const listArticles = newsArticles.slice(1);

  return (
    <div className="w-full bg-white mt-[84px] min-h-screen">
      {/* Top Banner Header */}
      <div className="bg-[#b22830] text-white py-12 px-4 shadow-md">
        <div className="max-w-[1200px] mx-auto text-center space-y-3">
          <div className="inline-flex items-center gap-2 bg-white/15 px-4 py-1.5 rounded-full text-xs font-extrabold uppercase tracking-widest text-amber-200 border border-white/20">
            <NewspaperIcon className="w-4 h-4 text-amber-200" />
            Tin Tức & Sự Kiện Avengers Coffee
          </div>
          <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tight text-white font-sans">
            CÂU CHUYỆN CÀ PHÊ & LIFESTYLE
          </h1>
          <p className="text-sm md:text-base text-white/80 font-medium max-w-2xl mx-auto leading-relaxed">
            Khám phá thế giới hương vị phong phú, bí quyết pha chế chuẩn gu và những câu chuyện văn hóa cà phê đặc sắc nhất.
          </p>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-4 py-10 md:py-14">
        {isNewsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="animate-pulse flex flex-col">
                <div className="h-[240px] bg-gray-200 rounded-2xl w-full mb-4"></div>
                <div className="h-6 bg-gray-200 w-3/4 mb-3 rounded-lg"></div>
                <div className="h-4 bg-gray-200 w-1/2 rounded-lg"></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-12">
            {/* Featured Article Top Card */}
            {featuredArticle && (
              <div 
                onClick={() => onSelectArticle(featuredArticle.id)}
                className="group cursor-pointer bg-amber-50/40 rounded-3xl overflow-hidden border border-amber-100/80 shadow-sm hover:shadow-xl transition-all duration-300 grid grid-cols-1 md:grid-cols-12 gap-0"
              >
                <div className="md:col-span-7 overflow-hidden h-[300px] md:h-[420px] relative">
                  <img 
                    src={featuredArticle.image} 
                    alt={featuredArticle.title} 
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <span className="absolute top-4 left-4 bg-[#b22830] text-white text-[11px] font-black uppercase tracking-widest px-3 py-1 rounded-full shadow-md">
                    Nổi bật
                  </span>
                </div>
                <div className="md:col-span-5 p-6 md:p-10 flex flex-col justify-between">
                  <div className="space-y-4">
                    <span className="inline-flex items-center gap-1.5 text-xs font-black uppercase text-[#b22830] tracking-wider">
                      <TagIcon className="w-3.5 h-3.5" />
                      {featuredArticle.category}
                    </span>
                    <h2 className="text-xl md:text-2xl font-black uppercase text-[#222] leading-snug group-hover:text-[#b22830] transition-colors">
                      {featuredArticle.title}
                    </h2>
                    <p className="text-sm text-gray-600 font-medium leading-relaxed line-clamp-3">
                      {featuredArticle.excerpt}
                    </p>
                  </div>
                  <div className="pt-6 border-t border-amber-200/50 flex items-center justify-between text-xs text-gray-500 font-bold">
                    <span className="flex items-center gap-1.5">
                      <CalendarIcon className="w-4 h-4 text-[#b22830]" />
                      {featuredArticle.date}
                    </span>
                    <span className="flex items-center gap-1 text-[#b22830] font-black uppercase group-hover:translate-x-1 transition-transform">
                      Đọc tiếp <ArrowRightIcon className="w-4 h-4" />
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Articles Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {listArticles.map((article) => (
                <button 
                  key={article.id} 
                  onClick={() => onSelectArticle(article.id)}
                  className="group text-left bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col justify-between"
                >
                  <div>
                    <div className="w-full overflow-hidden h-[220px] relative">
                      <img 
                        src={article.image} 
                        alt={article.title} 
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                      />
                      <span className="absolute top-3 left-3 bg-black/60 backdrop-blur-md text-white text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-md">
                        {article.category}
                      </span>
                    </div>
                    <div className="p-5 space-y-3">
                      <h3 className="text-[16px] font-black uppercase text-[#333333] leading-snug group-hover:text-[#b22830] transition-colors line-clamp-2">
                        {article.title}
                      </h3>
                      <p className="text-xs text-gray-500 font-medium leading-relaxed line-clamp-2">
                        {article.excerpt}
                      </p>
                    </div>
                  </div>

                  <div className="p-5 pt-0 flex items-center justify-between text-[12px] text-gray-400 font-semibold border-t border-gray-50 mt-2">
                    <span className="flex items-center gap-1.5 text-gray-500">
                      <CalendarIcon className="w-3.5 h-3.5 text-[#b22830]" />
                      {article.date}
                    </span>
                    <span className="flex items-center gap-1 text-[#b22830] font-bold text-xs group-hover:translate-x-1 transition-transform">
                      Xem bài viết <ArrowRightIcon className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
