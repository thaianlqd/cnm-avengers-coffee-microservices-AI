import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'

// Keep the full lint suite intact; this fast gate catches undefined identifiers
// that Vite can bundle successfully but that crash a workspace at render time.
export default [{
  files: ['src/**/*.{js,jsx}'],
  linterOptions: { reportUnusedDisableDirectives: false },
  plugins: { 'react-hooks': reactHooks },
  languageOptions: {
    globals: globals.browser,
    parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
  },
  rules: { 'no-undef': 'error' },
}]
