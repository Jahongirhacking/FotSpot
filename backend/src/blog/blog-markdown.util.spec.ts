import {
  markdownToPlainText,
  readingMinutes,
  renderBlogMarkdown,
  sanitizeBlogHtml,
  youtubeVideoId,
} from './blog-markdown.util';

describe('renderBlogMarkdown', () => {
  it('renders paragraphs, emphasis, links and code', () => {
    const html = renderBlogMarkdown(
      'Hello **bold** and *italic* with `code` and [a link](https://example.com/x).',
    );
    expect(html).toBe(
      '<p>Hello <strong>bold</strong> and <em>italic</em> with <code>code</code> and <a href="https://example.com/x" target="_blank" rel="noopener noreferrer">a link</a>.</p>',
    );
  });

  it('demotes headings so the title stays the only H1', () => {
    expect(renderBlogMarkdown('# Top\n\n## Next\n\n### Third')).toBe(
      '<h2>Top</h2>\n<h3>Next</h3>\n<h4>Third</h4>',
    );
  });

  it('keeps internal links in the tab and sends external ones out', () => {
    const html = renderBlogMarkdown('[players](/players) and [out](https://fifa.com)');
    expect(html).toContain('<a href="/players">players</a>');
    expect(html).toContain(
      '<a href="https://fifa.com" target="_blank" rel="noopener noreferrer">out</a>',
    );
  });

  it('renders lists, quotes and rules', () => {
    const html = renderBlogMarkdown('- one\n- two\n\n1. first\n2. second\n\n> said so\n\n---');
    expect(html).toBe(
      '<ul><li>one</li><li>two</li></ul>\n<ol><li>first</li><li>second</li></ol>\n<blockquote><p>said so</p></blockquote>\n<hr />',
    );
  });

  it('makes a picture on its own line a figure with its caption', () => {
    expect(renderBlogMarkdown('![Training at Bunyodkor](https://cdn.example/x.jpg)')).toBe(
      '<figure><img src="https://cdn.example/x.jpg" alt="Training at Bunyodkor" loading="lazy" /><figcaption>Training at Bunyodkor</figcaption></figure>',
    );
  });

  it('escapes HTML the author typed, and drops scripts and bad schemes', () => {
    const html = renderBlogMarkdown(
      '<script>alert(1)</script> [x](javascript:alert(1)) <b>raw</b>',
    );
    expect(html).not.toContain('<script');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;b&gt;raw&lt;/b&gt;');
  });

  it('joins consecutive lines into one paragraph with breaks, and blank lines into new ones', () => {
    expect(renderBlogMarkdown('line one\nline two\n\nnext')).toBe(
      '<p>line one<br />line two</p>\n<p>next</p>',
    );
  });
});

describe('readingMinutes', () => {
  it('is one for anything short, and rounds up at two hundred words a minute', () => {
    expect(readingMinutes('a few words')).toBe(1);
    expect(readingMinutes('word '.repeat(200))).toBe(1);
    expect(readingMinutes('word '.repeat(201))).toBe(2);
    expect(readingMinutes('word '.repeat(1000))).toBe(5);
  });
});

describe('markdownToPlainText', () => {
  it('leaves only the words', () => {
    expect(markdownToPlainText('# Title\n\nSome **bold** [text](/x).')).toBe(
      'Title Some bold text.',
    );
  });
});

describe('YouTube', () => {
  const ID = 'dQw4w9WgXcQ';

  it.each([
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}&t=42s`,
    `https://youtu.be/${ID}?si=abc`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube-nocookie.com/embed/${ID}`,
  ])('recognises %s', (url) => {
    expect(youtubeVideoId(url)).toBe(ID);
  });

  it.each([
    'https://notyoutube.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/watch?v=short',
    'https://example.com/youtu.be/dQw4w9WgXcQ',
    'javascript:alert(1)',
    'not a url',
  ])('ignores %s', (url) => {
    expect(youtubeVideoId(url)).toBeNull();
  });

  it('a bare link on its own line becomes the privacy-enhanced player', () => {
    const html = renderBlogMarkdown(`Intro\n\nhttps://youtu.be/${ID}\n\nOutro`);
    expect(html).toContain(
      `<figure class="video"><iframe src="https://www.youtube-nocookie.com/embed/${ID}"`,
    );
    expect(html).toContain('allowfullscreen');
    expect(html).toMatch(/<p>Intro<\/p>.*<figure class="video">.*<p>Outro<\/p>/s);
  });

  it('a link inside a sentence, or a Markdown link, stays a link', () => {
    const html = renderBlogMarkdown(
      `Watch https://youtu.be/${ID} now\n\n[Video](https://www.youtube.com/watch?v=${ID})`,
    );
    expect(html).not.toContain('<iframe');
    expect(html).toContain(`<a href="https://www.youtube.com/watch?v=${ID}"`);
  });

  it('the sanitiser keeps the YouTube player and drops any other iframe', () => {
    const kept = sanitizeBlogHtml(
      `<figure class="video"><iframe src="https://www.youtube-nocookie.com/embed/${ID}" allowfullscreen></iframe></figure>`,
    );
    expect(kept).toContain('<iframe src="https://www.youtube-nocookie.com/embed/');
    const dropped = sanitizeBlogHtml(
      '<figure class="video"><iframe src="https://evil.example/embed"></iframe></figure>',
    );
    expect(dropped).not.toContain('<iframe');
    expect(sanitizeBlogHtml('<figure class="other">x</figure>')).not.toContain('class=');
  });
});
