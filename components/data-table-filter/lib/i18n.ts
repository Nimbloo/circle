import en from '../locales/en.json'
import ptBR from '../locales/pt-BR.json'

export type Locale = 'en' | 'pt-BR'

type Translations = Record<string, string>

const translations: Record<Locale, Translations> = {
  en,
  'pt-BR': ptBR,
}

export function t(key: string, locale: Locale): string {
  return translations[locale][key] ?? key
}
