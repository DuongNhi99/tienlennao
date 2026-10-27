// Root-level files only (scripts, configs). Each workspace package has its own config.
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig } from 'eslint/config';
import globals from 'globals';

export default defineConfig(
  { ignores: ['apps/**', 'packages/**', '**/node_modules/**', '.local/**'] },
  js.configs.recommended,
  { languageOptions: { globals: { ...globals.node } } },
  prettier,
);
