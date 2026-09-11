# BLOG.md — writing for search on FotSpot

How an admin or super admin uses **`/admin/blog/new`** so that a post ranks, shares well and
reads well. Everything technical (metadata, canonical, Open Graph, JSON-LD, the sitemap) is
generated from the fields you fill in — your job is the fields. This file says what each one is
for, what the page does with it, and the order that gets a post out fastest.

Who can do this: accounts holding the `admin` or `super_admin` role, acting in that role
(`/admin/blog` is in the admin menu). Readers never see a draft anywhere: not on `/blog`, not by
URL, not in the sitemap, not in search.

---

## 1. The fast path (ten minutes per post)

1. **Title** — the H1 and the default `<title>`. Write it for a person searching.
2. **Save draft** once. This mints the slug and reading time and unlocks image uploads.
3. **Excerpt** — two sentences. It is the card text on `/blog` **and** the meta description
   unless you write a separate one.
4. **Content** in Markdown: `#` for sections, one idea per paragraph, at least one link to a
   player, academy or trial on FotSpot.
5. **Cover image** with **alt text**. Upload 1600×900 or larger, 16:9.
6. **Category.** Pick one; create it in the Categories panel on `/admin/blog` if it is missing.
7. **Pictures in the text** — from the Images panel under the content: upload, Copy Markdown, paste.
8. **SEO panel** — keywords are suggested; check them. Everything else only if the defaults are
   wrong for this post (see §6).
9. **Preview**, read it once on a phone-width window, then **Publish**.

Publishing needs a title, an excerpt and content; the API refuses an empty one. The first
publish date is kept forever — unpublishing and republishing does not make a post "new".

---

## 2. Title and slug

**Title** (3–160 characters). It becomes the page's single `<h1>`, the default SEO title, the
default share title and the JSON-LD `headline`. Front-load the subject: _"Bunyodkor U15 opens
trials in Chilonzor this Saturday"_ beats _"Great news for young players this weekend"_. Keep it
under about 60 characters if you want it to fit a search result without being cut; longer titles
are fine on the page itself.

**Address (slug)** is made from the title the first time you save:

- lowercase Latin letters, digits and single hyphens; Cyrillic is transliterated
  (`Янги академия` → `yangi-akademiya`), apostrophes and `ʻ` are dropped
  (`o'yinchi` → `oyinchi`), everything else becomes a hyphen;
- trimmed to 90 characters at a word boundary;
- made unique: a second post with the same title gets `-2`, `-3`, …

Edit it by hand when the title is long — a slug of five or six meaningful words is better than
fifteen. **Once a post is published, leave the slug alone.** Changing the title later never
rewrites it (that is deliberate: links people already have keep working), and "From title" only
regenerates when you press it. A changed slug is a broken link everywhere the old one was shared;
there is no redirect.

Good: `/blog/bunyodkor-u15-sinov-chilonzor` · Bad: `/blog/post-1`, `/blog/yangiliklar`.

---

## 3. Excerpt and meta description

The **excerpt** (≤ 400 characters) does three jobs: the text under the title on cards, the
lead paragraph under the H1, and — when the _Meta description_ field is empty — the
`<meta name="description">` trimmed to 160 characters. So write the first 160 characters as if
they were the search snippet: the who, the what and the where, in plain words, no "Read on to
find out".

Fill **Meta description** (≤ 170) separately only when the excerpt is too long or too
editorial to serve as a snippet. It must be unique per post: two posts with the same description
compete with each other.

---

## 4. Content that reads and ranks

Markdown, up to 60 000 characters, rendered to sanitised HTML on save. What the toolbar and
the syntax map to:

