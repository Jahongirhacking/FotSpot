'use client';

import { Globe } from 'lucide-react';
import { LOCALES, LOCALE_META } from '@/lib/i18n';
import { useI18n } from './I18nProvider';
import { Menu, MenuContent, MenuLabel, MenuRadioItem, MenuTrigger } from '@/components/ui/Menu';

/**
 * Language picker — README §14.
 *
 * Always visible, including signed out: a guest landing on the site in Russian
 * shouldn't have to register to read it. Each language is written in its own
 * script, never translated ("Русский", not "Rus tili") — that is the one label a
 * user must recognise without already understanding the current language.
 */
export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, t, setLocale } = useI18n();
  const active = LOCALE_META[locale];

  return (
    <Menu>
      <MenuTrigger
        className="hover:bg-surface-2 flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium"
        aria-label={`${t.common.language}: ${active.label}`}
      >
        <Globe className="size-4 shrink-0" aria-hidden />
        {!compact && <span className="uppercase">{locale}</span>}
      </MenuTrigger>

      <MenuContent>
        <MenuLabel>{t.common.language}</MenuLabel>
        {LOCALES.map((code) => (
          <MenuRadioItem
            key={code}
            checked={code === locale}
            onSelect={() => setLocale(code)}
            lang={code}
          >
            <span aria-hidden>{LOCALE_META[code].flag}</span>
            {LOCALE_META[code].label}
          </MenuRadioItem>
        ))}
      </MenuContent>
    </Menu>
  );
}
