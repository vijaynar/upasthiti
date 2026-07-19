// Doc 13 §16 / Doc 14 §7 boundary rules, lint-enforced.
//
// Scope note: this config only lints the new V2 tree (packages/platform,
// packages/kernel, packages/modules, packages/db-types, apps/worker). The
// legacy V1 app (apps/web, apps/mobile, packages/common, packages/database)
// predates ESLint in this repo and is globally ignored here — it keeps
// running unmodified until each surface is rebuilt phase-by-phase and
// finally cut over (roadmap Phase 17), at which point this exemption is
// removed and the whole repo is linted and enforced together.
import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

const V2_TREE = [
  'packages/platform/**/*.{ts,tsx}',
  'packages/kernel/**/*.{ts,tsx}',
  'packages/modules/**/*.{ts,tsx}',
  'packages/db-types/**/*.{ts,tsx}',
  'apps/worker/**/*.{ts,tsx}',
];

const PROVIDER_SDK_GROUPS = ['@supabase/*', 'pg', 'razorpay', 'twilio', '@aws-sdk/*'];

export default [
  {
    // Global ignore — everything not explicitly in V2_TREE is out of scope
    // for now (see scope note above), plus the usual build artifacts.
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.turbo/**',
      'apps/web/**',
      'apps/mobile/**',
      'packages/common/**',
      'packages/database/**',
      'supabase/**',
    ],
  },
  {
    files: V2_TREE,
    rules: js.configs.recommended.rules,
    languageOptions: {
      parser: tsParser,
      parserOptions: { sourceType: 'module' },
    },
    plugins: { '@typescript-eslint': tsPlugin },
  },
  {
    // TypeScript-aware replacements for base rules that misread TS-only
    // syntax (interface/function-type signatures aren't "unused params";
    // tsc itself already catches genuinely undefined identifiers).
    files: V2_TREE,
    rules: {
      'no-unused-vars': 'off',
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // Doc 14 §7 — only packages/platform/* may import provider SDKs.
    files: V2_TREE,
    ignores: ['packages/platform/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: PROVIDER_SDK_GROUPS.map((group) => ({
            group: [group],
            message: 'Provider SDKs may only be imported inside packages/platform/* (Doc 14 §7). Use the adapter interface instead.',
          })),
        },
      ],
    },
  },
  {
    // Doc 14 §2 rule 2 — modules own their tables; no reaching into another module's internals.
    files: ['packages/modules/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/modules/*/src/**', '../*/src/*', '../../modules/*/src/*'],
              message: "Import another module's public service (its package entrypoint), never its internal src files (Doc 14 §2 rule 2).",
            },
          ],
        },
      ],
    },
  },
  {
    // Doc 13 §9 A03 / Doc 17 rule — no raw SQL string interpolation. Only
    // flags template literals that actually contain `${...}` expressions —
    // a plain multi-line backtick string with zero interpolations (our
    // parameterized $1/$2 queries) is exactly what we want and stays clean.
    files: V2_TREE,
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name='query'] > TemplateLiteral[expressions.length > 0]",
          message: 'Use parameterized queries ($1, $2, ...) — never interpolate values into a SQL template literal (Doc 13 §9 A03).',
        },
      ],
    },
  },
];
