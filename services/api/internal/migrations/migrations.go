// Package migrations owns the database schema as an ordered set of
// embedded goose SQL migrations, applied at startup before any repository
// opens its connection pool. It is the single source of truth for the
// schema: repositories never create their own tables.
package migrations

import (
	"context"
	"database/sql"
	"embed"
	"fmt"
	"io/fs"

	"github.com/pressly/goose/v3"

	_ "modernc.org/sqlite"
)

//go:embed migrations/*.sql
var embedded embed.FS

// dsn carries the same pragmas every repository opens with, so the
// migration connection and every later connection agree on foreign key
// enforcement and journal mode.
const dsn = "?_pragma=foreign_keys(1)&_pragma=journal_mode(WAL)"

// Up applies all pending migrations to an already-open database
// connection. It does not close db.
func Up(ctx context.Context, db *sql.DB) error {
	sub, err := fs.Sub(embedded, "migrations")
	if err != nil {
		return fmt.Errorf("migrations: sub fs: %w", err)
	}
	provider, err := goose.NewProvider(goose.DialectSQLite3, db, sub)
	if err != nil {
		return fmt.Errorf("migrations: new provider: %w", err)
	}
	if _, err := provider.Up(ctx); err != nil {
		return fmt.Errorf("migrations: up: %w", err)
	}
	return nil
}

// Apply opens the database at path, applies all pending migrations, and
// closes it. It is the one-shot entry point for startup (main), which then
// opens its own long-lived pool against the migrated file.
func Apply(ctx context.Context, path string) error {
	db, err := sql.Open("sqlite", path+dsn)
	if err != nil {
		return fmt.Errorf("migrations: open db: %w", err)
	}
	defer db.Close()
	// SQLite permits a single writer; match the long-lived pool opened by
	// main after migrating.
	db.SetMaxOpenConns(1)

	return Up(ctx, db)
}
