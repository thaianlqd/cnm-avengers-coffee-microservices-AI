import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import QRCode from 'qrcode';
import { ArrowDownTrayIcon, QrCodeIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { tierPalette } from '../../lib/membershipPresentation';
import { uiLocale } from '../../lib/uiText';

export default function MembershipCard({ user, tier, points = 0, tierName: customTierName }) {
  const { t } = useTranslation();
  const dialog = useRef(null);
  const [qr, setQr] = useState('');
  const [error, setError] = useState('');
  const memberId = String(user?.ma_nguoi_dung || user?.maNguoiDung || '');
  const name = user?.ho_ten || user?.hoTen || user?.username || '';
  const palette = tierPalette(tier);
  const tierName = customTierName || t(`membership.${palette.label}`) || tier;
  useEffect(() => {
    let active = true;
    setQr('');
    if (memberId) QRCode.toDataURL(`avengers-coffee:member:${memberId}`, {
      width: 360, margin: 4, errorCorrectionLevel: 'M',
    }).then(value => { if (active) setQr(value); }).catch(() => { if (active) setError('qr'); });
    return () => { active = false; };
  }, [memberId]);

  const download = async () => {
    setError('');
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1200;
      canvas.height = 720;
      const context = canvas.getContext('2d');
      context.fillStyle = palette.background;
      context.fillRect(0, 0, 1200, 720);
      context.strokeStyle = palette.accent;
      context.lineWidth = 2;
      context.strokeRect(32, 32, 1136, 656);
      context.fillStyle = palette.accent;
      context.font = '32px sans-serif';
      context.fillText('Avengers Coffee', 70, 100);
      context.font = '54px sans-serif';
      context.fillText(tierName, 70, 205);
      context.fillStyle = '#ffffff';
      context.font = '30px sans-serif';
      context.fillText(name, 70, 430, 760);
      context.font = '22px monospace';
      context.fillText(memberId, 70, 495, 760);
      context.font = '26px sans-serif';
      context.fillText(`${t('membership.points')}: ${Number(points).toLocaleString(uiLocale())}`, 70, 620);
      if (qr) {
        const image = new Image();
        image.src = qr;
        await image.decode();
        context.drawImage(image, 900, 425, 220, 220);
      }
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('No image');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'avengers-coffee-membership.png';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setError('download'); }
  };
  return (
    <div>
      <section aria-label={t('membership.card')} style={{ backgroundColor: palette.background, borderColor: palette.accent }}
        className="rounded-2xl border p-7 text-white sm:p-9">
        <div className="flex items-start justify-between gap-6">
          <img
            src="/images/brand/logo.svg"
            alt="Avengers Coffee"
            className="h-12 w-auto object-contain bg-white rounded-xl p-1.5 shadow-sm"
          />
          <span className="text-xl font-light tracking-wide" style={{ color: palette.accent }}>{tierName}</span>
        </div>
        <div className="my-9">
          <p className="mb-2 text-xs text-white/60">{t('membership.memberId')}</p>
          <p className="break-all font-mono text-sm tracking-widest">{memberId}</p>
        </div>
        <div className="flex items-end justify-between gap-4 border-t border-white/20 pt-5">
          <div><p className="text-xs text-white/60">{t('membership.owner')}</p><p className="mt-1 text-lg font-light">{name}</p></div>
          <div className="text-right"><p className="text-xs text-white/60">{t('membership.points')}</p><p className="mt-1 text-2xl font-light" style={{ color: palette.accent }}>{Number(points).toLocaleString(uiLocale())}</p></div>
        </div>
      </section>
      <div className="mt-3 flex flex-wrap justify-end gap-5 text-sm text-stone-600">
        <button type="button" onClick={() => dialog.current?.showModal()} disabled={!qr} className="inline-flex items-center gap-2 disabled:opacity-40"><QrCodeIcon className="h-4 w-4" />{t('membership.qr')}</button>
        <button type="button" onClick={download} disabled={!qr} className="inline-flex items-center gap-2 disabled:opacity-40"><ArrowDownTrayIcon className="h-4 w-4" />{t('membership.download')}</button>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{t('membership.downloadFailed')}</p>}
      <dialog ref={dialog} aria-label={t('membership.qr')} className="fixed inset-0 m-auto w-[min(92vw,400px)] rounded-2xl bg-white p-6 backdrop:bg-black/50">
        <div className="flex justify-between gap-3"><h3 className="font-medium">{t('membership.memberId')}</h3><button type="button" aria-label={t('common.close')} onClick={() => dialog.current?.close()}><XMarkIcon className="h-5 w-5" /></button></div>
        {qr && <img src={qr} alt={t('membership.qr')} className="mx-auto h-64 w-64 max-w-full" />}
        <p className="break-all text-center font-mono text-xs">{memberId}</p>
        <p className="mt-4 text-center text-sm text-stone-500">{t('membership.qrHint')}</p>
      </dialog>
    </div>
  );
}