| You write                       | Reader gets                    | Note                                                                        |
| ------------------------------- | ------------------------------ | --------------------------------------------------------------------------- |
| `# Heading`                     | `<h2>`                         | The title is the only H1. Never repeat it as a heading.                     |
| `## Heading`                    | `<h3>`                         | Sub-sections of an `#` section.                                             |
| `### Heading`                   | `<h4>`                         | Rarely needed.                                                              |
| `**bold**`, `*italic*`          | `<strong>`, `<em>`             |                                                                             |
| `[text](/players/@handle)`      | internal link                  | Kept as a plain link — crawlers follow it.                                  |
| `[text](https://example.com)`   | external link                  | Opens in a new tab with `rel="noopener noreferrer"`.                        |
| `![Caption](https://…/img.jpg)` | `<figure>` with `<figcaption>` | Own line; the caption is also the image's alt text.                         |
| a YouTube link on its own line  | the YouTube player, 16:9       | `youtube.com/watch`, `youtu.be`, Shorts; inside a sentence it stays a link. |
| `- item`, `1. item`             | lists                          |                                                                             |
| `> quote`                       | `<blockquote>`                 | Good for what a coach or manager actually said.                             |
| `---`                           | horizontal rule                |                                                                             |

Rules of thumb that matter for search:

- **One `#` section every 150–300 words.** Headings are what a crawler summarises and what a
  reader on a phone skims. Make them statements, not labels: `# Who can apply` rather than
  `# Details`.
- **Link to FotSpot itself, early.** A player's profile (`/players/@handle`), an academy
  (`/academies/<id>`), a trial (`/trials/<id>`), another post (`/blog/<slug>`), or the
  directories (`/players`, `/academies`, `/trials`). Internal links are how the rest of the site
  gets crawled from the story, and the article page adds its own "Explore on FotSpot" block and a
  random players/academies sidebar for the same reason — your links in the text still count more.
- **Answer the question in the first paragraph.** The date, the place, the age group. People
  searching _"U14 trial Tashkent"_ want the fact, and the snippet is taken from the top.
- **Write in the language of the reader.** Uzbek (Latin) is the site's default; the page marks
  the article `inLanguage: uz`. A Russian post is fine, but keep one post in one language.
- **Reading time** is computed at 200 words per minute and shown on cards. Override it only if
  the post is mostly images or tables; setting `0` recomputes.
- **Pictures inside the text come from the "Images for this post" panel** under the content
  box (it appears once the draft is saved). Upload, press **Copy Markdown**, paste on its own
  line, replace the description, then **Preview**. See §5.
- **A video is a YouTube link on its own line.** Nothing else to write; the page shows the
  player (privacy-enhanced, no cookies until play). Put it after the paragraph that introduces
  it, and keep the link out of the middle of a sentence unless you want a plain link.

---

## 5. Images

**Cover image** — upload from the editor once the draft exists. It is the hero on the article,
the card picture on `/blog`, the featured banner, the default Open Graph / Twitter image and the
JSON-LD `image`. Use a real photograph of the subject, 16:9, at least 1600×900, under about 400 KB
(JPEG or WebP). Portrait images are cropped to the frame.

**Cover alt text** (≤ 200) is required for accessibility and is read by image search. Describe
what is in the picture, not the post: _"Bunyodkor U15 squad warming up at Chilonzor stadium"_, not
_"cover image"_ or the title again.

**Share image** (OG image) — only when the cover is wrong for a link preview (text-heavy, or a
portrait). 1200×630 is the format every messenger and social network expects. Leave it empty
otherwise; the cover is used.

**Images in the text** — the panel under the content box, once the draft is saved:

1. **Upload image** (JPEG, PNG, WebP, GIF or AVIF, up to 8 MB; each file shows its own progress
   and its own error). The file goes straight to the CDN under this post.
2. **Copy Markdown** — the clipboard gets `![Cover alt text](https://…)`. **Copy URL** gives the
   bare address if you prefer to type the line yourself.
3. Paste it on its own line in the content and replace the description in the square brackets
   with what the picture shows. That text is the caption under the image and its alt text.
4. **Preview** after saving.

**Delete** asks first, then removes the file from the CDN at once. A picture still referenced in
the content shows as broken afterwards, so remove the line from the text too. Deleting the post
removes all of its images.

Never upload a photo of a minor you do not have permission to publish. Academy photos and trial
photos supplied by the academy are fine; a scraped image is not.

---

## 6. The SEO panel — when the defaults are not enough

