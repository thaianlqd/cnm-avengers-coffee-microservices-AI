import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { GiftIcon, XMarkIcon } from '../common/icons';
import { apiClient } from '../../lib/apiClient';
import { formatGiftCode, validGiftCode, giftCardError } from '../../lib/giftCard';
import { uiText as ui, useUiLanguage, uiLocale } from '../../lib/uiText';

export default function GiftCardRedeemModal({ isOpen, onClose, userId, initialCode = '', onSuccess }) {
  useUiLanguage();
  const dialog = useRef(null);
  const inFlight = useRef(false);
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const queryClient = useQueryClient();
  useEffect(() => {
    if (isOpen) {
      setCode(formatGiftCode(initialCode)); setPreview(null); setResult(null); setError('');
      if (dialog.current && !dialog.current.open) {
        try { dialog.current.showModal(); } catch { dialog.current.setAttribute('open', ''); }
      }
    } else if (dialog.current?.open) {
      try { dialog.current.close(); } catch { dialog.current.removeAttribute('open'); }
    }
  }, [isOpen, initialCode]);
  const close = () => { if (!inFlight.current) onClose(); };
  const submit = async event => {
    event.preventDefault();
    if (inFlight.current || result) return;
    if (!userId || !localStorage.getItem('token')) { setError('Đăng nhập để nạp thẻ quà tặng.'); return; }
    if (!validGiftCode(code)) { setError('Mã thẻ phải gồm 12–16 ký tự chữ hoặc số'); return; }
    inFlight.current = true; setBusy(true); setError('');
    try {
      const response = await apiClient.post(`/gift-cards/${preview ? 'redeem' : 'validate'}`, { code, customer_id: userId });
      if (!preview) setPreview(response.data.data);
      else {
        const data = response.data;
        setResult(data);
        queryClient.setQueryData(['userWallet', userId], previous => previous ? {
          ...previous, wallet: { ...previous.wallet, balance: data.wallet_balance },
        } : previous);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['userWallet', userId] }),
          queryClient.invalidateQueries({ queryKey: ['customerWallet'] }),
          queryClient.invalidateQueries({ queryKey: ['myGiftCards', userId] }),
        ]);
        onSuccess?.(data);
      }
    } catch (cause) { setPreview(null); setError(giftCardError(cause)); }
    finally { inFlight.current = false; setBusy(false); }
  };
  const money = value => new Intl.NumberFormat(uiLocale(), { style: 'currency', currency: 'VND' }).format(value);
  return <dialog ref={dialog} onCancel={event => { event.preventDefault(); close(); }}
    className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-stone-200 bg-white p-6 text-stone-800 shadow-xl backdrop:bg-black/45"
    aria-labelledby="gift-redeem-title">
    <div className="mb-6 flex items-center gap-3">
      <GiftIcon className="h-6 w-6 text-[#b22830]" />
      <h2 id="gift-redeem-title" className="flex-1 text-xl font-medium">{ui('Nạp tiền bằng thẻ quà tặng')}</h2>
      <button type="button" onClick={close} disabled={busy} aria-label={ui('Đóng')}><XMarkIcon className="h-5 w-5" /></button>
    </div>
    {result ? <div role="status" className="space-y-4">
      <p>{ui('Đã nạp thẻ quà tặng vào ví')}</p>
      <p className="text-2xl font-medium text-[#b22830]">+{money(result.balance_added)}</p>
      <p>{ui('Số dư khả dụng')}: {money(result.wallet_balance)}</p>
      <button onClick={close} className="w-full rounded-xl bg-[#b22830] py-3 text-white">{ui('Hoàn tất')}</button>
    </div> : <form onSubmit={submit} className="space-y-4">
      <label htmlFor="gift-redeem-code" className="block text-sm">{ui('Mã thẻ quà tặng')}</label>
      <input id="gift-redeem-code" value={code} autoFocus disabled={busy} autoComplete="off" spellCheck={false}
        placeholder="XXXX-XXXX-XXXX" maxLength={19}
        className="w-full rounded-xl border border-stone-300 px-4 py-3 font-mono tracking-wider focus:border-[#b22830]"
        onChange={event => { setCode(formatGiftCode(event.target.value)); setPreview(null); setError(''); }} />
      {preview && <dl className="space-y-3 rounded-xl border border-stone-200 bg-stone-50 p-4">
        <div className="flex justify-between gap-4"><dt>{ui('Mệnh giá ban đầu')}</dt><dd>{money(preview.value)}</dd></div>
        <div className="flex justify-between gap-4"><dt>{ui('Số tiền nạp vào ví')}</dt><dd className="font-semibold">{money(preview.current_balance)}</dd></div>
        <div className="flex justify-between gap-4"><dt>{ui('Hạn sử dụng')}</dt><dd>{preview.expires_at ? new Date(preview.expires_at).toLocaleDateString(uiLocale()) : ui('Không giới hạn')}</dd></div>
      </dl>}
      {error && <p role="alert" className="text-sm text-red-700">{ui(error)}</p>}
      <button type="submit" disabled={busy || !validGiftCode(code)} className="w-full rounded-xl bg-[#b22830] py-3 font-medium text-white disabled:opacity-50">
        {busy ? ui('Đang xử lý...') : preview ? ui('Xác nhận nạp vào ví') : ui('Kiểm tra thẻ')}
      </button>
    </form>}
  </dialog>;
}
