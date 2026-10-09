package performers

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"uuid"

	"github.com/jmoiron/sqlx"

	"github.com/load-bearing-code/stasher/api/internal/page"
)

// Performer is a person who appears in content, optionally known by one
// or more aliases. IDBytes is the raw 16-byte form of a UUID v7, stored
// as a BLOB rather than its 36-character text form. uuid.UUID has no
// database/sql bindings, so conversion to and from it happens explicitly
// at the repository's edges rather than via sqlx scanning.
type Performer struct {
	IDBytes        []byte  `db:"id"`
	Name           string  `db:"name"`
	Disambiguation *string `db:"disambiguation"`
	CreatedAt      string  `db:"created_at"`
	UpdatedAt      *string `db:"updated_at"`

	Aliases []string `db:"-"`
	TagIDs  []string `db:"-"`
}

// ID is bound to the GraphQL id field: IDBytes' binary storage isn't
// directly the string form the ID scalar expects.
func (p *Performer) ID() string {
	var u uuid.UUID
	copy(u[:], p.IDBytes)
	return u.String()
}

// Cursor is Performer's position in the name-ordered list
// Query.performers paginates, letting List resume from it via a keyset
// query.
func (p *Performer) Cursor() page.Cursor {
	return page.Cursor{Key: p.Name, ID: p.ID()}
}

const selectColumns = `id, name, disambiguation, created_at, updated_at`

type Repository struct {
	db *sqlx.DB
}

func NewRepository(db *sqlx.DB) *Repository {
	return &Repository{db: db}
}

// List returns one page of performers ordered by name, requesting
// a.First+1 rows so the service can tell whether another page follows
// without a separate count query. Soft-deleted rows are excluded.
func (r *Repository) List(ctx context.Context, a page.Args) ([]*Performer, error) {
	query := `SELECT ` + selectColumns + ` FROM performers WHERE deleted_at IS NULL`
	args := []any{}
	if a.After != nil {
		afterID, err := uuid.Parse(a.After.ID)
		if err != nil {
			return nil, page.ErrBadCursor
		}
		query += ` AND (name, id) > (?, ?)`
		args = append(args, a.After.Key, afterID[:])
	}
	query += ` ORDER BY name ASC, id ASC LIMIT ?`
	args = append(args, a.First+1)

	var rows []*Performer
	if err := r.db.SelectContext(ctx, &rows, r.db.Rebind(query), args...); err != nil {
		return nil, err
	}
	if err := r.attachAliases(ctx, rows); err != nil {
		return nil, err
	}
	if err := r.attachTags(ctx, rows); err != nil {
		return nil, err
	}
	return rows, nil
}

// Count returns the total number of performers, independent of any page
// window, to back Connection.totalCount. Soft-deleted rows are excluded.
func (r *Repository) Count(ctx context.Context) (int, error) {
	var count int
	if err := r.db.GetContext(ctx, &count, `SELECT COUNT(*) FROM performers WHERE deleted_at IS NULL`); err != nil {
		return 0, err
	}
	return count, nil
}

// Create inserts a new performer row, identified by a server-generated
// UUID v7, along with its aliases, and returns it.
func (r *Repository) Create(ctx context.Context, name string, disambiguation *string, aliases []string) (*Performer, error) {
	tx, err := r.db.BeginTxx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	id := uuid.NewV7()
	query := `INSERT INTO performers (id, name, disambiguation) VALUES (?, ?, ?) RETURNING ` + selectColumns
	var row Performer
	if err := tx.GetContext(ctx, &row, tx.Rebind(query), id[:], name, disambiguation); err != nil {
		return nil, err
	}
	if err := insertAliases(ctx, tx, id, aliases); err != nil {
		return nil, err
	}
	row.Aliases = aliases

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return &row, nil
}

// Update changes an existing performer's name, disambiguation, and
// aliases, and returns it.
func (r *Repository) Update(ctx context.Context, id, name string, disambiguation *string, aliases []string) (*Performer, error) {
	performerID, err := uuid.Parse(id)
	if err != nil {
		return nil, fmt.Errorf("performers: invalid id %q: %w", id, err)
	}

	tx, err := r.db.BeginTxx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	query := `UPDATE performers SET name = ?, disambiguation = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
		WHERE id = ? RETURNING ` + selectColumns
	var row Performer
	if err := tx.GetContext(ctx, &row, tx.Rebind(query), name, disambiguation, performerID[:]); err != nil {
		return nil, err
	}

	if _, err := tx.ExecContext(ctx, tx.Rebind(`DELETE FROM performer_aliases WHERE performer_id = ?`), performerID[:]); err != nil {
		return nil, err
	}
	if err := insertAliases(ctx, tx, performerID, aliases); err != nil {
		return nil, err
	}
	row.Aliases = aliases

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return &row, nil
}

// Delete soft-deletes the performer matching id by setting deleted_at,
// and reports whether a row was affected (i.e. it existed and wasn't
// already deleted).
func (r *Repository) Delete(ctx context.Context, id string) (bool, error) {
	performerID, err := uuid.Parse(id)
	if err != nil {
		return false, fmt.Errorf("performers: invalid id %q: %w", id, err)
	}

	query := `UPDATE performers SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
		WHERE id = ? AND deleted_at IS NULL`
	res, err := r.db.ExecContext(ctx, r.db.Rebind(query), performerID[:])
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return false, err
	}
	return n > 0, nil
}

