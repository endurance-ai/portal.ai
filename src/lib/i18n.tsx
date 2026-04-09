"use client"

import {createContext, useCallback, useContext, useEffect, useState, type ReactNode} from "react"
import {dict, type DictKey, type Locale} from "./i18n-dict"

interface I18nContextValue {
  locale: Locale
  setLocale: (l: Locale) => void
  t: (key: DictKey) => string
}

const I18nContext = createContext<I18nContextValue>({
  locale: "en",
  setLocale: () => {},
  t: (key) => key,
})

const STORAGE_KEY = "portal-locale"

export function LocaleProvider({children}: {children: ReactNode}) {
  const [locale, setLocaleState] = useState<Locale>("en")

  // 초기 로드: localStorage에서 복원
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Locale | null
    if (saved && (saved === "en" || saved === "ko")) {
      setLocaleState(saved)
    }
  }, [])

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l)
    localStorage.setItem(STORAGE_KEY, l)
  }, [])

  const t = useCallback((key: DictKey): string => {
    return dict[locale][key] ?? dict.en[key] ?? key
  }, [locale])

  return (
    <I18nContext.Provider value={{locale, setLocale, t}}>
      {children}
    </I18nContext.Provider>
  )
}

export function useLocale() {
  return useContext(I18nContext)
}
