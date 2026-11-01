import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    // Explicit root: in a monorepo the VS Code ESLint extension loads several packages'
    // configs in one process, and typescript-eslint cannot infer which root applies.
    languageOptions: { parserOptions: { tsconfigRootDir: import.meta.dirname } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
  globalIgnores(['.next/**', '.next-*/**', 'out/**', 'build/**', 'coverage/**', 'next-env.d.ts']),
]);
