package tags

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"uuid"

	"github.com/jmoiron/sqlx"

	"github.com/load-bearing-code/stasher/api/internal/page"
)

// Tag is a label that can be attached to one or more performers.
// IDBytes is the raw 16-byte form of a UUID v7, stored as a BLOB rather
// than its 36-character text form. uuid.UUID has no database/sql
// bindings, so conversion to and from it happens explicitly at the
// repository's edges rather than via sqlx scanning.
type Tag struct {
	IDBytes     []byte  `db:"id"`
	Name        string  `db:"name"`
	Description *string `db:"description"`

	PerformerIDs []string `db:"-"`
}

// ID is bound to the GraphQL id field: IDBytes' binary storage isn't
// directly the string form the ID scalar expects.
func (t *Tag) ID() string {
	var u uuid.UUID
	copy(u[:], t.IDBytes)
	return u.String()
}

// Cursor is Tag's position in the name-ordered list Query.tags
// paginates, letting List resume from it via a keyset query.
func (t *Tag) Cursor() page.Cursor {
	return page.Cursor{Key: t.Name, ID: t.ID()}
}

const selectColumns = `id, name, description`

type Repository struct {
	db *sqlx.DB
}

func NewRepository(db *sqlx.DB) *Repository {
	return &Repository{db: db}
}

// List returns one page of tags ordered by name, optionally restricted
// to performerID, requesting a.First+1 rows so the service can tell
// whether another page follows without a separate count query.
func (r *Repository) List(ctx context.Context, a page.Args, performerID *string) ([]*Tag, error) {
	query := `SELECT ` + selectColumns + ` FROM tags WHERE 1 = 1`
	args := []any{}
	if performerID != nil {
		pid, err := uuid.Parse(*performerID)
		if err != nil {
			return nil, fmt.Errorf("tags: invalid performer id %q: %w", *performerID, err)
		}
		query += ` AND id IN (SELECT tag_id FROM performer_tags WHERE performer_id = ?)`
		args = append(args, pid[:])
	}
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

	var rows []*Tag
	if err := r.db.SelectContext(ctx, &rows, r.db.Rebind(query), args...); err != nil {
		return nil, err
	}
	if err := r.attachPerformers(ctx, rows); err != nil {
		return nil, err
	}
	return rows, nil
}

// Count returns the total number of tags, optionally restricted to
// performerID, independent of any page window, to back
// Connection.totalCount.
func (r *Repository) Count(ctx context.Context, performerID *string) (int, error) {
	query := `SELECT COUNT(*) FROM tags WHERE 1 = 1`
	args := []any{}
	if performerID != nil {
		pid, err := uuid.Parse(*performerID)
		if err != nil {
			return 0, fmt.Errorf("tags: invalid performer id %q: %w", *performerID, err)
		}
		query += ` AND id IN (SELECT tag_id FROM performer_tags WHERE performer_id = ?)`
		args = append(args, pid[:])
	}
	var count int
	if err := r.db.GetContext(ctx, &count, r.db.Rebind(query), args...); err != nil {
		return 0, err
	}
	return count, nil
}

// Create inserts a new tag row, identified by a server-generated UUID
// v7, along with its performer links, and returns it.
func (r *Repository) Create(ctx context.Context, name string, description *string, performerIDs []string) (*Tag, error) {
	tx, err := r.db.BeginTxx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	id := uuid.NewV7()
	query := `INSERT INTO tags (id, name, description) VALUES (?, ?, ?) RETURNING ` + selectColumns
	var row Tag
	if err := tx.GetContext(ctx, &row, tx.Rebind(query), id[:], name, description); err != nil {
		return nil, err
	}
	if err := insertPerformerLinks(ctx, tx, id, performerIDs); err != nil {
		return nil, err
	}
	row.PerformerIDs = performerIDs

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return &row, nil
}

// Update changes an existing tag's name, description, and performer
// links, and returns it.
func (r *Repository) Update(ctx context.Context, id, name string, description *string, performerIDs []string) (*Tag, error) {
	tagID, err := uuid.Parse(id)
	if err != nil {
		return nil, fmt.Errorf("tags: invalid id %q: %w", id, err)
	}

	tx, err := r.db.BeginTxx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	query := `UPDATE tags SET name = ?, description = ? WHERE id = ? RETURNING ` + selectColumns
	var row Tag
	if err := tx.GetContext(ctx, &row, tx.Rebind(query), name, description, tagID[:]); err != nil {
		return nil, err
	}

	if _, err := tx.ExecContext(ctx, tx.Rebind(`DELETE FROM performer_tags WHERE tag_id = ?`), tagID[:]); err != nil {
		return nil, err
	}
	if err := insertPerformerLinks(ctx, tx, tagID, performerIDs); err != nil {
		return nil, err
	}
	row.PerformerIDs = performerIDs

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return &row, nil
}

