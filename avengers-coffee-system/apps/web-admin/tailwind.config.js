import plugin from 'tailwindcss/plugin.js'

// Shared web-admin design vocabulary. Components consume these values through
// theme() in CSS or Tailwind utilities. Actor-specific styles remain scoped.
const admin = {
  canvas: '#ffffff', surface: '#ffffff', subtle: '#f8fafc',
  ink: '#09090b', body: '#1e293b', muted: '#64748b', border: '#e2e8f0',
  primary: '#2563eb', hover: '#1d4ed8', focus: '#3b82f6',
  danger: '#ef4444', dangerSoft: '#fef2f2', success: '#10b981', warning: '#f59e0b',
  mint: '#059669', mintSoft: '#ecfdf5', violet: '#6366f1', violetSoft: '#eef2ff', amber: '#d97706', amberSoft: '#fffbeb',
  chart: '#2563eb', chartSoft: '#eff6ff',
  sidebar: '#0b0f19', sidebarHover: '#172033', sidebarActive: '#2563eb',
  sidebarText: '#94a3b8', sidebarMuted: '#64748b',
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
