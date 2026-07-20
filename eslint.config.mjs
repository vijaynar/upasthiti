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

// apps/web paths rebuilt so far (Phase 2-5). Extend this list as more of
// apps/web is rebuilt phase-by-phase; everything else there stays ignored
// until it's touched.
const V2_WEB_PATHS = [
  'apps/web/src/app/api/v1/auth/**/*.{ts,tsx}',
  'apps/web/src/app/api/v1/me/**/*.{ts,tsx}',
  'apps/web/src/app/api/v1/orgs/**/*.{ts,tsx}',
  'apps/web/src/app/api/v1/invitations/**/*.{ts,tsx}',
  'apps/web/src/app/api/v1/platform/**/*.{ts,tsx}',
  'apps/web/src/app/api/v1/public/**/*.{ts,tsx}',
  'apps/web/src/app/auth/login/**/*.{ts,tsx}',
  'apps/web/src/app/onboarding/**/*.{ts,tsx}',
  'apps/web/src/app/workspace/**/*.{ts,tsx}',
  'apps/web/src/app/platform/**/*.{ts,tsx}',
  'apps/web/src/app/people/**/*.{ts,tsx}',
  'apps/web/src/app/family/**/*.{ts,tsx}',
  'apps/web/src/app/scheduling/**/*.{ts,tsx}',
  'apps/web/src/app/attendance/**/*.{ts,tsx}',
  'apps/web/src/app/finance/**/*.{ts,tsx}',
  'apps/web/src/app/notifications/**/*.{ts,tsx}',
  'apps/web/src/app/me/**/*.{ts,tsx}',
  'apps/web/src/app/marketplace/**/*.{ts,tsx}',
  'apps/web/src/app/explore/**/*.{ts,tsx}',
  'apps/web/src/lib/v2-session.ts',
];

const V2_TREE = [
  'packages/platform/**/*.{ts,tsx}',
  'packages/kernel/**/*.{ts,tsx}',
  'packages/modules/**/*.{ts,tsx}',
  'packages/db-types/**/*.{ts,tsx}',
  'apps/worker/**/*.{ts,tsx}',
  ...V2_WEB_PATHS,
];

const PROVIDER_SDK_GROUPS = ['@supabase/*', 'pg', 'razorpay', 'twilio', '@aws-sdk/*'];

export default [
  {
    // Global ignore — build artifacts, plus legacy packages/apps that have
    // no V2_TREE entries at all (so nothing under them is ever matched by a
    // `files:` glob anyway — see scope note above). apps/web is deliberately
    // NOT globally ignored here: gitignore-style negation can't reliably
    // re-include nested paths once a parent glob like `apps/web/**` excludes
    // them (verified empirically), so instead its legacy (not-yet-rebuilt)
    // files are simply never matched by any `files:` pattern below — same
    // effect (unlinted), without fighting ignore-pattern semantics.
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.turbo/**',
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
