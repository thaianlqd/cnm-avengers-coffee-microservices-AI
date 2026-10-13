import { uiText as ui, useUiLanguage, uiLocale } from "../lib/uiText";
import { useState } from 'react';
import { walletAmount, walletAmountError } from './walletTopup';

const money = (value) => `${Number(value).toLocaleString(uiLocale())}đ`;
const buttonStyle = { border: '1px solid #E2E8F0', borderRadius: 8, padding: '7px 9px', background: '#FFF', cursor: 'pointer' };

export default function WalletTopupCard({ offer, payment, busy, ready, onCreate, onContinue }) {
  useUiLanguage();
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  if (!offer && !payment && !ready) return null;
  return <section aria-label={ui("Nạp ví Avengers")} style={{ padding: 12, background: '#FFF', border: '1px solid #FFD5D5', borderRadius: 12 }}>
    <strong style={{ fontSize: '0.86rem' }}>{ui("Ví Avengers")}</strong>
    {payment ? <>
      <p style={{ fontSize: '0.8rem' }}>{ui("Đang chờ nạp ")}{money(payment.amount)}{ui(". Số dư chỉ cập nhật sau khi VNPAY xác nhận.")}</p>
      <a href={payment.url} target="_blank" rel="noopener noreferrer" style={{ ...buttonStyle, display: 'block', textAlign: 'center', color: '#FFF', background: '#B22830', textDecoration: 'none' }}>{ui("Mở VNPAY để nạp tiền")}</a>
      <p style={{ fontSize: '0.72rem', color: '#64748B' }}>{ui("Thanh toán ở tab mới, rồi quay lại đây để tiếp tục.")}</p>
    </> : <>
      {offer && <>
        <p style={{ fontSize: '0.78rem' }}>{ui("Số dư: ")}<b>{money(offer.balance)}</b>{ui(" · Còn thiếu: ")}<b>{money(offer.shortfall)}</b></p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {(offer.suggested_amounts || []).map((value) => <button key={value} type="button" disabled={busy} style={buttonStyle}
            onClick={() => { setAmount(String(value)); setError(''); }}>{money(value)}</button>)}
        </div>
        <form onSubmit={(event) => {
          event.preventDefault();
          const value = walletAmount(amount);
          const message = walletAmountError(value);
          setError(message || '');
          if (!message) onCreate(value);
        }} style={{ display: 'flex', gap: 6, marginTop: 9 }}>
          <input aria-label={ui("Số tiền muốn nạp")} inputMode="decimal" placeholder={ui("Nhập số tiền, ví dụ 100k")} value={amount}
            disabled={busy} onChange={(event) => setAmount(event.target.value)} style={{ minWidth: 0, flex: 1, padding: 8, borderRadius: 8, border: '1px solid #CBD5E1' }} />
          <button type="submit" disabled={busy} style={{ ...buttonStyle, color: '#FFF', background: '#B22830' }}>{busy ? ui("Đang xử lý…") : ui("Nạp qua VNPAY")}</button>
        </form>
        {error && <p role="alert" style={{ fontSize: '0.75rem', color: '#B22830' }}>{ui(error)}</p>}
        <p style={{ fontSize: '0.72rem', color: '#64748B' }}>{ui("Nạp từ 10.000đ đến 5.000.000đ. Bạn cũng có thể nhắn “nạp 200k”.")}</p>
      </>}
      {ready && <button type="button" disabled={busy} onClick={onContinue}
        style={{ ...buttonStyle, width: '100%', marginTop: 6, background: '#B22830', color: '#FFF' }}>{ui("Tiếp tục thanh toán bằng ví")}</button>}
    </>}
  </section>;
}
