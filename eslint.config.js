import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/dist-firefox/**',
      '**/node_modules/**',
      '**/.turbo/**',
      'packages/engine/**',
      'packages/viz/fixtures/**',
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended, prettier],
    files: ['**/*.{ts,tsx,js,mjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node, ...globals.webextensions },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
  {
    // SPEC §12: no `any` in the contract, the viz, or stores.
    files: ['packages/schema/**/*.ts', 'packages/viz/**/*.{ts,tsx}', '**/store/**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'error' },
  },
);
