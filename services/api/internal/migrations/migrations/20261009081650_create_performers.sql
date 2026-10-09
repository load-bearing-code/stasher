-- +goose Up
CREATE TABLE performers (
    id              BLOB PRIMARY KEY,
    name            TEXT NOT NULL,
    disambiguation  TEXT,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT,
    deleted_at      TEXT
) STRICT;

CREATE TABLE performer_aliases (
    performer_id  BLOB NOT NULL REFERENCES performers(id) ON DELETE CASCADE,
    name          TEXT NOT NULL COLLATE NOCASE,
    PRIMARY KEY (performer_id, name)
) STRICT, WITHOUT ROWID;

CREATE TABLE performer_studios (
    performer_id  BLOB NOT NULL REFERENCES performers(id) ON DELETE CASCADE,
    studio_id     TEXT NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
    PRIMARY KEY (performer_id, studio_id)
) STRICT, WITHOUT ROWID;

CREATE INDEX idx_performer_studios_studio ON performer_studios(studio_id);

-- +goose Down
DROP INDEX idx_performer_studios_studio;
DROP TABLE performer_studios;
DROP TABLE performer_aliases;
DROP TABLE performers;
