// Avengers Coffee · Delivery partner design tokens
export const colors = {
  // Brand
  primary: '#b22830',        // Avengers brand crimson red
  primaryDark: '#8f1c24',    // Darker red
  primaryLight: '#d9434e',   // Lighter red
  primaryBg: '#fff1f2',      // Soft red tint background
  secondary: '#1A1A2E',      // Deep navy
  accent: '#FF8C00',         // Orange accent (earnings/COD)
  accentBg: '#FFF4E0',       // Orange tint

  // Gradient pairs
  gradientRed: ['#b22830', '#8f1c24'],
  gradientDark: ['#1A1A2E', '#16213E'],
  gradientOrange: ['#FF8C00', '#b22830'],

  // Status colors
  success: '#16a34a',        // Green (delivered/online)
  successBg: '#f0fdf4',
  warning: '#ea580c',        // Orange (pending/COD)
  warningBg: '#fffbeb',
  danger: '#b22830',         // Red (failed/urgent)
  dangerBg: '#fff1f2',
  info: '#2563eb',           // Blue (info)
  infoBg: '#eff6ff',
  offline: '#94a3b8',
  online: '#16a34a',

  // Backgrounds
  bg: '#f8fafc',             // Soft light backdrop
  surface: '#FFFFFF',
  card: '#FFFFFF',
  darkBg: '#1A1A2E',
  headerBg: '#B42332',       // Red header
  background: {
    default: '#FFFFFF',
    paper: '#FFFFFF',
    surface: '#FFFFFF',
  },

  // Text
  text: '#202B3C',
  coffee: '#202B3C',
  textSecondary: '#4B5563',
  muted: '#758091',
  lightText: '#FFFFFF',
  redText: '#B42332',

  // Borders
  border: '#E5E7EB',
  borderLight: '#F3F4F6',
  divider: '#D1D5DB',
  placeholder: '#758091',

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
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  primary: {
    shadowColor: '#B42332',
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
  round: 9999,
}

export const typography = {
  h1: { fontSize: 28, fontWeight: '700', lineHeight: 38 },
  h2: { fontSize: 24, fontWeight: '700', lineHeight: 34 },
  h3: { fontSize: 20, fontWeight: '700', lineHeight: 30 },
  h4: { fontSize: 18, fontWeight: '700', lineHeight: 26 },
  body: { fontSize: 15, fontWeight: '500', lineHeight: 22 },
  bodyBold: { fontSize: 15, fontWeight: '700', lineHeight: 22 },
  label: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  caption: { fontSize: 11, fontWeight: '500', lineHeight: 15 },
}
