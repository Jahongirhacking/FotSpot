'use client';

import { X } from 'lucide-react';
import * as React from 'react';

import { useI18n } from '@/components/layout/I18nProvider';
import { Input } from '@/components/ui/Field';
import { MAX_KEYWORD_LENGTH, MAX_KEYWORDS, mergeKeywords } from '@/lib/seo-keywords';
import { cn } from '@/lib/utils';

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
 * ## Commas split
 *
 * Keyword lists arrive as "shurtan, klub, futbol akademiyasi" far more often
 * than one word at a time — copied from a brief, a spreadsheet, another site.
 * A comma therefore ends a keyword as Enter does: typed, the part before it
 * becomes a chip and the rest stays in the box; pasted, every part becomes a
 * chip at once. Splitting and de-duplication live in `mergeKeywords`, so the
 * rules are the same whichever way the text came in.
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

  /**
   * Turns `text` into chips. Nothing new — a blank box, a duplicate, an
   * over-long part — leaves the list as it is; the box is cleared either way,
   * because a duplicate is not an error to correct, it is a keyword that is
   * already there.
   */
  function commit(text: string) {
    const next = mergeKeywords(value, text);
    if (next.length !== value.length) onChange(next);
    setDraft('');
  }

  function add() {
    commit(draft);
  }

  /*
   * A comma typed ends the keyword before it. The part after the last comma
   * stays in the box, so "shurtan, kl" is one chip and a half-typed second.
   */
  function onDraftChange(text: string) {
    if (!text.includes(',')) {
      setDraft(text);
      return;
    }
    const lastComma = text.lastIndexOf(',');
    const next = mergeKeywords(value, text.slice(0, lastComma));
    if (next.length !== value.length) onChange(next);
    setDraft(text.slice(lastComma + 1).trimStart());
  }

  /*
   * A paste is committed whole, including its last part — someone pasting
   * "shurtan, klub" expects two chips, not one chip and a box still holding
   * "klub". Handled here rather than in `onDraftChange` because the input's
   * `maxLength` would cut a long paste to one keyword's length first.
   */
  function onPaste(event: React.ClipboardEvent<HTMLInputElement>) {
    const text = event.clipboardData.getData('text');
    if (!text.includes(',')) return;
    event.preventDefault();
    // Spliced in where the caret is, as the browser would have: "kl" plus a
    // paste of "ub, futbol" is "klub, futbol", not three keywords.
    const { selectionStart, selectionEnd, value: current } = event.currentTarget;
    const start = selectionStart ?? current.length;
    const end = selectionEnd ?? start;
    commit(`${current.slice(0, start)}${text}${current.slice(end)}`);
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
        onChange={(event) => onDraftChange(event.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
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
