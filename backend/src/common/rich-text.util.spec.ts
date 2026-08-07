import { richTextToPlain, sanitizeRichText } from './rich-text.util';

/**
 * The sanitiser is the security boundary for anything an academy writes and a
 * family reads, so these are the cases that matter rather than a survey of the
 * library's behaviour. The client sanitises too, but this endpoint is reachable
 * without ever loading the client — every test below posts what an attacker
 * would, not what the editor produces.
 */
describe('sanitizeRichText', () => {
  it('keeps the markup a note is actually written in', () => {
    const clean = sanitizeRichText(
      '<p>Bring <strong>boots</strong> and a <em>water bottle</em>.</p><ul><li>Pitch 3</li></ul>',
    );

    expect(clean).toContain('<strong>boots</strong>');
    expect(clean).toContain('<em>water bottle</em>');
    expect(clean).toContain('<li>Pitch 3</li>');
  });

  it('strips a script tag and its contents', () => {
    const clean = sanitizeRichText('<p>Hello</p><script>alert(document.cookie)</script>');

    expect(clean).toBe('<p>Hello</p>');
    expect(clean).not.toContain('alert');
  });

  it('drops inline event handlers', () => {
    const clean = sanitizeRichText('<p onclick="steal()">Saturday 10:00</p>');

    expect(clean).not.toContain('onclick');
    expect(clean).toContain('Saturday 10:00');
  });

  it('refuses a javascript: link but keeps a real one', () => {
    expect(sanitizeRichText('<a href="javascript:alert(1)">tap</a>')).not.toContain('javascript:');
    expect(sanitizeRichText('<a href="https://example.uz/map">map</a>')).toContain(
      'https://example.uz/map',
    );
  });

  it('opens links away from the page, with no handle back to it', () => {
    const clean = sanitizeRichText('<a href="https://example.uz">map</a>') ?? '';

    expect(clean).toContain('target="_blank"');
    expect(clean).toContain('rel="noopener noreferrer"');
  });

  it('removes images and iframes — a note must not fetch from anybody', () => {
    const clean = sanitizeRichText(
      '<p>Hi</p><img src="https://tracker.example/x.gif"><iframe src="https://ads.example"></iframe>',
    );

    expect(clean).toBe('<p>Hi</p>');
  });

  it('returns null for markup with no words in it', () => {
    expect(sanitizeRichText('<p><br></p>')).toBeNull();
    expect(sanitizeRichText('   ')).toBeNull();
    expect(sanitizeRichText(null)).toBeNull();
    expect(sanitizeRichText(undefined)).toBeNull();
  });
});

describe('richTextToPlain', () => {
  it('flattens a note for places that render a string', () => {
    const plain = richTextToPlain('<p>Bring boots.</p><ul><li>Pitch 3</li><li>10:00</li></ul>');

    expect(plain).toBe('Bring boots.\n\n• Pitch 3\n• 10:00');
  });

  it('decodes entities, so a phone shows an ampersand not &amp;', () => {
    expect(richTextToPlain('<p>Ask for Aziz &amp; Dilshod</p>')).toBe('Ask for Aziz & Dilshod');
  });

  it('is empty for an empty note', () => {
    expect(richTextToPlain(null)).toBe('');
  });
});
