-- A still frame per clip, so the grid can show covers without loading video.
--
-- Nullable by design: capture happens in the browser and can fail on an
-- unseekable file or a codec it will not decode. A clip with no cover renders a
-- themed placeholder, which is a much better outcome than refusing the upload.
ALTER TABLE "Media" ADD COLUMN "posterKey" TEXT;