Every field is optional and falls back sensibly. Fill one only when the fallback is wrong.

| Field                  | Default                                    | Fill it when                                                                                                                                                                                                                                                                                                                             |
| ---------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SEO title** (≤ 70)   | the title                                  | the title is long or editorial; write the 55–60 character search version here.                                                                                                                                                                                                                                                           |
| **Meta description**   | the excerpt, trimmed to 160                | see §3.                                                                                                                                                                                                                                                                                                                                  |
| **Keywords** (≤ 15)    | suggested from the title, excerpt and text | the suggestion is a starting point, not an answer: keep the specific terms (club, district, age group, position), drop the vague ones, add the Uzbek and Russian spellings people actually type. Once you edit the box it is yours; **Suggest** puts the automatic list back. They feed `<meta name="keywords">` and JSON-LD `keywords`. |
| **Canonical URL**      | the post's own `/blog/<slug>`              | **only** if the story was first published elsewhere and this is a repost — then paste the original's URL so search engines credit it, not us. Otherwise leave empty; a wrong canonical de-indexes the post.                                                                                                                              |
| **Share title** (≤ 90) | the SEO title, else the title              | the messenger preview wants a punchier line than search does.                                                                                                                                                                                                                                                                            |
| **Share description**  | the meta description                       | same idea, for the preview card.                                                                                                                                                                                                                                                                                                         |
| **Share image**        | the cover                                  | see §5.                                                                                                                                                                                                                                                                                                                                  |

What is generated without any input: `rel="canonical"`, `og:type=article`,
`article:published_time` / `article:modified_time`, `article:author`, `article:section` (the
category), `article:tag` (keywords), Twitter `summary_large_image`, breadcrumb JSON-LD, and an
`Article` JSON-LD block with `datePublished`, `dateModified`, the author and the publisher. The
post joins `/sitemap.xml` the moment it is published and leaves it the moment it is unpublished.

---

## 7. Category, byline, featured

- **Category** groups posts on `/blog` (chips at the top, and `/blog?category=<slug>`), is the
  `article:section`, and drives "Related posts" under the article. Keep the set small and
  stable — _Yangiliklar · Futbolchilar · Akademiyalar · Transferlar · Sinovlar · Platforma_ is
  plenty. A category's slug follows the same rules as a post's.
- **Author** is a choice between Lupo and a verified academy. Left on **🐺 Lupo - Talent
  Hunter**, the FotSpot mascot signs the post with his picture, and the markup names FotSpot as
  the author organisation. Pick an academy when the piece is theirs: its name and logo sign the
  post, link to its page, and go into `article:author` and the JSON-LD. An admin's own account
  name is never shown to readers.
- **Feature this post** puts it in the large banner on `/blog`. One post at a time is the
  intent; the newest featured wins if several are ticked, and unpublishing clears the flag.

"This week" and "Top posts" on `/blog` are earned, not set: they rank by likes.

---

## 8. Before you press Publish

- [ ] Title says the subject in the first five words; under ~60 characters if it can be.
- [ ] Slug is short, Latin, meaningful — and will never change after this.
- [ ] Excerpt reads as a search snippet in its first 160 characters.
- [ ] Sections use `#` (never a second H1); one heading every 150–300 words.
- [ ] At least one link to a player, academy, trial or post on FotSpot.
- [ ] Cover uploaded, 16:9, with alt text that describes the picture.
- [ ] Category chosen. Keywords checked: the suggested list trimmed to specific terms.
- [ ] Canonical left empty unless this is a repost.
- [ ] Preview checked at phone width: no giant images, no walls of text.

## 9. After publishing

- Share the `/blog/<slug>` link in the academy's Telegram channel; the preview card is built
  from the share fields.
- To fix a typo, edit and **Save** — `dateModified` updates, `datePublished` does not.
- To pull a post, **Unpublish**: it drops from `/blog`, the sitemap and search on the next crawl,
  and its URL shows the not-found page. **Delete** also removes its images from storage; there is
  no undo.
- Likes are one per signed-in user; a guest who presses the heart is sent to sign in and back.
