CREATE TABLE user_consents (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  version TEXT NOT NULL,
  accepted_at TEXT NOT NULL
);
