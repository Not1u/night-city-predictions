ALTER TABLE users ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0 CHECK(disabled IN (0,1));
CREATE TABLE password_credentials (
 user_id TEXT PRIMARY KEY REFERENCES users(id), password_hash TEXT NOT NULL,
 recovery_hash TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE auth_limits (
 bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL
);
CREATE INDEX idx_auth_limits_expiry ON auth_limits(expires);
CREATE TABLE account_claims (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL
);
