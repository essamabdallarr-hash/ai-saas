import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import ar from './ar';
import en from './en';

type Translations = typeof ar;
export type Lang = 'ar' | 'en';

interface I18nContextValue {
  lang: Lang;
  t: Translations;
  setLang: (lang: Lang) => void;
  toggleLang: () => void;
  dir: 'rtl' | 'ltr';
}

const STORAGE_KEY = 'app_lang';

const I18nContext = createContext<I18nContextValue>(null!);

const translations: Record<Lang, Translations> = { ar, en };

function getInitialLang(): Lang {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'ar' || saved === 'en') return saved;
  return 'ar';
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(getInitialLang);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    localStorage.setItem(STORAGE_KEY, l);
    document.documentElement.lang = l;
    document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr';
  }, []);

  const toggleLang = useCallback(() => {
    setLang(lang === 'ar' ? 'en' : 'ar');
  }, [lang, setLang]);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  const value = useMemo<I18nContextValue>(
    () => ({ lang, t: translations[lang], setLang, toggleLang, dir: lang === 'ar' ? 'rtl' : 'ltr' }),
    [lang, setLang, toggleLang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
