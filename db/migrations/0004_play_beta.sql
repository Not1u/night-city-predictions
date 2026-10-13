ALTER TABLE users ADD COLUMN username_key TEXT;
CREATE UNIQUE INDEX users_username ON users(username_key) WHERE username_key IS NOT NULL;
ALTER TABLE rounds ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0 CHECK(is_test IN (0,1));
INSERT INTO rounds(id,episode,title,status,opens_at,closes_at,created_at,is_test)
VALUES('beta-sandbox',999,'试营业测试场 · 随时退回积分','open',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now','+30 days'),strftime('%Y-%m-%dT%H:%M:%fZ','now'),1);
INSERT INTO round_characters(round_id,character_id) SELECT 'beta-sandbox',id FROM characters WHERE category<>'memory';
INSERT INTO characters(id,name,codename,category,bio,created_at,updated_at) VALUES('city-board','夜城公共留言板','CITY','memory','全城公共频道',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
ALTER TABLE predictions ADD COLUMN cancelled_at TEXT;
CREATE TRIGGER prediction_charge AFTER INSERT ON predictions BEGIN
 SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM rounds WHERE id=NEW.round_id AND status='open' AND opens_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now') AND closes_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')) THEN RAISE(ABORT,'ROUND_CLOSED') END);
 SELECT (CASE WHEN EXISTS(SELECT 1 FROM death_results WHERE round_id=NEW.round_id AND character_id=NEW.character_id) THEN RAISE(ABORT,'CHARACTER_INELIGIBLE') END);
 SELECT (CASE WHEN COALESCE((SELECT balance FROM wallets WHERE user_id=NEW.user_id),0)<NEW.amount THEN RAISE(ABORT,'INSUFFICIENT_BALANCE') END);
 INSERT INTO ledger(id,user_id,kind,delta,balance_after,round_id,prediction_id,reference_id,created_at) SELECT NEW.id||':stake',NEW.user_id,'prediction',-NEW.amount,balance-NEW.amount,NEW.round_id,NEW.id,NEW.id,NEW.created_at FROM wallets WHERE user_id=NEW.user_id;
 UPDATE wallets SET balance=balance-NEW.amount,version=version+1 WHERE user_id=NEW.user_id;
END;
CREATE TRIGGER test_prediction_refund AFTER UPDATE OF cancelled_at ON predictions WHEN OLD.cancelled_at IS NULL AND NEW.cancelled_at IS NOT NULL BEGIN
 SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM rounds WHERE id=NEW.round_id AND is_test=1) THEN RAISE(ABORT,'FORBIDDEN') END);
 INSERT INTO ledger(id,user_id,kind,delta,balance_after,round_id,prediction_id,reference_id,created_at) SELECT NEW.id||':refund',NEW.user_id,'refund',NEW.amount,balance+NEW.amount,NEW.round_id,NEW.id,NEW.id,NEW.cancelled_at FROM wallets WHERE user_id=NEW.user_id;
 UPDATE wallets SET balance=balance+NEW.amount,version=version+1 WHERE user_id=NEW.user_id;
END;
CREATE TRIGGER comment_throttle BEFORE INSERT ON comments BEGIN
 SELECT (CASE WHEN EXISTS(SELECT 1 FROM comments WHERE user_id=NEW.user_id AND created_at>strftime('%Y-%m-%dT%H:%M:%fZ','now','-10 seconds')) THEN RAISE(ABORT,'RATE_LIMITED') END);
END;
CREATE INDEX comments_user_time ON comments(user_id,created_at);
CREATE TRIGGER report_hide AFTER INSERT ON comment_reports BEGIN
 UPDATE comments SET status='hidden' WHERE id=NEW.comment_id AND (SELECT COUNT(*) FROM comment_reports WHERE comment_id=NEW.comment_id AND status='pending')>=3;
END;
CREATE TABLE game_plays (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), game TEXT NOT NULL CHECK(game IN ('roulette','slots')),
 stake INTEGER NOT NULL CHECK(typeof(stake)='integer' AND stake BETWEEN 1 AND 50),
 payout INTEGER NOT NULL CHECK(typeof(payout)='integer' AND payout BETWEEN 0 AND 2550),
 result_json TEXT NOT NULL CHECK(json_valid(result_json)), created_at TEXT NOT NULL
);
CREATE INDEX game_plays_user_time ON game_plays(user_id,created_at DESC);
CREATE TRIGGER game_charge AFTER INSERT ON game_plays BEGIN
 SELECT (CASE WHEN EXISTS(SELECT 1 FROM game_plays WHERE user_id=NEW.user_id AND id<>NEW.id AND created_at>strftime('%Y-%m-%dT%H:%M:%fZ','now','-3 seconds')) THEN RAISE(ABORT,'RATE_LIMITED') END);
 SELECT (CASE WHEN COALESCE((SELECT balance FROM wallets WHERE user_id=NEW.user_id),0)<NEW.stake THEN RAISE(ABORT,'INSUFFICIENT_BALANCE') END);
 INSERT INTO ledger(id,user_id,kind,delta,balance_after,reference_id,created_at) SELECT NEW.id||':stake',NEW.user_id,'activity_reward',-NEW.stake,balance-NEW.stake,NEW.id||':stake',NEW.created_at FROM wallets WHERE user_id=NEW.user_id;
 UPDATE wallets SET balance=balance-NEW.stake,version=version+1 WHERE user_id=NEW.user_id;
 INSERT INTO ledger(id,user_id,kind,delta,balance_after,reference_id,created_at) SELECT NEW.id||':payout',NEW.user_id,'activity_reward',NEW.payout,balance+NEW.payout,NEW.id||':payout',NEW.created_at FROM wallets WHERE user_id=NEW.user_id AND NEW.payout>0;
 UPDATE wallets SET balance=balance+NEW.payout,version=version+1 WHERE user_id=NEW.user_id;
END;
CREATE TRIGGER game_no_update BEFORE UPDATE ON game_plays BEGIN SELECT RAISE(ABORT,'game is immutable'); END;
CREATE TRIGGER game_no_delete BEFORE DELETE ON game_plays BEGIN SELECT RAISE(ABORT,'game is immutable'); END;
