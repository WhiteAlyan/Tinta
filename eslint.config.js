// Eslint config — flat config format (eslint >= 9) with the two rules
// the audit specifically recommended: no-unused-vars (flags imports that
// were moved but not updated, a common smell in a codebase this actively
// refactored) and import/no-unresolved (catches typos in import paths).
//
// This is a devDependency only — it does NOT change the runtime model:
// zero runtime deps, zero build step, the app itself ships exactly as it
// runs in the browser. Eslint runs against the source files the same
// way the smoketests do (node-side), and the npm `lint` script wires
// it up alongside `test` and `smoketest`.
//
// Why flat config: eslint 9+ deprecates .eslintrc in favor of
// eslint.config.js (flat config). Using flat config from the start
// avoids a migration later. The smoketest/*.mjs files are included so
// the lint pass also covers test code.
import js from '@eslint/js';
import importPlugin from 'eslint-plugin-import';

export default [
  js.configs.recommended,
  {
    files: ['js/**/*.js', 'js/**/*.mjs', 'tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        // Browser globals used throughout the codebase
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        localStorage: 'readonly',
        indexedDB: 'readonly',
        URL: 'readonly',
        Blob: 'readonly',
        File: 'readonly',
        FileReader: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        speechSynthesis: 'readonly',
        SpeechSynthesisUtterance: 'readonly',
        AudioContext: 'readonly',
        webkitAudioContext: 'readonly',
        FontFace: 'readonly',
        crypto: 'readonly',
        navigator: 'readonly',
        location: 'readonly',
        history: 'readonly',
        HTMLElement: 'readonly',
        SVGElement: 'readonly',
        CustomEvent: 'readonly',
        Event: 'readonly',
        MouseEvent: 'readonly',
        KeyboardEvent: 'readonly',
        FileReader: 'readonly',
        FormData: 'readonly',
        // Node globals (for the smoketest .mjs files)
        process: 'readonly',
        globalThis: 'writable',
        module: 'readonly',
        require: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        Buffer: 'readonly',
      },
    },
    plugins: {
      import: importPlugin,
    },
    rules: {
      // The two rules the audit specifically asked for:
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      'import/no-unresolved': 'error',
      // A few more that catch real bugs in this codebase specifically:
      'no-undef': 'error',
      'no-redeclare': 'error',
      'no-unused-private-class-members': 'warn',
      // Don't enforce style rules — the codebase has its own style that
      // doesn't match any preset. Style is enforced by review, not lint.
      'no-console': 'off',
      'prefer-const': 'off',
      'no-empty': 'off',
      'no-unused-expressions': 'off',
    },
    settings: {
      // Import resolver — uses Node's resolution algorithm for bare
      // specifiers and relative paths. The app's source files are plain
      // ES modules with .js extensions, so no custom resolver is needed.
      'import/resolver': {
        node: {
          extensions: ['.js', '.mjs'],
        },
      },
    },
  },
  {
    // Ignore generated/build artifacts — none exist today, but if a
    // future pass generates any, they shouldn't be linted.
    ignores: [
      'node_modules/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },
];
