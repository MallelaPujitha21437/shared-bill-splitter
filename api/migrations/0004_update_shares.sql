
-- Recreate shares to support zero-cent shares and store payment keys.
CREATE TABLE shares_new (
    id TEXT PRIMARY KEY,
    bill_id TEXT NOT NULL,
    member_id TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    paid_at TEXT DEFAULT NULL,
    idempotency_key TEXT DEFAULT NULL,

    CONSTRAINT fk_shares_bill
        FOREIGN KEY (bill_id) REFERENCES bills(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_shares_member
        FOREIGN KEY (member_id) REFERENCES members(id)
        ON DELETE CASCADE,

    CONSTRAINT chk_shares_amount_nonnegative
        CHECK (amount_cents >= 0),

    CONSTRAINT uq_bill_member
        UNIQUE (bill_id, member_id)
);

-- Copy existing share records into the new table.
INSERT INTO shares_new (
    id,
    bill_id,
    member_id,
    amount_cents,
    paid_at
)
SELECT
    id,
    bill_id,
    member_id,
    amount_cents,
    paid_at
FROM shares;

-- Replace the old table.
DROP TABLE shares;

ALTER TABLE shares_new RENAME TO shares;
