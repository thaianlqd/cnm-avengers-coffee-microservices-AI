// Shipper Mobile Theme - ViettelPost Style (Red Professional Logistics)
export const colors = {
  // Brand - ViettelPost Red
  primary: '#E31A23',        // ViettelPost signature red
  primaryDark: '#B5141C',    // Darker red
  primaryLight: '#FF4D55',   // Lighter red
  primaryBg: '#FFF0F1',      // Red tint background
  secondary: '#1A1A2E',      // Deep navy
  accent: '#FF8C00',         // Orange accent (earnings/COD)
  accentBg: '#FFF4E0',       // Orange tint

  // Gradient pairs
  gradientRed: ['#E31A23', '#B5141C'],
  gradientDark: ['#1A1A2E', '#16213E'],
  gradientOrange: ['#FF8C00', '#E31A23'],

  // Status colors
  success: '#00A86B',        // Green (delivered/online)
  successBg: '#E6F7F2',
  warning: '#FF8C00',        // Orange (pending/COD)
  warningBg: '#FFF4E0',
  danger: '#E31A23',         // Red (failed/urgent)
  dangerBg: '#FFF0F1',
  info: '#0066CC',           // Blue (info)
  infoBg: '#E6F0FF',
  offline: '#9CA3AF',
  online: '#00A86B',

  // Backgrounds
  bg: '#F5F5F7',             // Light grey (iOS-like)
  surface: '#FFFFFF',
  card: '#FFFFFF',
  darkBg: '#1A1A2E',
  headerBg: '#E31A23',       // Red header

  // Text
  text: '#1A1A2E',
  textSecondary: '#4B5563',
  muted: '#9CA3AF',
  lightText: '#FFFFFF',
  redText: '#E31A23',

  // Borders
  border: '#E5E7EB',
  borderLight: '#F3F4F6',
  divider: '#D1D5DB',
  placeholder: '#9CA3AF',

  // Overlay
  overlay: 'rgba(26, 26, 46, 0.65)',
  overlayLight: 'rgba(26, 26, 46, 0.3)',
  redOverlay: 'rgba(227, 26, 35, 0.12)',
}

export const shadows = {
  xs: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  primary: {
    shadowColor: '#E31A23',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  success: {
    shadowColor: '#00A86B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
}

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  xxl: 28,
  full: 9999,
}

export const typography = {
  h1: { fontSize: 30, fontWeight: '900', lineHeight: 38 },
  h2: { fontSize: 26, fontWeight: '800', lineHeight: 34 },
  h3: { fontSize: 22, fontWeight: '700', lineHeight: 30 },
  h4: { fontSize: 18, fontWeight: '800', lineHeight: 26 },
  body: { fontSize: 15, fontWeight: '500', lineHeight: 22 },
  bodyBold: { fontSize: 15, fontWeight: '700', lineHeight: 22 },
  label: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  caption: { fontSize: 11, fontWeight: '500', lineHeight: 15 },
}
