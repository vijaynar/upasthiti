// i18n catalogues (PRD §12 — no hardcoded UI copy; v1 ships en/hi/te).
// Each module registers its own strings as it's built; this is just the
// lookup mechanism, not the content.

export type SupportedLanguage = 'en' | 'hi' | 'te';
export const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = ['en', 'hi', 'te'];
export const DEFAULT_LANGUAGE: SupportedLanguage = 'en';

type Catalogue = Record<string, string>;

const catalogues: Partial<Record<SupportedLanguage, Catalogue>> = { en: {} };

/** Looks up `key`, falling back to English, then the raw key (never throws — missing copy is visible, not broken). */
export function t(key: string, language: SupportedLanguage = DEFAULT_LANGUAGE): string {
  return catalogues[language]?.[key] ?? catalogues.en?.[key] ?? key;
}

export function registerCatalogue(language: SupportedLanguage, entries: Catalogue): void {
  catalogues[language] = { ...catalogues[language], ...entries };
}