// Delete removes the tag matching id, and reports whether a row was
// affected. Its performer_tags links are removed by the database via
// ON DELETE CASCADE.
func (r *Repository) Delete(ctx context.Context, id string) (bool, error) {
	tagID, err := uuid.Parse(id)
	if err != nil {
		return false, fmt.Errorf("tags: invalid id %q: %w", id, err)
	}

	res, err := r.db.ExecContext(ctx, r.db.Rebind(`DELETE FROM tags WHERE id = ?`), tagID[:])
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return false, err
	}
	return n > 0, nil
}

// Get returns the tag matching id if given, else name. It returns
// nil, nil if no row matches.
func (r *Repository) Get(ctx context.Context, id, name *string) (*Tag, error) {
	column, arg := "name", any(nil)
	if id != nil {
		tagID, err := uuid.Parse(*id)
		if err != nil {
			return nil, fmt.Errorf("tags: invalid id %q: %w", *id, err)
		}
		column, arg = "id", tagID[:]
	} else {
		arg = *name
	}
	query := `SELECT ` + selectColumns + ` FROM tags WHERE ` + column + ` = ?`

	var row Tag
	if err := r.db.GetContext(ctx, &row, r.db.Rebind(query), arg); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	if err := r.attachPerformers(ctx, []*Tag{&row}); err != nil {
		return nil, err
	}
	return &row, nil
}

// attachPerformers batch-fetches and attaches performer links for rows,
// so List and Get avoid a per-row round trip.
func (r *Repository) attachPerformers(ctx context.Context, rows []*Tag) error {
	if len(rows) == 0 {
		return nil
	}
	ids := make([][]byte, len(rows))
	byID := make(map[string]*Tag, len(rows))
	for i, row := range rows {
		ids[i] = row.IDBytes
		byID[string(row.IDBytes)] = row
	}

	type link struct {
		TagID       []byte `db:"tag_id"`
		PerformerID []byte `db:"performer_id"`
	}
	var links []link
	query, args, err := sqlx.In(`SELECT tag_id, performer_id FROM performer_tags WHERE tag_id IN (?)`, ids)
	if err != nil {
		return err
	}
	if err := r.db.SelectContext(ctx, &links, r.db.Rebind(query), args...); err != nil {
		return err
	}
	for _, l := range links {
		var u uuid.UUID
		copy(u[:], l.PerformerID)
		tag := byID[string(l.TagID)]
		tag.PerformerIDs = append(tag.PerformerIDs, u.String())
	}
	return nil
}

// ListByIDs returns the tags matching ids, in no particular order and
// omitting any id with no matching row. It's the batch fetch a
// dataloader collapses many per-row Tag lookups into.
func (r *Repository) ListByIDs(ctx context.Context, ids []string) ([]*Tag, error) {
	idBytes := make([][]byte, len(ids))
	for i, id := range ids {
		tagID, err := uuid.Parse(id)
		if err != nil {
			return nil, fmt.Errorf("tags: invalid id %q: %w", id, err)
		}
		idBytes[i] = tagID[:]
	}

	var rows []*Tag
	query, args, err := sqlx.In(`SELECT `+selectColumns+` FROM tags WHERE id IN (?)`, idBytes)
	if err != nil {
		return nil, err
	}
	if err := r.db.SelectContext(ctx, &rows, r.db.Rebind(query), args...); err != nil {
		return nil, err
	}
	if err := r.attachPerformers(ctx, rows); err != nil {
		return nil, err
	}
	return rows, nil
}

// insertPerformerLinks inserts performer_tags rows linking tagID to
// performerIDs within tx.
func insertPerformerLinks(ctx context.Context, tx *sqlx.Tx, tagID uuid.UUID, performerIDs []string) error {
	for _, performerID := range performerIDs {
		pid, err := uuid.Parse(performerID)
		if err != nil {
			return fmt.Errorf("tags: invalid performer id %q: %w", performerID, err)
		}
		if _, err := tx.ExecContext(ctx, tx.Rebind(`INSERT INTO performer_tags (performer_id, tag_id) VALUES (?, ?)`), pid[:], tagID[:]); err != nil {
			return err
		}
	}
	return nil
}
