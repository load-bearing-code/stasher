package studios

import (
	"context"
	"database/sql"
	"errors"

	"github.com/jmoiron/sqlx"

	"github.com/load-bearing-code/stasher/api/internal/page"
)

// Studio is a production company that produces content.
type Studio struct {
	ID   string `db:"id"`
	Name string `db:"name"`
}

// Cursor is Studio's position in the name-ordered list Query.studios
// paginates, letting List resume from it via a keyset query.
func (s *Studio) Cursor() page.Cursor {
	return page.Cursor{Key: s.Name, ID: s.ID}
}

type Repository struct {
	db *sqlx.DB
}

func NewRepository(db *sqlx.DB) *Repository {
	return &Repository{db: db}
}

// List returns one page of studios ordered by name, requesting
// a.First+1 rows so the service can tell whether another page follows
// without a separate count query.
func (r *Repository) List(ctx context.Context, a page.Args) ([]*Studio, error) {
	query := `SELECT id, name FROM studios`
	args := []any{}
	if a.After != nil {
		query += ` WHERE (name, id) > (?, ?)`
		args = append(args, a.After.Key, a.After.ID)
	}
	query += ` ORDER BY name ASC, id ASC LIMIT ?`
	args = append(args, a.First+1)

	var rows []*Studio
	if err := r.db.SelectContext(ctx, &rows, r.db.Rebind(query), args...); err != nil {
		return nil, err
	}
	return rows, nil
}

// Count returns the total number of studios, independent of any page
// window, to back Connection.totalCount.
func (r *Repository) Count(ctx context.Context) (int, error) {
	var count int
	if err := r.db.GetContext(ctx, &count, `SELECT COUNT(*) FROM studios`); err != nil {
		return 0, err
	}
	return count, nil
}

// Create inserts a new studio row and returns it.
func (r *Repository) Create(ctx context.Context, id, name string) (*Studio, error) {
	_, err := r.db.ExecContext(ctx, r.db.Rebind(`INSERT INTO studios (id, name) VALUES (?, ?)`), id, name)
	if err != nil {
		return nil, err
	}
	return &Studio{ID: id, Name: name}, nil
}

// Update changes an existing studio's name and returns it.
func (r *Repository) Update(ctx context.Context, id, name string) (*Studio, error) {
	_, err := r.db.ExecContext(ctx, r.db.Rebind(`UPDATE studios SET name = ? WHERE id = ?`), name, id)
	if err != nil {
		return nil, err
	}
	return &Studio{ID: id, Name: name}, nil
}

// Get returns the studio matching id if given, else name. It returns nil,
// nil if no row matches.
func (r *Repository) Get(ctx context.Context, id, name *string) (*Studio, error) {
	var query string
	var arg string
	if id != nil {
		query, arg = `SELECT id, name FROM studios WHERE id = ?`, *id
	} else {
		query, arg = `SELECT id, name FROM studios WHERE name = ?`, *name
	}

	var row Studio
	if err := r.db.GetContext(ctx, &row, r.db.Rebind(query), arg); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &row, nil
}
