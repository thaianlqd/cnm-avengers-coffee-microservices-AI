import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { normalizeNewsArticle } from '../../lib/news';

export default function NewsPage({ onSelectArticle }) {
  const { data: newsPayload, isLoading: isNewsLoading } = useQuery({
    queryKey: ['news', 'all'],
    queryFn: async () => {
      const response = await apiClient.get('/news?limit=100');
      return response.data;
    },
    staleTime: 60 * 1000,
    refetchInterval: 90 * 1000,
  });

  const newsArticles = useMemo(
    () => (newsPayload?.items || []).map((item) => normalizeNewsArticle(item)).filter(Boolean),
    [newsPayload],
  );

  return (
    <div className="w-full bg-white mt-[84px] min-h-screen">
      <div className="max-w-[1200px] mx-auto px-4 py-10 md:py-16">
        <h1 className="text-[40px] font-bold text-[#333333] mb-10" style={{ fontFamily: 'Georgia, serif' }}>TIN TỨC</h1>
        
        {isNewsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="animate-pulse flex flex-col">
                <div className="h-[240px] bg-gray-200 rounded-sm w-full mb-4"></div>
                <div className="h-6 bg-gray-200 w-3/4 mb-3"></div>
                <div className="h-4 bg-gray-200 w-1/2"></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-12">
            {newsArticles.map((article) => (
              <button 
                key={article.id} 
                onClick={() => onSelectArticle(article.id)}
                className="group flex flex-col text-left items-start"
              >
                <div className="w-full overflow-hidden mb-5">
                  <img 
                    src={article.image} 
                    alt={article.title} 
                    className="w-full h-[240px] object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                </div>
                <h3 className="text-[17px] font-black uppercase text-[#333333] leading-snug group-hover:text-[#b22830] transition-colors mb-4 line-clamp-2">
                  {article.title}
                </h3>
                <div className="flex items-center text-[#777777] text-[13px] font-medium">
                  <span className="text-[#b22830] mr-2">
                    <i className="fa fa-calendar-o"></i> 📅
                  </span>
                  {article.date}
                </div>
              </button>
            ))}
            {newsArticles.length === 0 && (
              <div className="col-span-full py-10 text-center text-gray-500">
                Chưa có tin tức nào.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
