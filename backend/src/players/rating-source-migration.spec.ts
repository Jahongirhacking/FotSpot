import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The migration that retires SELF: every row must land on VERIFIED or
 * RELATIVE, and the mapping is the one the card counts by — a coach's number
 * stays verified, everything else (the player's old claim, a moderator's
 * number) is relative and weighs half.
 */
const sql = readFileSync(
  join(
    __dirname,
    '../../prisma/migrations/20260911160000_rating_source_verified_relative/migration.sql',
  ),
  'utf8',
);

describe('rating source migration', () => {
  it('rebuilds the enum with exactly VERIFIED and RELATIVE', () => {
    expect(sql).toContain(`CREATE TYPE "RatingSource_new" AS ENUM ('VERIFIED', 'RELATIVE')`);
    expect(sql).toContain(`DROP TYPE "RatingSource"`);
    expect(sql).toContain(`ALTER TYPE "RatingSource_new" RENAME TO "RatingSource"`);
    expect(sql).not.toMatch(/ADD VALUE/);
  });

  it('maps COACH to VERIFIED and everything else — SELF, ADMIN — to RELATIVE, on every column', () => {
    const conversions =
      sql.match(/CASE "[a-zA-Z]+"::text WHEN 'COACH' THEN 'VERIFIED' ELSE 'RELATIVE' END/g) ?? [];
    expect(conversions.map((c) => c.match(/"([a-zA-Z]+)"/)![1])).toEqual([
      'reportedBy',
      'previousReportedBy',
      'reportedBy',
    ]);
    expect(sql).toContain(`ALTER TABLE "Media" ALTER COLUMN "reportedBy" TYPE`);
    expect(sql).toContain(`ALTER TABLE "RatingRevision" ALTER COLUMN "previousReportedBy" TYPE`);
    expect(sql).toContain(`ALTER TABLE "RatingRevision" ALTER COLUMN "reportedBy" TYPE`);
  });

  it('gives a new clip a relative source by default', () => {
    expect(sql).toContain(`ALTER TABLE "Media" ALTER COLUMN "reportedBy" SET DEFAULT 'RELATIVE'`);
  });
});
