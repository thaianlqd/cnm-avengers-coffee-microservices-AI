// Customer Mobile Theme - Avengers Coffee
export const colors = {
  // Primary brand
  primary: '#f26b1d',
  primaryDark: '#d4560e',
  primaryLight: '#ff9e64',
  secondary: '#2f2119',
  accent: '#ff9e64',

  // Status
  success: '#22c55e',
  successBg: '#f0fdf4',
  warning: '#f59e0b',
  warningBg: '#fffbeb',
  danger: '#ef4444',
  dangerBg: '#fef2f2',
  info: '#0ea5e9',
  infoBg: '#f0f9ff',

  // Backgrounds
  bg: '#fdf7f2',
  surface: '#fffcf9',
  cream: '#f9f4ef',
  card: '#ffffff',

  // Text
  text: '#18100a',
  textSecondary: '#5f4f48',
  muted: '#a17a62',

  // Borders & Accents
  border: '#ead8c6',
  borderLight: '#f3e8dd',
  divider: '#e2d0c0',
  placeholder: '#c7b8ad',

  // Overlay
  overlay: 'rgba(24, 16, 10, 0.56)',
  overlayLight: 'rgba(24, 16, 10, 0.35)',

  // Special
  gold: '#f59e0b',
  diamond: '#0ea5e9',
}

export const shadows = {
  xs: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
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
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 8,
  },
  primary: {
    shadowColor: '#f26b1d',
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
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  full: 9999,
}

export const typography = {
  h1: {
    fontSize: 32,
    fontWeight: '900',
    lineHeight: 40,
  },
  h2: {
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 36,
  },
  h3: {
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 32,
  },
  h4: {
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 28,
  },
  body: {
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 24,
  },
  bodyBold: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 24,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  caption: {
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
  },
}
