
CREATE TABLE bills (
    id TEXT PRIMARY KEY,
    home_id TEXT NOT NULL,
    title TEXT NOT NULL,
    total_cents INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_bills_home
        FOREIGN KEY (home_id) REFERENCES homes(id)
        ON DELETE CASCADE,
    CONSTRAINT chk_bills_total_positive
        CHECK (total_cents > 0)
);

CREATE TABLE shares (
    id TEXT PRIMARY KEY,
    bill_id TEXT NOT NULL,
    member_id TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    paid_at TEXT DEFAULT NULL,
    CONSTRAINT fk_shares_bill
        FOREIGN KEY (bill_id) REFERENCES bills(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_shares_member
        FOREIGN KEY (member_id) REFERENCES members(id)
        ON DELETE CASCADE,
    CONSTRAINT chk_shares_amount_positive
        CHECK (amount_cents > 0),
    CONSTRAINT uq_bill_member
        UNIQUE (bill_id, member_id)
);
