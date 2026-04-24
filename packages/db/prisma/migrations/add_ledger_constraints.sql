-- Deferred trigger: at commit time of any transaction that touched ledger_postings,
-- every entry it touched must sum to zero per-currency.
CREATE OR REPLACE FUNCTION ledger_enforce_balanced_entry() RETURNS TRIGGER AS $$
DECLARE
  unbalanced RECORD;
BEGIN
  FOR unbalanced IN
    SELECT p."entryId", p.currency, SUM(p.amount) AS total
      FROM ledger_postings p
      WHERE p."entryId" IN (
        SELECT DISTINCT "entryId" FROM ledger_postings WHERE "createdAt" >= now() - INTERVAL '1 second'
      )
      GROUP BY p."entryId", p.currency
      HAVING SUM(p.amount) <> 0
  LOOP
    RAISE EXCEPTION 'ledger entry % is not balanced (currency %, sum %)',
      unbalanced."entryId", unbalanced.currency, unbalanced.total
      USING ERRCODE = 'P0001';
  END LOOP;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ledger_enforce_balanced ON ledger_postings;

CREATE CONSTRAINT TRIGGER trg_ledger_enforce_balanced
  AFTER INSERT OR UPDATE OR DELETE ON ledger_postings
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION ledger_enforce_balanced_entry();

-- Posting currency must match its account's currency.
ALTER TABLE ledger_postings
  DROP CONSTRAINT IF EXISTS chk_posting_currency_matches_account;

CREATE OR REPLACE FUNCTION ledger_check_posting_currency() RETURNS TRIGGER AS $$
DECLARE
  acct_currency text;
  entry_currency text;
BEGIN
  SELECT currency INTO acct_currency FROM ledger_accounts WHERE id = NEW."accountId";
  SELECT currency INTO entry_currency FROM ledger_entries WHERE id = NEW."entryId";
  IF acct_currency IS NULL THEN
    RAISE EXCEPTION 'account % not found', NEW."accountId";
  END IF;
  IF acct_currency <> NEW.currency THEN
    RAISE EXCEPTION 'posting currency % does not match account currency %', NEW.currency, acct_currency
      USING ERRCODE = 'P0001';
  END IF;
  IF entry_currency <> NEW.currency THEN
    RAISE EXCEPTION 'posting currency % does not match entry currency %', NEW.currency, entry_currency
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ledger_check_posting_currency ON ledger_postings;

CREATE TRIGGER trg_ledger_check_posting_currency
  BEFORE INSERT OR UPDATE ON ledger_postings
  FOR EACH ROW
  EXECUTE FUNCTION ledger_check_posting_currency();
