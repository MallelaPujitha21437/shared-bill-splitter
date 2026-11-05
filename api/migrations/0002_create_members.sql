
CREATE TABLE members (
    id TEXT PRIMARY KEY,
    home_id TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_members_home
        FOREIGN KEY (home_id) REFERENCES homes(id)
        ON DELETE CASCADE
);
