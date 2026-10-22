import { uiText as ui, useUiLanguage, uiLocale } from '../../lib/uiText';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { accountId } from '../../lib/guestSession';
import { GiftIcon } from '../common/icons';
import GiftCardRedeemModal from '../modals/GiftCardRedeemModal';

export default function MyGiftCardsTab({ userId }) {
  useUiLanguage();
  const [modal, setModal] = useState(null);
  let activeUserId = userId;
  if (!activeUserId) {
    try {
      activeUserId = accountId(JSON.parse(localStorage.getItem('user') || '{}'));
    } catch {
      /* signed out */
    }
  }

  const { data: myCardsRaw = [], isLoading, isError } = useQuery({
    queryKey: ['myGiftCards', activeUserId],
    queryFn: async () => (await apiClient.get(`/gift-cards/my-cards/${activeUserId}`)).data,
    enabled: Boolean(activeUserId && typeof localStorage !== 'undefined' && localStorage.getItem('token')),
  });

  const myCards = Array.isArray(myCardsRaw)
    ? myCardsRaw
    : (Array.isArray(myCardsRaw?.data)
      ? myCardsRaw.data
      : (Array.isArray(myCardsRaw?.items) ? myCardsRaw.items : []));

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-800">
          <GiftIcon className="h-5 w-5 text-[#b22830]" />
          {ui('Thẻ quà tặng')}
        </h3>
        <button
          type="button"
          onClick={() => setModal({ code: '' })}
          className="rounded-xl bg-[#b22830] hover:bg-[#8f1d24] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors cursor-pointer"
        >
          {ui('Nạp tiền bằng thẻ quà tặng')}
        </button>
      </div>

      {isLoading ? (
        <div className="h-36 animate-pulse rounded-xl bg-stone-100" />
      ) : isError ? (
        <p role="alert" className="text-red-700 text-sm font-medium">
          {ui('Không thể tải thẻ quà tặng. Vui lòng thử lại.')}
        </p>
      ) : !myCards.length ? (
        <div className="py-12 text-center text-stone-500">
          <GiftIcon className="mx-auto h-12 w-12 text-stone-300 mb-3" />
          <p className="text-sm font-medium">{ui('Bạn chưa sở hữu thẻ quà tặng nào.')}</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {myCards.map((card) => {
            const expired = card.status === 'EXPIRED' || (card.expires_at && Date.parse(card.expires_at) <= Date.now());
            const hasBalance = Number(card.current_balance ?? card.value) > 0;
            const available = (card.status === 'ACTIVE' || !card.status) && !expired && hasBalance;
            const cardImage = card.theme
              ? `/images/cards/${card.theme}.png`
              : (card.theme_detail?.image_url || '/images/cards/festive_1.png');

            return (
              <article key={card.id || card.code} className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm hover:shadow-md transition-shadow">
                <img
                  src={cardImage}
                  alt="Avengers Coffee Card"
                  className="aspect-[1.6/1] w-full object-cover"
                  onError={(e) => {
                    e.currentTarget.src = '/images/cards/festive_1.png';
                  }}
                />
                <div className="space-y-3 p-4">
                  <p className="font-mono tracking-wider text-sm font-semibold text-gray-800">{card.code}</p>
                  <p className="text-sm text-gray-600">
                    {ui('Mệnh giá ban đầu')}: <span className="font-semibold text-gray-800">{Number(card.value || 0).toLocaleString(uiLocale())} ₫</span>
                  </p>
                  <p className="text-sm text-gray-600">
                    {ui('Hạn sử dụng')}: <span className="font-semibold text-gray-800">{card.expires_at ? new Date(card.expires_at).toLocaleDateString(uiLocale()) : ui('Không giới hạn')}</span>
                  </p>
                  <button
                    type="button"
                    disabled={!available}
                    onClick={() => setModal({ code: card.code })}
                    className="w-full rounded-xl bg-[#b22830] hover:bg-[#8f1d24] py-2.5 text-sm font-semibold text-white disabled:bg-stone-100 disabled:text-stone-400 transition-colors cursor-pointer disabled:cursor-not-allowed"
                  >
                    {expired
                      ? ui('Thẻ quà tặng đã hết hạn')
                      : available
                      ? ui('Nạp số dư vào ví')
                      : ui('Thẻ quà tặng đã được sử dụng')}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {Boolean(modal) && (
        <GiftCardRedeemModal
          isOpen={Boolean(modal)}
          initialCode={modal?.code || ''}
          userId={activeUserId}
          onClose={() => setModal(null)}
        />
      )}
    </section>
  );
}
