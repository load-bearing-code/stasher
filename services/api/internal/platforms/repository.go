package platforms

import (
	"context"
	"database/sql"
	"errors"

	"github.com/jmoiron/sqlx"

	"github.com/load-bearing-code/stasher/api/internal/page"
)

// Platform is a site a performer or studio can have an account on (e.g.
// Fansly, OnlyFans). The row set is seeded by migration, not created at
// runtime.
type Platform struct {
	ID          string  `db:"id"`
	Name        string  `db:"name"`
	IconURI     *string `db:"icon_uri"`
	WordmarkURI *string `db:"wordmark_uri"`
}

// Cursor is Platform's position in the name-ordered list Query.platforms
// paginates, letting List resume from it via a keyset query.
func (p *Platform) Cursor() page.Cursor {
	return page.Cursor{Key: p.Name, ID: p.ID}
}

type Repository struct {
	db *sqlx.DB
}

func NewRepository(db *sqlx.DB) *Repository {
	return &Repository{db: db}
}

// List returns one page of platforms ordered by name, requesting
// a.First+1 rows so the service can tell whether another page follows
// without a separate count query.
func (r *Repository) List(ctx context.Context, a page.Args) ([]*Platform, error) {
	query := `SELECT id, name, icon_uri, wordmark_uri FROM platforms`
	args := []any{}
	if a.After != nil {
		query += ` WHERE (name, id) > (?, ?)`
		args = append(args, a.After.Key, a.After.ID)
	}
	query += ` ORDER BY name ASC, id ASC LIMIT ?`
	args = append(args, a.First+1)

	var rows []*Platform
	if err := r.db.SelectContext(ctx, &rows, r.db.Rebind(query), args...); err != nil {
		return nil, err
	}
	return rows, nil
}

// Count returns the total number of platforms, independent of any page
// window, to back Connection.totalCount.
func (r *Repository) Count(ctx context.Context) (int, error) {
	var count int
	if err := r.db.GetContext(ctx, &count, `SELECT COUNT(*) FROM platforms`); err != nil {
		return 0, err
	}
	return count, nil
}

// Create inserts a new platform row and returns it.
func (r *Repository) Create(ctx context.Context, id, name string, iconURI, wordmarkURI *string) (*Platform, error) {
	_, err := r.db.ExecContext(
		ctx,
		r.db.Rebind(`INSERT INTO platforms (id, name, icon_uri, wordmark_uri) VALUES (?, ?, ?, ?)`),
		id,
		name,
		iconURI,
		wordmarkURI,
	)
	if err != nil {
		return nil, err
	}
	return &Platform{ID: id, Name: name, IconURI: iconURI, WordmarkURI: wordmarkURI}, nil
}

// Update changes an existing platform and returns it.
func (r *Repository) Update(ctx context.Context, id, name string, iconURI, wordmarkURI *string) (*Platform, error) {
	_, err := r.db.ExecContext(
		ctx,
		r.db.Rebind(`UPDATE platforms SET name = ?, icon_uri = ?, wordmark_uri = ? WHERE id = ?`),
		name,
		iconURI,
		wordmarkURI,
		id,
	)
	if err != nil {
		return nil, err
	}
	return &Platform{ID: id, Name: name, IconURI: iconURI, WordmarkURI: wordmarkURI}, nil
}

// Get returns the platform matching id if given, else name. It returns nil,
// nil if no row matches.
func (r *Repository) Get(ctx context.Context, id, name *string) (*Platform, error) {
	var query string
	var arg string
	if id != nil {
		query, arg = `SELECT id, name, icon_uri, wordmark_uri FROM platforms WHERE id = ?`, *id
	} else {
		query, arg = `SELECT id, name, icon_uri, wordmark_uri FROM platforms WHERE name = ?`, *name
	}

	var row Platform
	if err := r.db.GetContext(ctx, &row, r.db.Rebind(query), arg); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &row, nil
}

// Delete removes the platform matching id, and reports whether a row was
// affected. It fails if any platform_accounts row still references it.
func (r *Repository) Delete(ctx context.Context, id string) (bool, error) {
	res, err := r.db.ExecContext(ctx, r.db.Rebind(`DELETE FROM platforms WHERE id = ?`), id)
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return false, err
	}
	return n > 0, nil
}

// ListByIDs returns the platforms matching ids, in no particular order
// and omitting any id with no matching row. It's the batch fetch a
// dataloader collapses many per-row Platform lookups into.
func (r *Repository) ListByIDs(ctx context.Context, ids []string) ([]Platform, error) {
	var rows []Platform
	query, args, err := sqlx.In(`SELECT id, name, icon_uri, wordmark_uri FROM platforms WHERE id IN (?)`, ids)
	if err != nil {
		return nil, err
	}
	if err := r.db.SelectContext(ctx, &rows, r.db.Rebind(query), args...); err != nil {
		return nil, err
	}
	return rows, nil
}
