-- New accounts opt in to weekly digests (existing rows keep their value).
ALTER TABLE "User" ALTER COLUMN "weeklyDigestEnabled" SET DEFAULT false;
