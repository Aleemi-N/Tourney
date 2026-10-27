import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { hi } from '@/lib/locales/hi';
import { ml } from '@/lib/locales/ml';

// Translation is keyed by the English text itself: text that has no translation simply stays English, so the app is
// never blank, and new screens work before anyone translates them. Plain text inside <Text> is translated automatically
// (see components/text.tsx); use useT() for text that goes into props such as a tab title.

export type Lang = 'en' | 'hi' | 'ml';
export const LANGUAGES: { value: Lang; label: string }[] = [{ value: 'en', label: 'English' }, { value: 'hi', label: 'हिन्दी' }, { value: 'ml', label: 'മലയാളം' }];

const DICTIONARIES: Record<Lang, Record<string, string>> = { en: {}, hi, ml };
const KEY = 'tourny-language';

/** The translation of an English text, or the text itself. */
export function translate(lang: Lang, text: string): string {
  if (lang === 'en') return text;
  const dictionary = DICTIONARIES[lang];
  return dictionary[text] ?? dictionary[text.trim()] ?? text;
}

type Ctx = { lang: Lang; setLang: (l: Lang) => void };
const LanguageContext = createContext<Ctx>({ lang: 'en', setLang: () => {} });

/** The chosen language, remembered on the phone. */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');
  useEffect(() => {
    AsyncStorage.getItem(KEY).then((saved) => { if (saved === 'hi' || saved === 'ml') setLangState(saved); }).catch(() => {});
  }, []);
  const value = useMemo<Ctx>(() => ({ lang, setLang: (l) => { setLangState(l); AsyncStorage.setItem(KEY, l).catch(() => {}); } }), [lang]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export const useLanguage = () => useContext(LanguageContext);

/** A translate function for the current language. */
export function useT() {
  const { lang } = useContext(LanguageContext);
  return (text: string) => translate(lang, text);
}
