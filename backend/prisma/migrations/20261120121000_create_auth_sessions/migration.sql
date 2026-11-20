CREATE TABLE "AuthSession" (
  "tokenHash" CHAR(64) NOT NULL,
  "userId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("tokenHash"),
  CONSTRAINT "AuthSession_tokenHash_valid" CHECK ("tokenHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "AuthSession_lifetime_positive" CHECK ("expiresAt" > "createdAt"),
  CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");
