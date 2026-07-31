-- Player clips move from the private tier to the public one.
--
-- A clip now stays reachable until its player deletes it: no signature, no
-- expiry. That is a product decision, and its cost is worth recording where the
-- schema changed — a clip URL, once seen, works for anyone forever until the
-- object is removed. The `private/` tier and the signing machinery remain for the
-- age and identity documents of §12.1, where the trade-off is not the same.
--
-- Safe as a plain key rewrite here: every existing row points at an object that
-- no longer exists in the bucket (all 11 were test uploads, since deleted), so
-- there are no bytes to copy. A deployment holding real objects must copy them
-- from `private/players/…` to `public/players/…` BEFORE running this, because
-- renaming a key does not move what it addresses.

UPDATE "Media"
   SET "storageKey" = 'public/' || substring("storageKey" FROM 9)
 WHERE "storageKey" LIKE 'private/%';

UPDATE "Media"
   SET "posterKey" = 'public/' || substring("posterKey" FROM 9)
 WHERE "posterKey" LIKE 'private/%';
