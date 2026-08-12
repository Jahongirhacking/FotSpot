#!/usr/bin/env node
/**
 * Proves the storage tiers actually behave the way the code assumes.
 *
 * ## The failure this exists to catch
 *
 * Public objects were being written to the private bucket and linked from the
 * public host. Every part of that looked healthy: the presigned PUT succeeded,
 * the row was saved, the URL was well-formed and pointed at a real domain. The
 * only symptom was a broken image, in a UI that already falls back to initials
 * when an avatar is missing — so nothing looked wrong anywhere a developer was
 * looking. No unit test can see this, because the bug lives in the gap between
 * two pieces of configuration that are each individually fine.
 *
 * So this does the round trip for real: writes an object, fetches it back the way
 * a browser would, and deletes it.
 *
 *     node scripts/check-r2.mjs      # or: pnpm r2:check
 *
 * Two assertions, and the second matters more than the first:
 *
 * 1. A `public/` object is written to the public bucket and **is** reachable at
 *    `R2_PUBLIC_BASE_URL`. This is the broken-avatar check.
 * 2. A `private/` object is written to the private bucket and is **not**
 *    reachable at that host, but **is** through a signed URL. This is the
 *    leak check: if the public bucket is the same bucket and its public read is
 *    not scoped to `public/`, every player's clips are anonymously downloadable
 *    and this is the only thing that would tell you.
 *
 * Probe objects are written under `.r2-check/`, are tiny, and are deleted on the
 * way out — including when an assertion fails.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

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
const missing = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_PUBLIC_BASE_URL',
].filter((key) => !config[key]);
if (missing.length) {
  console.error(`Cannot continue — these are unset: ${missing.join(', ')}`);
  process.exit(1);
}

// `R2_BUCKET` is the former name for the private bucket, read here for the same
// reason StorageService still reads it: an environment that has not been renamed
// should keep working rather than fail a check that is about something else.
const privateBucket = (config.R2_PRIVATE_BUCKET || config.R2_BUCKET || '').trim();
const publicBucket = (config.R2_PUBLIC_BUCKET ?? '').trim() || privateBucket;

if (!privateBucket) {
  console.error('Cannot continue — R2_PRIVATE_BUCKET is unset.');
  process.exit(1);
}
const publicBase = config.R2_PUBLIC_BASE_URL.replace(/\/+$/, '');

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: config.R2_ACCESS_KEY_ID,
    secretAccessKey: config.R2_SECRET_ACCESS_KEY,
  },
});

const body = `fotspot storage check ${randomUUID()}`;
const run = randomUUID();
const probes = [
  { tier: 'public', bucket: publicBucket, key: `public/.r2-check/${run}.txt` },
  { tier: 'private', bucket: privateBucket, key: `private/.r2-check/${run}.txt` },
];

const failures = [];
const written = [];

function report(ok, message) {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${message}`);
  if (!ok) failures.push(message);
}

console.log(
  publicBucket === privateBucket
    ? `Single bucket "${privateBucket}" for both tiers, public host ${publicBase}\n`
    : `private "${privateBucket}" · public "${publicBucket}" at ${publicBase}\n`,
);

try {
  for (const probe of probes) {
    try {
      await client.send(
        new PutObjectCommand({
          Bucket: probe.bucket,
          Key: probe.key,
          Body: body,
          ContentType: 'text/plain',
        }),
      );
      written.push(probe);
      report(true, `wrote ${probe.tier} probe to ${probe.bucket}`);
    } catch (error) {
      // The token not covering both buckets is the single likeliest way a
      // two-bucket setup is misconfigured, and it is worth saying plainly rather
      // than letting it surface later as a failed upload for one user.
      report(
        false,
        `cannot write to ${probe.bucket} (${error.name}) — the R2 API token must be ` +
          'authorized for both buckets',
      );
    }
  }

  for (const probe of written) {
    const url = `${publicBase}/${probe.key}`;
    let status = 0;
    try {
      const response = await fetch(url, { redirect: 'manual' });
      status = response.status;
    } catch (error) {
      report(false, `${publicBase} is unreachable (${error.message})`);
      break;
    }

    if (probe.tier === 'public') {
      report(
        status === 200,
        status === 200
          ? `public probe is served at ${publicBase} (200)`
          : `public probe is NOT served at ${publicBase} (${status}) — R2_PUBLIC_BUCKET is not ` +
              'the bucket that host serves, so every avatar and academy image will 404',
      );
    } else {
      report(
        status === 404 || status === 403,
        status === 200
          ? `private probe IS served at ${publicBase} — clips are anonymously downloadable; ` +
              'scope public read to public/ or use a separate public bucket'
          : `private probe is not served at ${publicBase} (${status})`,
      );
    }
  }

  const privateProbe = written.find((probe) => probe.tier === 'private');
  if (privateProbe) {
    const signed = await getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: privateProbe.bucket, Key: privateProbe.key }),
      { expiresIn: 60 },
    );
    const response = await fetch(signed);
    report(response.status === 200, `signed URL reads the private probe (${response.status})`);
  }
} finally {
  for (const probe of written) {
    await client
      .send(new DeleteObjectCommand({ Bucket: probe.bucket, Key: probe.key }))
      .catch((error) => console.error(`could not delete ${probe.key}: ${error.name}`));
  }
}

console.log(failures.length ? `\n${failures.length} check(s) failed.` : '\nAll checks passed.');
process.exit(failures.length ? 1 : 0);
