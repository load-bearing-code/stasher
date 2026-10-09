-- +goose Up
CREATE TABLE studios (
    id   TEXT PRIMARY KEY,
    name TEXT NOT NULL
) STRICT;

-- +goose Down
DROP TABLE studios;
