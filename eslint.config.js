'use strict';

const js = require('@eslint/js');
const tseslint = require('@typescript-eslint/eslint-plugin');
const parser = require('@typescript-eslint/parser');
const prettierConfig = require('eslint-config-prettier'); // Renamed to avoid conflict if 'prettier' was a plugin
const eslintPluginPrettier = require('eslint-plugin-prettier');

module.exports = [
  js.configs.recommended,
  {
    ignores: [
      "tests/",
      "dist/",
      "node_modules/",
      "eslint.config.js",
      "package-lock.json",
      "package.json",
      ".prettierrc.js",
      "jest.config.js"
    ]
  },
  {
    languageOptions: {
      globals: {
        node: true,
        jest: true,
        es2020: true,
      }
    },
  },
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: parser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      prettier: eslintPluginPrettier,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      'prettier/prettier': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  prettierConfig,
];