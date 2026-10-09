-- +goose Up
ALTER TABLE platforms ADD COLUMN icon_uri TEXT;
ALTER TABLE platforms ADD COLUMN wordmark_uri TEXT;

-- +goose Down
ALTER TABLE platforms DROP COLUMN wordmark_uri;
ALTER TABLE platforms DROP COLUMN icon_uri;