// Get returns the performer matching id if given, else name. It returns
// nil, nil if no row matches. Soft-deleted rows are excluded.
func (r *Repository) Get(ctx context.Context, id, name *string) (*Performer, error) {
	column, arg := "name", any(nil)
	if id != nil {
		performerID, err := uuid.Parse(*id)
		if err != nil {
			return nil, fmt.Errorf("performers: invalid id %q: %w", *id, err)
		}
		column, arg = "id", performerID[:]
	} else {
		arg = *name
	}
	query := `SELECT ` + selectColumns + ` FROM performers WHERE deleted_at IS NULL AND ` + column + ` = ?`

	var row Performer
	if err := r.db.GetContext(ctx, &row, r.db.Rebind(query), arg); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	if err := r.attachAliases(ctx, []*Performer{&row}); err != nil {
		return nil, err
	}
	if err := r.attachTags(ctx, []*Performer{&row}); err != nil {
		return nil, err
	}
	return &row, nil
}

// attachAliases batch-fetches and attaches aliases for rows, so List and
// Get avoid a per-row round trip.
func (r *Repository) attachAliases(ctx context.Context, rows []*Performer) error {
	if len(rows) == 0 {
		return nil
	}
	ids := make([][]byte, len(rows))
	byID := make(map[string]*Performer, len(rows))
	for i, row := range rows {
		ids[i] = row.IDBytes
		byID[string(row.IDBytes)] = row
	}

	type alias struct {
		PerformerID []byte `db:"performer_id"`
		Name        string `db:"name"`
	}
	var aliases []alias
	query, args, err := sqlx.In(`SELECT performer_id, name FROM performer_aliases WHERE performer_id IN (?)`, ids)
	if err != nil {
		return err
	}
	if err := r.db.SelectContext(ctx, &aliases, r.db.Rebind(query), args...); err != nil {
		return err
	}
	for _, a := range aliases {
		byID[string(a.PerformerID)].Aliases = append(byID[string(a.PerformerID)].Aliases, a.Name)
	}
	return nil
}

// ListByIDs returns the performers matching ids, in no particular order
// and omitting any id with no matching row. It's the batch fetch a
// dataloader collapses many per-row Performer lookups into. Soft-deleted
// rows are excluded.
func (r *Repository) ListByIDs(ctx context.Context, ids []string) ([]*Performer, error) {
	idBytes := make([][]byte, len(ids))
	for i, id := range ids {
		performerID, err := uuid.Parse(id)
		if err != nil {
			return nil, fmt.Errorf("performers: invalid id %q: %w", id, err)
		}
		idBytes[i] = performerID[:]
	}

	var rows []*Performer
	query, args, err := sqlx.In(`SELECT `+selectColumns+` FROM performers WHERE deleted_at IS NULL AND id IN (?)`, idBytes)
	if err != nil {
		return nil, err
	}
	if err := r.db.SelectContext(ctx, &rows, r.db.Rebind(query), args...); err != nil {
		return nil, err
	}
	if err := r.attachAliases(ctx, rows); err != nil {
		return nil, err
	}
	if err := r.attachTags(ctx, rows); err != nil {
		return nil, err
	}
	return rows, nil
}

// attachTags batch-fetches and attaches tag links for rows, so List,
// Get, and ListByIDs avoid a per-row round trip. Tags are owned by the
// tags package; this is a read-only join against performer_tags to
// serve the reciprocal Performer.tags field.
func (r *Repository) attachTags(ctx context.Context, rows []*Performer) error {
	if len(rows) == 0 {
		return nil
	}
	ids := make([][]byte, len(rows))
	byID := make(map[string]*Performer, len(rows))
	for i, row := range rows {
		ids[i] = row.IDBytes
		byID[string(row.IDBytes)] = row
	}

	type link struct {
		PerformerID []byte `db:"performer_id"`
		TagID       []byte `db:"tag_id"`
	}
	var links []link
	query, args, err := sqlx.In(`SELECT performer_id, tag_id FROM performer_tags WHERE performer_id IN (?)`, ids)
	if err != nil {
		return err
	}
	if err := r.db.SelectContext(ctx, &links, r.db.Rebind(query), args...); err != nil {
		return err
	}
	for _, l := range links {
		var u uuid.UUID
		copy(u[:], l.TagID)
		performer := byID[string(l.PerformerID)]
		performer.TagIDs = append(performer.TagIDs, u.String())
	}
	return nil
}

// insertAliases inserts aliases for performerID within tx.
func insertAliases(ctx context.Context, tx *sqlx.Tx, performerID uuid.UUID, aliases []string) error {
	for _, alias := range aliases {
		if _, err := tx.ExecContext(ctx, tx.Rebind(`INSERT INTO performer_aliases (performer_id, name) VALUES (?, ?)`), performerID[:], alias); err != nil {
			return err
		}
	}
	return nil
}
