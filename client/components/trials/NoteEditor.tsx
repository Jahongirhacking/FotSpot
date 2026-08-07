'use client';

import * as React from 'react';
import { Bold, Eye, Italic, Link2, List, ListOrdered, Pencil } from 'lucide-react';
import { useI18n } from '@/components/layout/I18nProvider';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Field';
import { TrialNote } from './TrialNote';
import { markdownToHtml } from '@/lib/rich-text';

/**
 * The editor for a player-facing note.
 *
 * ## Why Markdown in a textarea, and not a WYSIWYG box
 *
 * The notes an academy writes are short and structured: what to bring, where to
 * be, who to ask for. That is emphasis, a list and sometimes a link — a
 * vocabulary small enough to type. A contenteditable surface would bring
 * invisible formatting, paste behaviour that differs per browser, and a
 * dependency an order of magnitude larger than the feature. A textarea can also
 * be pasted into from anywhere and read back exactly as it will be stored.
 *
 * The toolbar is there so nobody has to know Markdown to use it: each button
 * wraps the selection, and the preview shows what the player will see.
 *
 * ## What leaves this component
 *
 * HTML, already sanitised — `TrialNote` and the callers both go through
 * `sanitizeNote`. The server sanitises it again on write, which is the boundary
 * that actually protects anyone; this one exists so the editor cannot save
 * something the server would silently strip.
 */
export function NoteEditor({
  value,
  onChange,
  id,
  rows = 6,
  placeholder,
}: {
  /** Markdown, not HTML — see `htmlToMarkdown` for opening a stored note. */
  value: string;
  onChange: (markdown: string) => void;
  id: string;
  rows?: number;
  placeholder?: string;
}) {
  const { t } = useI18n();
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = React.useState(false);

  /**
   * Wrap the selection, or drop the markers in and put the caret between them.
   *
   * The caret restore is the point: a toolbar that clears the selection makes
   * the second press land somewhere unexpected, which is how people conclude the
   * buttons are broken and go back to typing the markers by hand.
   */
  const wrap = (before: string, after = before) => {
    const field = ref.current;
    if (!field) return;

    const { selectionStart: start, selectionEnd: end } = field;
    const selected = value.slice(start, end);
    const next = `${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`;
    onChange(next);

    requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  };

  /** Prefix every selected line — what a list button has to do. */
  const prefixLines = (marker: (index: number) => string) => {
    const field = ref.current;
    if (!field) return;

    const { selectionStart: start, selectionEnd: end } = field;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const block = value.slice(lineStart, end) || '';
    const prefixed = block
      .split('\n')
      .map((line, index) => (line.trim() ? `${marker(index)}${line}` : line))
      .join('\n');

    onChange(`${value.slice(0, lineStart)}${prefixed}${value.slice(end)}`);
    requestAnimationFrame(() => field.focus());
  };

  return (
    <div className="border-border overflow-hidden rounded-lg border">
      <div className="border-border bg-surface-2 flex flex-wrap items-center gap-1 border-b p-1">
        <ToolbarButton label={t.notes.bold} onClick={() => wrap('**')}>
          <Bold aria-hidden />
        </ToolbarButton>
        <ToolbarButton label={t.notes.italic} onClick={() => wrap('*')}>
          <Italic aria-hidden />
        </ToolbarButton>
        <ToolbarButton label={t.notes.bulletList} onClick={() => prefixLines(() => '- ')}>
          <List aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          label={t.notes.numberedList}
          onClick={() => prefixLines((index) => `${index + 1}. `)}
        >
          <ListOrdered aria-hidden />
        </ToolbarButton>
        <ToolbarButton label={t.notes.link} onClick={() => wrap('[', '](https://)')}>
          <Link2 aria-hidden />
        </ToolbarButton>

        <span className="flex-1" />

        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setPreview((was) => !was)}
          aria-pressed={preview}
        >
          {preview ? <Pencil aria-hidden /> : <Eye aria-hidden />}
          {preview ? t.notes.write : t.notes.preview}
        </Button>
      </div>

      {preview ? (
        <div className="min-h-24 p-3">
          {value.trim() ? (
            <TrialNote html={markdownToHtml(value)} />
          ) : (
            <p className="text-muted text-sm">{t.notes.nothingToPreview}</p>
          )}
        </div>
      ) : (
        <Textarea
          id={id}
          ref={ref}
          value={value}
          rows={rows}
          maxLength={5000}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder ?? t.notes.placeholder}
          className="rounded-none border-0 focus-visible:ring-0"
        />
      )}
    </div>
  );
}

function ToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      {children}
    </Button>
  );
}
