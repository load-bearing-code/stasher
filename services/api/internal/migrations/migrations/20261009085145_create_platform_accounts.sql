-- +goose Up
CREATE TABLE platform_accounts (
    id                BLOB PRIMARY KEY,
    platform_id       TEXT NOT NULL REFERENCES platforms(id),
    platform_user_id  TEXT,
    handle            TEXT NOT NULL COLLATE NOCASE,
    bio               TEXT,
    studio_id         TEXT REFERENCES studios(id),
    created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at        TEXT,
    deleted_at        TEXT,
    UNIQUE (platform_id, platform_user_id),
    UNIQUE (platform_id, handle)
) STRICT;

CREATE TABLE platform_account_performers (
    platform_account_id  BLOB NOT NULL REFERENCES platform_accounts(id) ON DELETE CASCADE,
    performer_id          BLOB NOT NULL REFERENCES performers(id) ON DELETE CASCADE,
    PRIMARY KEY (platform_account_id, performer_id)
) STRICT, WITHOUT ROWID;

-- +goose Down
DROP TABLE platform_account_performers;
DROP TABLE platform_accounts;
