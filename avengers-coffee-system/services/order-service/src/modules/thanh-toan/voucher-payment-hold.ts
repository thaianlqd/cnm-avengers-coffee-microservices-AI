/** Finite hold for an unpaid VNPAY/QR voucher claim. */
export function voucherPaymentHoldTtlMinutes(): number {
  const configured = Number(process.env.VOUCHER_PAYMENT_HOLD_TTL_MINUTES || 30);
  return Number.isFinite(configured)
    ? Math.max(1, Math.min(1440, Math.floor(configured)))
    : 30;
}
