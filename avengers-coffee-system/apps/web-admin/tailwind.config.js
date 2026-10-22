import plugin from 'tailwindcss/plugin.js'

// Shared web-admin design vocabulary. Components consume these values through
// theme() in CSS or Tailwind utilities. Actor-specific styles remain scoped.
const admin = {
  canvas: '#ffffff', surface: '#ffffff', subtle: '#f4f4f5',
  ink: '#09090b', body: '#27272a', muted: '#71717a', border: '#e4e4e7',
  primary: '#18181b', hover: '#27272a', focus: '#71717a',
  danger: '#b42318', dangerSoft: '#fff1f0', success: '#15803d', warning: '#a16207',
  mint: '#0f8a70', mintSoft: '#e5f7ef', violet: '#7c4dcc', violetSoft: '#f2ecff', amber: '#b96b0b', amberSoft: '#fff4df',
  chart: '#4f86c6', chartSoft: '#dce9f7',
  sidebar: '#09090b', sidebarHover: '#18181b', sidebarActive: '#27272a',
  sidebarText: '#a1a1aa', sidebarMuted: '#71717a',
}
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        admin,
        primary: { DEFAULT: '#2563eb', hover: '#1d4ed8', light: '#eef4ff', subtle: '#e9ecef' },
        secondary: '#6b7280', success: admin.success, warning: admin.warning,
        danger: admin.danger, surface: '#f5f8ff',
      },
      fontFamily: { sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'] },
      fontSize: {
        'admin-caption': ['12px', { lineHeight: '1.5' }],
        'admin-body': ['14px', { lineHeight: '1.6' }],
        'admin-title': ['24px', { lineHeight: '1.3', fontWeight: '600', letterSpacing: '-0.035em' }],
      },
      borderRadius: { control: '8px', card: '16px', dialog: '16px' },
      spacing: { control: '40px', icon: '18px' },
      boxShadow: { 'admin-focus': '0 0 0 3px rgb(100 116 139 / 15%)', 'admin-dialog': '0 24px 80px rgb(0 0 0 / 18%)' },
    },
  },
  plugins: [plugin(({ addComponents, theme }) => {
    const button = {
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
      minHeight: theme('spacing.control'), padding: '9px 16px',
      fontFamily: theme('fontFamily.sans'), fontSize: theme('fontSize.admin-body')[0], fontWeight: '500',
      borderRadius: theme('borderRadius.control'), border: '1px solid transparent', cursor: 'pointer',
      '&:focus-visible': { outline: `2px solid ${admin.focus}`, outlineOffset: '3px' },
      '&:disabled': { opacity: '.45', cursor: 'not-allowed' },
    }
    addComponents({
      '.ui-button': button,
      '.ui-button-primary': { ...button, background: admin.primary, color: '#fff', '&:hover:not(:disabled)': { background: admin.hover } },
      '.ui-button-secondary': { ...button, background: admin.surface, color: admin.ink, borderColor: admin.border, '&:hover:not(:disabled)': { background: admin.subtle } },
      '.ui-button-danger': { ...button, background: admin.dangerSoft, color: admin.danger, '&:hover:not(:disabled)': { background: '#fee4e2' } },
      '.ui-input': {
        width: '100%', minHeight: theme('spacing.control'), padding: '10px 13px',
        fontFamily: theme('fontFamily.sans'), fontSize: '14px', fontWeight: '400',
        color: admin.ink, background: admin.surface, border: `1px solid ${admin.border}`, borderRadius: theme('borderRadius.control'),
        '&::placeholder': { color: admin.muted },
        '&:focus': { outline: 'none', borderColor: admin.focus, boxShadow: theme('boxShadow.admin-focus') },
      },
      '.ui-icon': { width: theme('spacing.icon'), height: theme('spacing.icon'), flexShrink: '0', color: 'currentColor' },
    })
  })],
}
