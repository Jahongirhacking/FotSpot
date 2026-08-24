'use client';

import { X } from 'lucide-react';
import * as React from 'react';

import { useI18n } from '@/components/layout/I18nProvider';
import { Input } from '@/components/ui/Field';
import { cn } from '@/lib/utils';

/**
 * Long enough for "youth football academy in tashkent", short enough that
 * nobody pastes a paragraph. Mirrors `seo-keywords.util.ts` on the server, which
 * is the authority — this only stops the typing before it becomes a rejection.
 */
const MAX_KEYWORD_LENGTH = 60;
const MAX_KEYWORDS = 20;

/**
 * The tag input for SEO keywords, shared by the academy and trial forms.
 *
 * ## One component, because the rules are one set of rules
 *
 * Duplicate handling, trimming and the empty case are easy to get subtly
 * different in two places, and "subtly different" here means one form quietly
 * storing `Tashkent Academy` twice. There is one implementation and both forms
 * take it.
 *
 * ## Not a form field in the `FormData` sense
 *
 * The value lives in the parent's state and travels in the JSON body. A hidden
 * input carrying a joined string would have to pick a separator, and every
 * separator is a character somebody will legitimately type in a search phrase.
 */
export function SeoKeywordInput({
  value,
  onChange,
  id = 'seo-keywords',
  disabled,
}: {
  value: string[];
  onChange: (keywords: string[]) => void;
  id?: string;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = React.useState('');
  const full = value.length >= MAX_KEYWORDS;

  function add() {
    // Inner runs collapse too, so "youth   football" and "youth football" are
    // the same term typed carelessly once — the server does the same.
    const keyword = draft.replace(/\s+/g, ' ').trim();

    // Nothing typed: pressing Enter on an empty box does nothing at all, rather
    // than adding a blank chip or clearing what is there.
    if (!keyword || full) return;
    if (keyword.length > MAX_KEYWORD_LENGTH) return;

    // Case-insensitive, so "Tashkent Academy" cannot join "tashkent academy".
    // The first spelling stays: the operator chose those capitals.
    const exists = value.some((existing) => existing.toLowerCase() === keyword.toLowerCase());
    if (!exists) onChange([...value, keyword]);

    // Cleared either way — a duplicate is not an error to correct, it is a
    // keyword that is already there, so the box is ready for the next one.
    setDraft('');
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      /*
       * The form must not submit.
       *
       * This input lives inside the academy and trial forms, where a bare Enter
       * would save the whole thing — so somebody adding their third keyword
       * would create the trial instead.
       */
      event.preventDefault();
      add();
      return;
    }

    // Backspace on an empty box takes the last chip back, which is what every
    // tag input does and what somebody who mistyped will try first.
    if (event.key === 'Backspace' && !draft && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        // A list, so a screen reader announces how many there are and can step
        // through them, rather than reading a run of unrelated buttons.
        <ul className="flex flex-wrap gap-1.5">
          {value.map((keyword) => (
            <li key={keyword.toLowerCase()}>
              <span className="bg-surface-3 group inline-flex items-center gap-1 rounded-full py-1 pr-1 pl-2.5 text-xs">
                <span className="max-w-52 truncate">{keyword}</span>
                <button
                  type="button"
                  onClick={() => onChange(value.filter((entry) => entry !== keyword))}
                  disabled={disabled}
                  /*
                   * Faded rather than hidden until hover.
                   *
                   * `opacity-0` until `group-hover` is the tidier look and it
                   * makes the control unreachable on a touch screen, where there
                   * is no hover at all — so the remove button would simply not
                   * exist on a phone. It sharpens on hover and on focus instead.
                   */
                  className={cn(
                    'text-muted hover:bg-danger/15 hover:text-danger focus-visible:ring-ring grid size-4.5 shrink-0 place-items-center rounded-full opacity-60 transition group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none',
                    disabled && 'pointer-events-none opacity-30',
                  )}
                  aria-label={`${t.common.delete}: ${keyword}`}
                >
                  <X className="size-3" aria-hidden />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <Input
        id={id}
        value={draft}
        disabled={disabled || full}
        maxLength={MAX_KEYWORD_LENGTH}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        /*
         * Committed on blur as well as on Enter.
         *
         * Typing a keyword and then clicking Save is the obvious way to lose
         * one: the box still holds it, the form never sees it, and the person
         * has no reason to suspect anything went missing.
         */
        onBlur={add}
        placeholder={full ? t.seoKeywords.full : t.seoKeywords.placeholder}
        aria-describedby={`${id}-hint`}
      />

      <p id={`${id}-hint`} className="text-muted text-xs">
        {t.seoKeywords.hint}
      </p>
    </div>
  );
}
