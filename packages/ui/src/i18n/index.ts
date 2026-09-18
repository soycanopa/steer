// i18n — locale registry for Steer's UI copy. English is the base locale
// and the type shape: a new language is a file shaped like `en.ts`
// registered in `dictionaries`. Components read `t.<section>.<key>` —
// the proxy resolves against the active locale on every access, so a
// runtime switch only needs `setLocale` + one re-render of the tree.

import { en } from "./en";

export type Dictionary = typeof en;

const dictionaries: Record<string, Dictionary | undefined> = { en };

export type Locale = "en";

let active: Locale = "en";

export function setLocale(locale: Locale): void {
  if (dictionaries[locale] != null) active = locale;
}

export function getLocale(): Locale {
  return active;
}

export const t: Dictionary = new Proxy(Object.create(null), {
  get(_target, section: string | symbol) {
    if (typeof section !== "string") return undefined;
    return dictionaries[active]?.[section as keyof Dictionary];
  },
}) as Dictionary;
