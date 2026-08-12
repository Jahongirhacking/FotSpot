-- The academy's own shop window: where it is, what it looks like, who it shows off.

-- Where the academy actually is. `region`/`district` are the search buckets; a
-- parent driving their child there on a Saturday needs the point on a map.
-- Nullable together and written together — half a coordinate is a place in the
-- Gulf of Guinea.
ALTER TABLE "AcademyProfile" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "AcademyProfile" ADD COLUMN "longitude" DOUBLE PRECISION;

-- R2 object key, never a URL — see storage.keys.ts.
ALTER TABLE "AcademyProfile" ADD COLUMN "logoKey" TEXT;

-- Four columns rather than a Json blob: the allowed set is fixed, and a column
-- is something a validator can check the host of. A blob accepts anything.
ALTER TABLE "AcademyProfile" ADD COLUMN "telegramUrl" TEXT;
ALTER TABLE "AcademyProfile" ADD COLUMN "facebookUrl" TEXT;
ALTER TABLE "AcademyProfile" ADD COLUMN "instagramUrl" TEXT;
ALTER TABLE "AcademyProfile" ADD COLUMN "youtubeUrl" TEXT;

-- Coordinates are only meaningful in range, and a swapped pair is the classic
-- way to end up off the coast of Africa. Checked here so no code path can store
-- one, whatever the DTO of the day says.
ALTER TABLE "AcademyProfile" ADD CONSTRAINT "academy_latitude_range" CHECK (
    "latitude" IS NULL OR ("latitude" >= -90 AND "latitude" <= 90)
);
ALTER TABLE "AcademyProfile" ADD CONSTRAINT "academy_longitude_range" CHECK (
    "longitude" IS NULL OR ("longitude" >= -180 AND "longitude" <= 180)
);
-- Both or neither: one coordinate locates nothing.
ALTER TABLE "AcademyProfile" ADD CONSTRAINT "academy_location_complete" CHECK (
    ("latitude" IS NULL) = ("longitude" IS NULL)
);

-- The gallery. Its own table because a photo carries an order the manager chose
-- and a caption they wrote, neither of which a string array can hold.
CREATE TABLE "AcademyPhoto" (
    "id" TEXT NOT NULL,
    "academyId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "caption" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademyPhoto_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AcademyPhoto_academyId_sortOrder_idx" ON "AcademyPhoto"("academyId", "sortOrder");

ALTER TABLE "AcademyPhoto" ADD CONSTRAINT "AcademyPhoto_academyId_fkey"
    FOREIGN KEY ("academyId") REFERENCES "AcademyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The people the academy chooses to feature.
--
-- Rows point at a *membership*, not a user, so that leaving the academy takes
-- somebody off the wall through the cascade rather than through a job that has
-- to remember. Featuring a coach who left last season is the specific
-- embarrassment this avoids.
CREATE TABLE "AcademyFeatured" (
    "academyId" TEXT NOT NULL,
    "role" "AcademyMemberRole" NOT NULL,
    "memberId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademyFeatured_pkey" PRIMARY KEY ("academyId", "role", "rank")
);

-- One person cannot hold two slots in the same list.
CREATE UNIQUE INDEX "AcademyFeatured_academyId_role_memberId_key"
    ON "AcademyFeatured"("academyId", "role", "memberId");
CREATE INDEX "AcademyFeatured_memberId_idx" ON "AcademyFeatured"("memberId");

-- 1-based, and the caps (10 players / 5 coaches / 3 scouts) are enforced in the
-- service, where they are a product decision that can change without a
-- migration. This only guards the shape.
ALTER TABLE "AcademyFeatured" ADD CONSTRAINT "academy_featured_rank_positive" CHECK ("rank" >= 1);

ALTER TABLE "AcademyFeatured" ADD CONSTRAINT "AcademyFeatured_academyId_fkey"
    FOREIGN KEY ("academyId") REFERENCES "AcademyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AcademyFeatured" ADD CONSTRAINT "AcademyFeatured_memberId_fkey"
    FOREIGN KEY ("memberId") REFERENCES "AcademyMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
