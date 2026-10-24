import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'

// Keep the full lint suite intact; this fast gate catches undefined identifiers
// that Vite can bundle successfully but that crash a workspace at render time.
export default [{
  files: ['src/**/*.{js,jsx}'],
  linterOptions: { reportUnusedDisableDirectives: false },
  plugins: { 'react-hooks': reactHooks, workspace: { rules: { 'jsx-no-undef': { meta: { type: 'problem', schema: [] }, create(context) { return { JSXOpeningElement(node) {
    let tag = node.name;
    while (tag.type === 'JSXMemberExpression') tag = tag.object;
    if (tag.type !== 'JSXIdentifier' || !/^[A-Z]/.test(tag.name)) return;
    let scope = context.sourceCode.getScope(node);
    while (scope) { if (scope.set.has(tag.name)) return; scope = scope.upper; }
    context.report({ node: tag, message: `Component ${tag.name} is not imported or defined.` });
  } }; } } } } },
  languageOptions: {
    globals: globals.browser,
    parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
  },
  rules: { 'no-undef': 'error', 'workspace/jsx-no-undef': 'error' },
}]
