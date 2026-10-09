-- +goose Up
CREATE TABLE platforms (
    id   TEXT PRIMARY KEY,
    name TEXT NOT NULL
) STRICT;

-- +goose Down
DROP TABLE platforms;
