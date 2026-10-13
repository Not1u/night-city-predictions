PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY, display_name TEXT NOT NULL CHECK(length(display_name) BETWEEN 1 AND 40),
  provider_subject TEXT UNIQUE, role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')),
  created_at TEXT NOT NULL
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL, created_at TEXT NOT NULL, revoked_at TEXT
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE TABLE wallets (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  balance INTEGER NOT NULL DEFAULT 0 CHECK(typeof(balance) = 'integer' AND balance BETWEEN 0 AND 1000000000),
  version INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE characters (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, codename TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('crew','associated','memory')),
  bio TEXT NOT NULL DEFAULT '', image_url TEXT, death_image_url TEXT, source_url TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE rounds (
  id TEXT PRIMARY KEY, episode INTEGER NOT NULL UNIQUE CHECK(episode > 0), title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','open','closed','result_pending','settled','refunded')),
  opens_at TEXT, closes_at TEXT, previous_round_id TEXT UNIQUE REFERENCES rounds(id),
  created_at TEXT NOT NULL,
  CHECK(previous_round_id IS NULL OR previous_round_id <> id),
  CHECK(status = 'draft' OR (opens_at IS NOT NULL AND closes_at IS NOT NULL)),
  CHECK(opens_at IS NULL OR closes_at IS NULL OR opens_at < closes_at)
);
CREATE TABLE round_characters (
  round_id TEXT NOT NULL REFERENCES rounds(id), character_id TEXT NOT NULL REFERENCES characters(id),
  opening_numerator INTEGER NOT NULL DEFAULT 1 CHECK(typeof(opening_numerator) = 'integer' AND opening_numerator > 0),
  opening_denominator INTEGER NOT NULL DEFAULT 1 CHECK(typeof(opening_denominator) = 'integer' AND opening_denominator > 0),
  PRIMARY KEY(round_id, character_id)
);
CREATE TABLE predictions (
  id TEXT PRIMARY KEY, round_id TEXT NOT NULL, character_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  amount INTEGER NOT NULL CHECK(typeof(amount) = 'integer' AND amount BETWEEN 1 AND 1000000000),
  created_at TEXT NOT NULL,
  FOREIGN KEY(round_id, character_id) REFERENCES round_characters(round_id, character_id)
);
CREATE INDEX predictions_round_character ON predictions(round_id, character_id);
CREATE INDEX predictions_user_time ON predictions(user_id, created_at DESC, id DESC);
CREATE TABLE round_snapshots (
  round_id TEXT PRIMARY KEY REFERENCES rounds(id),
  pool_total INTEGER NOT NULL CHECK(typeof(pool_total) = 'integer' AND pool_total >= 0),
  snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)), frozen_at TEXT NOT NULL
);
CREATE TRIGGER snapshots_no_update BEFORE UPDATE ON round_snapshots BEGIN SELECT RAISE(ABORT, 'snapshot is immutable'); END;
CREATE TRIGGER snapshots_no_delete BEFORE DELETE ON round_snapshots BEGIN SELECT RAISE(ABORT, 'snapshot is immutable'); END;
CREATE TABLE death_results (
  round_id TEXT NOT NULL, character_id TEXT NOT NULL, confirmed_by TEXT NOT NULL REFERENCES users(id),
  confirmed_at TEXT NOT NULL, source_note TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision > 0),
  PRIMARY KEY(round_id, character_id),
  FOREIGN KEY(round_id, character_id) REFERENCES round_characters(round_id, character_id)
);
CREATE TABLE result_confirmations (
  round_id TEXT PRIMARY KEY REFERENCES rounds(id), revision INTEGER NOT NULL CHECK(revision > 0),
  confirmed_by TEXT NOT NULL REFERENCES users(id), confirmed_at TEXT NOT NULL, source_note TEXT NOT NULL
);
CREATE TABLE settlements (
  round_id TEXT PRIMARY KEY REFERENCES round_snapshots(round_id),
  status TEXT NOT NULL CHECK(status IN ('settled','refunded')),
  pool_total INTEGER NOT NULL CHECK(typeof(pool_total) = 'integer' AND pool_total >= 0),
  winning_stake INTEGER NOT NULL CHECK(typeof(winning_stake) = 'integer' AND winning_stake >= 0),
  returned_total INTEGER NOT NULL CHECK(typeof(returned_total) = 'integer' AND returned_total = pool_total),
  settled_by TEXT NOT NULL REFERENCES users(id), settled_at TEXT NOT NULL
);
CREATE TABLE payouts (
  prediction_id TEXT PRIMARY KEY REFERENCES predictions(id), round_id TEXT NOT NULL REFERENCES settlements(round_id),
  amount INTEGER NOT NULL CHECK(typeof(amount) = 'integer' AND amount >= 0)
);
CREATE TABLE ledger (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK(kind IN ('check_in','prediction','settlement','refund','activity_reward')),
  delta INTEGER NOT NULL CHECK(typeof(delta) = 'integer' AND delta <> 0),
  balance_after INTEGER NOT NULL CHECK(typeof(balance_after) = 'integer' AND balance_after BETWEEN 0 AND 1000000000),
  round_id TEXT REFERENCES rounds(id), prediction_id TEXT REFERENCES predictions(id),
  reference_id TEXT NOT NULL, created_at TEXT NOT NULL,
  UNIQUE(user_id, kind, reference_id)
);
CREATE INDEX ledger_user_time ON ledger(user_id, created_at DESC, id DESC);
CREATE TRIGGER ledger_no_update BEFORE UPDATE ON ledger BEGIN SELECT RAISE(ABORT, 'ledger is append only'); END;
CREATE TRIGGER ledger_no_delete BEFORE DELETE ON ledger BEGIN SELECT RAISE(ABORT, 'ledger is append only'); END;
CREATE TABLE check_ins (
  user_id TEXT NOT NULL REFERENCES users(id), utc_date TEXT NOT NULL,
  ledger_id TEXT NOT NULL UNIQUE REFERENCES ledger(id), PRIMARY KEY(user_id, utc_date)
);
CREATE TABLE idempotency_keys (
  user_id TEXT NOT NULL REFERENCES users(id), key TEXT NOT NULL CHECK(length(key) BETWEEN 8 AND 128),
  method TEXT NOT NULL, path TEXT NOT NULL, request_hash TEXT NOT NULL,
  response_json TEXT NOT NULL CHECK(json_valid(response_json)), status_code INTEGER NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY(user_id, key)
);
CREATE TABLE comments (
  id TEXT PRIMARY KEY, character_id TEXT NOT NULL REFERENCES characters(id), user_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 500),
  status TEXT NOT NULL DEFAULT 'visible' CHECK(status IN ('visible','hidden')), created_at TEXT NOT NULL
);
CREATE INDEX comments_character_time ON comments(character_id, status, created_at DESC, id DESC);
CREATE TABLE comment_reports (
  id TEXT PRIMARY KEY, comment_id TEXT NOT NULL REFERENCES comments(id), reporter_id TEXT NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL CHECK(reason IN ('spoiler','abuse','spam','other')), detail TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','resolved','dismissed')),
  created_at TEXT NOT NULL, UNIQUE(comment_id, reporter_id)
);
CREATE TABLE admin_step_up_proofs (
  token_hash TEXT PRIMARY KEY, admin_id TEXT NOT NULL REFERENCES users(id), session_hash TEXT NOT NULL REFERENCES sessions(token_hash),
  action TEXT NOT NULL, target_id TEXT NOT NULL, payload_hash TEXT NOT NULL, expires_at TEXT NOT NULL, consumed_at TEXT
);
CREATE TABLE admin_audit (
  id TEXT PRIMARY KEY, actor_id TEXT NOT NULL REFERENCES users(id), action TEXT NOT NULL, target_id TEXT NOT NULL,
  request_id TEXT NOT NULL UNIQUE, before_json TEXT NOT NULL CHECK(json_valid(before_json)),
  after_json TEXT NOT NULL CHECK(json_valid(after_json)), created_at TEXT NOT NULL
);
CREATE INDEX audit_time ON admin_audit(created_at DESC, id DESC);
CREATE TRIGGER audit_no_update BEFORE UPDATE ON admin_audit BEGIN SELECT RAISE(ABORT, 'audit is append only'); END;
CREATE TRIGGER audit_no_delete BEFORE DELETE ON admin_audit BEGIN SELECT RAISE(ABORT, 'audit is append only'); END;
