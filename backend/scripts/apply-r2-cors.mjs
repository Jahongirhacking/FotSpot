#!/usr/bin/env node
/**
 * Applies `r2-cors.json` to the R2 bucket.
 *
 * ## Why this is needed at all
 *
 * The browser uploads straight to R2 with a presigned URL, so the video never
 * transits the API — the right shape for users on mobile data (README §14). The
 * cost is that the PUT is cross-origin, and **an R2 bucket has no CORS policy
 * until someone sets one**. Without it the browser blocks the request before it
 * is sent, `fetch` rejects with "Failed to fetch", and there is no status code to
 * diagnose from.
 *
 * This is not run automatically. Bucket configuration is deployment state, not
 * something an API server should rewrite on boot — and it needs credentials with
 * more authority than the object-level token the app itself uses.
 *
 *     node scripts/apply-r2-cors.mjs           # apply
 *     node scripts/apply-r2-cors.mjs --check   # print the current policy only
 *
 * Origins come from `R2_CORS_ORIGINS` (comma-separated) when set, otherwise from
 * `r2-cors.json`. The override exists because the list is environment-specific
 * and easy to get wrong in a way that fails identically to having no policy at
 * all: the backend takes port 3000 here, so `next dev` falls back to **3001**,
 * and a policy naming only 3000 blocks every upload while looking correct.
 *
 * The app's own R2 token usually lacks bucket-configuration rights and will get
 * AccessDenied here. Either use an Account-level R2 token with admin
 * permissions, or paste `r2-cors.json` into the Cloudflare dashboard under
 * R2 → your bucket → Settings → CORS Policy.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GetBucketCorsCommand, PutBucketCorsCommand, S3Client } from '@aws-sdk/client-s3';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function env() {
  const raw = readFileSync(join(root, '.env'), 'utf8');
  const parsed = Object.fromEntries(
    raw
      .split('\n')
      .filter((line) => line.includes('=') && !line.trimStart().startsWith('#'))
      .map((line) => {
        const at = line.indexOf('=');
        return [line.slice(0, at).trim(), line.slice(at + 1).trim().replace(/^"|"$/g, '')];
      }),
  );
  return { ...parsed, ...process.env };
}

const config = env();
const missing = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'].filter(
  (key) => !config[key],
);
if (missing.length) {
  console.error(`Cannot continue — these are unset: ${missing.join(', ')}`);
  process.exit(1);
}

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: config.R2_ACCESS_KEY_ID,
    secretAccessKey: config.R2_SECRET_ACCESS_KEY,
  },
});

const bucket = config.R2_BUCKET;
const checkOnly = process.argv.includes('--check');

try {
  if (checkOnly) {
    const current = await client.send(new GetBucketCorsCommand({ Bucket: bucket }));
    console.log(JSON.stringify(current.CORSRules, null, 2));
    process.exit(0);
  }

  const rules = JSON.parse(readFileSync(join(root, 'r2-cors.json'), 'utf8'));

  const override = (config.R2_CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (override.length) {
    for (const rule of rules) rule.AllowedOrigins = override;
    console.log('Using R2_CORS_ORIGINS from the environment.');
  }
  await client.send(
    new PutBucketCorsCommand({ Bucket: bucket, CORSConfiguration: { CORSRules: rules } }),
  );
  console.log(`Applied ${rules.length} CORS rule(s) to ${bucket}.`);
  console.log('Origins:', rules.flatMap((rule) => rule.AllowedOrigins).join(', '));
} catch (error) {
  console.error(`${error.name}: ${error.message}`);
  if (error.name === 'AccessDenied') {
    console.error(
      '\nThis token cannot change bucket configuration — expected for an object-level\n' +
        'R2 token. Either use an admin R2 token, or paste r2-cors.json into\n' +
        'Cloudflare → R2 → ' +
        bucket +
        ' → Settings → CORS Policy.',
    );
  }
  process.exit(1);
}
