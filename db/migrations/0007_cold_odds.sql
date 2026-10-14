-- Preserve existing accepted formal rounds. Drafts and the refundable sandbox adopt v2.
ALTER TABLE rounds ADD COLUMN payout_rule TEXT NOT NULL DEFAULT 'stake-v1'
  CHECK(payout_rule IN ('stake-v1','cold-v2'));
UPDATE rounds SET payout_rule='cold-v2' WHERE status='draft' OR (is_test=1 AND status='open');
CREATE TRIGGER frozen_payout_rule BEFORE UPDATE OF payout_rule ON rounds
WHEN EXISTS(SELECT 1 FROM round_snapshots WHERE round_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'FROZEN_PAYOUT_RULE'); END;
