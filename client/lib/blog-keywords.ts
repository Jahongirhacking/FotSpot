/**
 * Suggested SEO keywords for a blog post, from the words the post already has.
 *
 * ## Why suggest at all
 *
 * The keywords field was empty on most posts, because an editor at the end of
 * writing a piece has nothing left for a box that asks them to think like a
 * search engine. So the box is filled first and edited second: the title,
 * the excerpt and the body are scored, and the terms that carry the piece are
 * offered as the starting value. An editor who knows a better term types it;
 * one who does not still ships a tagged post.
 *
 * ## How the score works
 *
 * A word in the title is worth more than one in the excerpt, which is worth
 * more than one in the body — the title is what the editor chose to say the
 * piece is about. Pairs of adjacent title words ("yangi akademiya", "U15
 * trials") are offered first, because a two-word phrase is what people type.
 * Stop words in the three site languages are dropped, as are numbers, short
 * tokens and the Markdown itself. The category, if any, leads the list.
 *
 * Pure and dependency-free: it runs on every keystroke in the editor.
 */

const MAX_SUGGESTIONS = 8;
const MIN_TOKEN_LENGTH = 3;
/** How many two-word phrases from the title lead the list. */
const MAX_PHRASES = 2;
/** A single word needs this much weight: the title, the excerpt, or three mentions in the body. */
const MIN_SINGLE_SCORE = 3;

/** Common words in Uzbek (Latin), Russian and English that say nothing about a topic. */
const STOP_WORDS = new Set(
  `
  va ham bilan uchun ular bu shu u o'sha ushbu edi emas bo'ldi bo'lgan bo'lib bor yo'q ham lekin
  ammo yoki agar chunki qanday qachon qaysi kim nima nega hali endi juda eng har bir ikki uch
  bo'yicha haqida keyin oldin orqali ichida tomonidan sifatida deb degan dedi bo'lsa bo'lishi
  bizning sizning uning ularning mening sening ham yana faqat barcha hamma yangi katta kichik
  и в во не что он на я с со как а то все она так его но да ты к у же вы за бы по только ее
  мне было вот от меня еще нет о из ему теперь когда даже ну вдруг ли если уже или ни быть был
  него до вас нибудь опять уж вам ведь там потом себя ничего ей может они тут где есть надо ней
  для мы тебя их чем была сам чтоб без будто чего раз тоже себе под будет ж тогда кто этот того
  потому этого какой совсем ним здесь этом один почти мой тем чтобы нее сейчас были куда зачем
  всех никогда можно при наконец два об другой хоть после над больше тот через эти нас про всего
  них какая много разве три эту моя впрочем хорошо свою этой перед иногда лучше чуть том нельзя
  такой им более всегда конечно всю между это который которые которых также очень был была
  the a an and or but if then than so of to in on at by for with from as is are was were be been
  being this that these those it its he she they them his her their our your we you i me my not
  no yes do does did have has had will would can could should may might about into over after
  before under again more most very just also all any each few some such only own same too
  what which who whom when where why how here there now new open opens opened
  год года году лет дня день можно нужно каждый каждую каждое стал стала стали
  `
    .split(/\s+/)
    .map((word) => word.trim().toLowerCase())
    .filter(Boolean),
);

/** Letters in the three scripts the site is written in, plus the Uzbek apostrophes. */
const TOKEN = /[\p{L}\p{N}][\p{L}\p{N}'ʼʻ’-]*/gu;

/** Lower-case with the Uzbek apostrophes unified, so "o‘yin", "oʻyin" and "o'yin" count once. */
function normalise(token: string): string {
  return token.toLowerCase().replace(/[ʼʻ’]/g, "'");
}

/** Markdown down to prose: no image lines, no link targets, no heading marks. */
function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`>]/g, ' ');
}

function tokens(text: string): string[] {
  return (text.match(TOKEN) ?? []).map((raw) => raw.replace(/^-+|-+$/g, ''));
}

/** Whether a token is worth offering on its own. */
function meaningful(token: string): boolean {
  const key = normalise(token);
  if (key.length < MIN_TOKEN_LENGTH) return false;
  if (/^\d+$/.test(key)) return false;
  return !STOP_WORDS.has(key);
}

export function suggestKeywords({
  title,
  excerpt = '',
  content = '',
  category = null,
  limit = MAX_SUGGESTIONS,
}: {
  title: string;
  excerpt?: string;
  content?: string;
  category?: string | null;
  limit?: number;
}): string[] {
  const scores = new Map<string, number>();
  /** The surface form to show: the most frequent casing of each term. */
  const forms = new Map<string, Map<string, number>>();

  const add = (token: string, weight: number) => {
    const key = normalise(token);
    scores.set(key, (scores.get(key) ?? 0) + weight);
    const seen = forms.get(key) ?? new Map<string, number>();
    seen.set(token, (seen.get(token) ?? 0) + 1);
    forms.set(key, seen);
  };

  // Every field is stripped, not only the body: an address pasted into the
  // excerpt by mistake must not become eight keywords of hex.
  const titleTokens = tokens(stripMarkdown(title));
  for (const token of titleTokens) if (meaningful(token)) add(token, 5);
  for (const token of tokens(stripMarkdown(excerpt))) if (meaningful(token)) add(token, 3);
  for (const token of tokens(stripMarkdown(content))) if (meaningful(token)) add(token, 1);

  const bestForm = (key: string) => {
    const seen = forms.get(key);
    if (!seen) return key;
    let best = key;
    let count = -1;
    for (const [form, n] of seen) {
      if (n > count) {
        best = form;
        count = n;
      }
    }
    return best;
  };

  const out: string[] = [];
  const taken = new Set<string>();
  const push = (value: string) => {
    const key = normalise(value).replace(/\s+/g, ' ').trim();
    if (!key || taken.has(key)) return;
    taken.add(key);
    out.push(value.replace(/\s+/g, ' ').trim());
  };

  if (category?.trim()) push(category);

  // Two adjacent meaningful words of the title, the strongest pairs first.
  const phrases: { text: string; score: number }[] = [];
  for (let i = 0; i + 1 < titleTokens.length; i += 1) {
    const [a, b] = [titleTokens[i], titleTokens[i + 1]];
    if (!meaningful(a) || !meaningful(b)) continue;
    const score = (scores.get(normalise(a)) ?? 0) + (scores.get(normalise(b)) ?? 0);
    phrases.push({ text: `${a} ${b}`, score });
  }
  phrases.sort((x, y) => y.score - x.score);
  for (const phrase of phrases.slice(0, MAX_PHRASES)) push(phrase.text);

  const ranked = [...scores.entries()]
    .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
    .map(([key]) => key);
  for (const key of ranked) {
    if (out.length >= limit) break;
    const score = scores.get(key) ?? 0;
    if (score < MIN_SINGLE_SCORE) break;
    // A single word already inside an offered phrase adds nothing on its own
    // unless it is strong in the body too.
    const insidePhrase = out.some(
      (phrase) => phrase.includes(' ') && normalise(phrase).split(' ').includes(key),
    );
    if (insidePhrase && score < 8) continue;
    push(bestForm(key));
  }

  return out.slice(0, limit);
}
