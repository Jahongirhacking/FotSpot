'use client';

import * as React from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { readTheme, subscribeToTheme, type ThemeChoice } from '@/lib/theme';
import { revealTheme } from '@/lib/theme-reveal';
import { useI18n } from './I18nProvider';
import { Menu, MenuContent, MenuLabel, MenuRadioItem, MenuTrigger } from '@/components/ui/Menu';

const OPTIONS: { value: ThemeChoice; icon: typeof Sun }[] = [
  { value: 'light', icon: Sun },
  { value: 'dark', icon: Moon },
  { value: 'system', icon: Monitor },
];

/**
 * Light / dark / system.
 *
 * Sits beside the language picker and is visible signed out, for the same reason
 * that one is: a guest reading the landing page at night should not have to make
 * an account to stop being dazzled.
 *
 * "System" is the default and is a real third option rather than a starting
 * value that disappears once you touch the others — most people want the app to
 * follow their phone, and the ones who don't usually want the opposite of it.
 *
 * The choice comes from `useSyncExternalStore` rather than an effect. The server
 * cannot know what is in `localStorage`, so it renders the "system" snapshot and
 * the client swaps to the real one on hydration — which is exactly what this hook
 * is for, and it avoids the extra render an effect would cost. The *visual* theme
 * is already correct before this mounts, applied by the head script; this only
 * catches the icon up. Subscribing also syncs the icon across tabs.
 */
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  const choice = React.useSyncExternalStore<ThemeChoice>(
    subscribeToTheme,
    readTheme,
    () => 'system',
  );

  const label: Record<ThemeChoice, string> = {
    light: t.common.themeLight,
    dark: t.common.themeDark,
    system: t.common.themeSystem,
  };

  const Active = OPTIONS.find((option) => option?.value === choice)?.icon ?? Monitor;
  // The reveal grows from this button, so the switch reads as coming from
  // where it was asked for — see lib/theme-reveal.
  const trigger = React.useRef<HTMLButtonElement | null>(null);

  function choose(value: ThemeChoice) {
    const rect = trigger.current?.getBoundingClientRect();
    revealTheme(value, {
      x: rect ? rect.left + rect.width / 2 : window.innerWidth,
      y: rect ? rect.top + rect.height / 2 : 0,
    });
  }

  return (
    <Menu>
      <MenuTrigger
        ref={trigger}
        className="hover:bg-surface-2 flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium"
        aria-label={`${t.common.theme}: ${label[choice]}`}
      >
        <Active className="size-4 shrink-0" aria-hidden />
        {!compact && <span className="sr-only sm:not-sr-only">{label[choice]}</span>}
      </MenuTrigger>

      <MenuContent>
        <MenuLabel>{t.common.theme}</MenuLabel>
        {OPTIONS.map(({ value, icon: Icon }) => (
          <MenuRadioItem key={value} checked={value === choice} onSelect={() => choose(value)}>
            <Icon className="size-4" aria-hidden />
            {label[value]}
          </MenuRadioItem>
        ))}
      </MenuContent>
    </Menu>
  );
}
