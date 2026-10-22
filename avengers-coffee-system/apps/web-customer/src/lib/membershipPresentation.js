export const TIER_PALETTE = {
  MEMBER: { background: '#3E2723', accent: '#D7AA80', label: 'bronze' },
  BRONZE: { background: '#3E2723', accent: '#D7AA80', label: 'bronze' },
  SILVER: { background: '#2B2D42', accent: '#C0C0C0', label: 'silver' },
  GOLD: { background: '#1A1A1A', accent: '#D4AF37', label: 'gold' },
  DIAMOND: { background: '#0B0C10', accent: '#A4E5E0', label: 'diamond' },
  PLATINUM: { background: '#0f172a', accent: '#38bdf8', label: 'platinum' },
};

export function tierPalette(code) {
  if (code && TIER_PALETTE[String(code).toUpperCase()]) {
    return TIER_PALETTE[String(code).toUpperCase()];
  }
  return TIER_PALETTE.MEMBER;
}

export function membershipProgress(tiers, points) {
  const sorted = [...(Array.isArray(tiers) ? tiers : [])]
    .filter(tier => Number.isFinite(Number(tier.diem)))
    .sort((a, b) => Number(a.diem) - Number(b.diem));
  const earned = Math.max(0, Number(points) || 0);
  const next = sorted.find(tier => Number(tier.diem) > earned);
  const previous = sorted.filter(tier => Number(tier.diem) <= earned).at(-1);
  const floor = Number(previous?.diem) || 0;
  return {
    tiers: sorted, next,
    remaining: next ? Number(next.diem) - earned : 0,
    percent: next ? Math.max(0, Math.min(100, ((earned - floor) / (Number(next.diem) - floor)) * 100)) : 100,
  };
}
