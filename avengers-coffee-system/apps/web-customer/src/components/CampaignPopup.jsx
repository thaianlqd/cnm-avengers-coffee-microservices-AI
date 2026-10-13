import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
const KEY = 'avengers:campaign:phin:v1';
const COOLDOWN = 24 * 60 * 60 * 1000;

export default function CampaignPopup({ activeTab, onOrder }) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const dialog = useRef(null);
  const shown = useRef(false);
  useEffect(() => {
    if (!['home', 'order', 'menu-intro'].includes(activeTab) || shown.current) return;
    try { if (Date.now() - Number(localStorage.getItem(KEY) || 0) < COOLDOWN) return; } catch { /* Session-only fallback. */ }
    const timer = setTimeout(() => {
      // Do not interrupt another dialog, checkout or a conversation.
      if (document.visibilityState !== 'visible' || document.querySelector('dialog[open], [role="dialog"], .chat-scroll')) return;
      shown.current = true;
      try { localStorage.setItem(KEY, String(Date.now())); } catch { /* Session-only fallback. */ }
      setVisible(true);
    }, 8000);
    return () => clearTimeout(timer);
  }, [activeTab]);
  useEffect(() => {
    if (visible) dialog.current?.showModal();
  }, [visible]);
  if (!visible) return null;
  return <dialog ref={dialog} className="campaign-dialog" aria-label={t('campaign.title')}
    onCancel={() => setVisible(false)} onClose={() => setVisible(false)}
    onClick={e => { if (e.target === e.currentTarget) setVisible(false); }}>
    <button type="button" className="campaign-close" aria-label={t('campaign.close')} onClick={() => setVisible(false)}>×</button>
    <img src="/hc-assets/banner_popup_img.png" alt={t('campaign.image')} decoding="async" onError={() => setVisible(false)} />
    <button type="button" className="campaign-action" onClick={() => { setVisible(false); onOrder(); }}>{t('campaign.action')} →</button>
  </dialog>;
}
