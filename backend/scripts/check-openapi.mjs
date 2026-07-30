#!/usr/bin/env node
/**
 * Fails if `openapi.json` no longer matches the code.
 *
 * This is the "keep the docs in sync" mechanism: the spec is generated from the
 * controllers and DTOs, so the only way it can be wrong is if someone changed a
 * route and didn't regenerate. Run it in CI and that becomes a review comment
 * instead of a surprise for whoever is integrating against the API.
 *
 * Exits 0 if in sync, 1 with a diff summary if not.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, copyFileSync, rmSync } from 'node:fs';

const SPEC = 'openapi.json';
const BACKUP = 'openapi.json.pre-check';

if (!existsSync(SPEC)) {
  console.error(`${SPEC} is missing. Run: pnpm docs:generate`);
  process.exit(1);
}

const committed = readFileSync(SPEC, 'utf8');
copyFileSync(SPEC, BACKUP);

try {
  execFileSync('npx', ['nest', 'build'], { stdio: 'inherit' });
  execFileSync('node', ['dist/src/openapi.js'], { stdio: 'inherit' });

  const regenerated = readFileSync(SPEC, 'utf8');

  if (regenerated === committed) {
    console.log('openapi.json is up to date.');
    process.exit(0);
  }

  // Restore, so a failing check never leaves the working tree modified.
  copyFileSync(BACKUP, SPEC);

  console.error(
    '\nopenapi.json is out of date — the API changed but the spec was not regenerated.',
  );
  console.error(summarise(JSON.parse(committed), JSON.parse(regenerated)));
  console.error('\nFix with: pnpm docs:generate   (then commit openapi.json)');
  process.exit(1);
} finally {
  rmSync(BACKUP, { force: true });
}

/** Human-readable summary of which operations were added, removed or changed. */
function summarise(before, after) {
  const ops = (doc) =>
    new Set(
      Object.entries(doc.paths ?? {}).flatMap(([path, methods]) =>
        Object.keys(methods).map((method) => `${method.toUpperCase()} ${path}`),
      ),
    );

  const oldOps = ops(before);
  const newOps = ops(after);

  const added = [...newOps].filter((op) => !oldOps.has(op));
  const removed = [...oldOps].filter((op) => !newOps.has(op));

  const lines = [];
  if (added.length) lines.push(`\n  added (${added.length}):`, ...added.map((o) => `    + ${o}`));
  if (removed.length)
    lines.push(`\n  removed (${removed.length}):`, ...removed.map((o) => `    - ${o}`));
  if (!added.length && !removed.length) {
    lines.push('\n  same operations, but a schema, description or response changed.');
  }
  return lines.join('\n');
}
