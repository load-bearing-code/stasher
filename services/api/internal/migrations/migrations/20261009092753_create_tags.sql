-- +goose Up
CREATE TABLE tags (
    id          BLOB PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
    description TEXT
) STRICT;

CREATE TABLE performer_tags (
    performer_id  BLOB NOT NULL REFERENCES performers(id) ON DELETE CASCADE,
    tag_id        BLOB NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (performer_id, tag_id)
) STRICT, WITHOUT ROWID;

CREATE INDEX idx_performer_tags_tag ON performer_tags(tag_id);

-- +goose Down
DROP INDEX idx_performer_tags_tag;
DROP TABLE performer_tags;
DROP TABLE tags;
