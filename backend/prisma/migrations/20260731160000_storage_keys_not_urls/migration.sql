-- Store object keys, never URLs.
--
-- Two problems with the columns this replaces:
--
--  1. `Media.url` was a permanent, public address for a child's video. Anyone who
--     saw it once — dev tools, a proxy log, a screenshot, a forwarded link — kept
--     access forever, and there was nothing to revoke. Playback now goes through
--     an endpoint that authorizes first and signs a URL valid for minutes.
--  2. A stored URL bakes today's CDN hostname into every row. Moving domain or
--     provider becomes a data migration instead of a config change.
--
-- Keys are re-homed into the two visible tiers at the same time, so the bucket
-- can be configured to serve `public/` and nothing else.

-- Avatars: the one public tier. Existing values are full URLs, so keep everything
-- from `avatars/` onward and drop whatever host preceded it.
ALTER TABLE "User" RENAME COLUMN "avatarUrl" TO "avatarKey";

UPDATE "User"
   SET "avatarKey" = 'public/' || substring("avatarKey" FROM position('avatars/' IN "avatarKey"))
 WHERE "avatarKey" IS NOT NULL
   AND position('avatars/' IN "avatarKey") > 0
   AND "avatarKey" NOT LIKE 'public/%';

-- Anything that did not parse is a URL we cannot turn into a key. Null it rather
-- than keep a value that would render a broken image forever; the user re-uploads.
UPDATE "User" SET "avatarKey" = NULL WHERE "avatarKey" IS NOT NULL AND "avatarKey" NOT LIKE 'public/%';

-- Player media: private, always.
UPDATE "Media" SET "storageKey" = 'private/' || "storageKey" WHERE "storageKey" NOT LIKE 'private/%';

ALTER TABLE "Media" DROP COLUMN "url";
