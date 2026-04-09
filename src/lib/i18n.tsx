"use client"

import {createContext, useCallback, useContext, type ReactNode, useSyncExternalStore} from "react"
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

// localStorage 기반 external store
const listeners = new Set<() => void>()

function getSnapshot(): Locale {
  if (typeof window === "undefined") return "en"
  const saved = localStorage.getItem(STORAGE_KEY)
  return saved === "ko" ? "ko" : "en"
}

function getServerSnapshot(): Locale {
  return "en"
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function setStoredLocale(l: Locale) {
  localStorage.setItem(STORAGE_KEY, l)
  listeners.forEach((cb) => cb())
}

export function LocaleProvider({children}: {children: ReactNode}) {
  const locale = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const setLocale = useCallback((l: Locale) => {
    setStoredLocale(l)
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
