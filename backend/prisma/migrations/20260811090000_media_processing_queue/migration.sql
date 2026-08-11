-- Clips are finalised by a worker, not by the client's word.

-- PROCESSING and FAILED join the existing states. Postgres cannot add an enum
-- value inside a transaction that then uses it, so the values land first and the
-- column default is moved afterwards.
ALTER TYPE "MediaStatus" ADD VALUE IF NOT EXISTS 'PROCESSING' BEFORE 'ACTIVE';
ALTER TYPE "MediaStatus" ADD VALUE IF NOT EXISTS 'FAILED' AFTER 'ACTIVE';
