import { ConfigService } from '@nestjs/config';
import { EmailService, maskEmail } from './email.service';

function serviceWith(env: Record<string, string> = {}) {
  return new EmailService({ get: (key: string) => env[key] } as unknown as ConfigService);
}

describe('EmailService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('reports unconfigured and sends nothing without an API key', async () => {
    // The state local development and CI run in. It must not throw, and it must
    // not pretend: the caller decides what an unsent code means.
    const fetchSpy = jest.spyOn(global, 'fetch');
    const service = serviceWith({});

    expect(service.isConfigured).toBe(false);
    await expect(service.sendCode('a@b.co', '123456', 'registration')).resolves.toEqual({
      sent: false,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('posts to Resend with the verified sender and the code in both parts', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{"id":"x"}', { status: 200 }));
    const service = serviceWith({ RESEND_API_KEY: 'test-key' });

    await expect(service.sendCode('a@b.co', '123456', 'registration')).resolves.toEqual({
      sent: true,
    });

    const [url, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse(String((init as RequestInit).body));
    expect(url).toBe('https://api.resend.com/emails');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer test-key' });
    expect(body.from).toContain('@email.fotspot.uz');
    expect(body.to).toEqual(['a@b.co']);
    // A client that shows the plain part instead of the HTML must still show a
    // readable code.
    expect(body.html).toContain('123456');
    expect(body.text).toContain('123456');
  });

  it('answers sent:false when Resend refuses, rather than throwing', async () => {
    // An unverified domain and a bad key both land here. The caller decides
    // whether that is fatal — registration refuses, password reset must not.
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('domain not verified', { status: 403 }));
    const service = serviceWith({ RESEND_API_KEY: 'test-key' });

    await expect(service.sendCode('a@b.co', '123456', 'registration')).resolves.toEqual({
      sent: false,
    });
  });

  it('answers sent:false when Resend cannot be reached', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'));
    const service = serviceWith({ RESEND_API_KEY: 'test-key' });

    await expect(service.sendCode('a@b.co', '123456', 'password-reset')).resolves.toEqual({
      sent: false,
    });
  });

  it('masks an address enough to recognise but not to harvest', () => {
    // Addresses reach logs; one-time codes never do.
    expect(maskEmail('javohir@gmail.com')).toBe('j*****r@gmail.com');
    expect(maskEmail('ab@x.uz')).toBe('a*b@x.uz');
    expect(maskEmail('not-an-address')).toBe('***');
  });
});

describe('the logo', () => {
  it('is served from APP_PUBLIC_URL, next to the rest of the site', async () => {
    const fetchMock = jest.fn(async () => new Response('{}', { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const service = serviceWith({
      RESEND_API_KEY: 'key',
      APP_PUBLIC_URL: 'https://www.example.uz/',
    });

    await service.sendCode('someone@example.com', '123456', 'registration');

    const body = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body,
    );
    expect(body.html).toContain('<img src="https://www.example.uz/fotspot.png"');
    expect(body.html).toContain('alt="FotSpot"');
  });

  /* An `<img>` at localhost is a broken box in every inbox it reaches. */
  it('is left out, not broken, when the site address is not configured', async () => {
    const fetchMock = jest.fn(async () => new Response('{}', { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const service = serviceWith({ RESEND_API_KEY: 'key' });

    await service.sendCode('someone@example.com', '123456', 'registration');

    const body = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body,
    );
    expect(body.html).not.toContain('<img');
    expect(body.html).toContain('123456');
  });
});
