import { withSentryConfig } from '@sentry/nextjs';
import type { NextConfig } from 'next';

/**
 * One address for the site, and the same one everywhere.
 *
 * `NEXT_PUBLIC_SITE_URL` is what every canonical, JSON-LD id, OpenGraph url
 * and sitemap entry is built from (lib/seo.ts). The redirect below is derived
 * from it, so the code can never send a request to the host the metadata
 * does not name: an apex site URL sends www to the apex, a www site URL sends
 * the apex to www, and a local one redirects nothing.
 *
 * The host in front of the app (Vercel's primary domain, Cloudflare) has its
 * own redirect between the two, and it runs first. It must point the same
 * way as this one — otherwise the two layers bounce a request back and forth
 * for ever. Change the primary domain and this variable together.
 */
function hostRedirect() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (!configured) return [];
  let host: string;
  try {
    host = new URL(configured).host;
  } catch {
    return [];
  }
  const apex = host.replace(/^www\./, '');
  if (!apex.includes('.') || apex.startsWith('localhost')) return [];
  const from = host.startsWith('www.') ? apex : `www.${apex}`;
  return [
    {
      source: '/:path*',
      has: [{ type: 'host' as const, value: from }],
      destination: `https://${host}/:path*`,
      permanent: true,
    },
  ];
}

const nextConfig: NextConfig = {
  async redirects() {
    return hostRedirect();
  },
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: 'rttrm-is',

  project: 'fotspot-web',

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Uncomment to route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  // tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
