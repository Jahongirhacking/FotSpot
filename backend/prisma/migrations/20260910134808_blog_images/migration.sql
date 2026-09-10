-- CreateTable
CREATE TABLE "BlogPostImage" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT,
    "size" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlogPostImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BlogPostImage_storageKey_key" ON "BlogPostImage"("storageKey");

-- CreateIndex
CREATE INDEX "BlogPostImage_postId_createdAt_idx" ON "BlogPostImage"("postId", "createdAt");

-- AddForeignKey
ALTER TABLE "BlogPostImage" ADD CONSTRAINT "BlogPostImage_postId_fkey" FOREIGN KEY ("postId") REFERENCES "BlogPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
