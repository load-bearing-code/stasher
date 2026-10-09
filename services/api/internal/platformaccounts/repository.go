package platformaccounts

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"uuid"

	"github.com/jmoiron/sqlx"

	"github.com/load-bearing-code/stasher/api/internal/page"
)

// PlatformAccount is a performer's or studio's presence on a platform
// (e.g. a Fansly profile), optionally linked to one or more performers.
// IDBytes is the raw 16-byte form of a UUID v7, stored as a BLOB rather
// than its 36-character text form. uuid.UUID has no database/sql
// bindings, so conversion to and from it happens explicitly at the
// repository's edges rather than via sqlx scanning.
type PlatformAccount struct {
	IDBytes        []byte  `db:"id"`
	PlatformID     string  `db:"platform_id"`
	PlatformUserID *string `db:"platform_user_id"`
	Handle         string  `db:"handle"`
	Bio            *string `db:"bio"`
	StudioID       *string `db:"studio_id"`
	CreatedAt      string  `db:"created_at"`
	UpdatedAt      *string `db:"updated_at"`

	PerformerIDs []string `db:"-"`
}

// ID is bound to the GraphQL id field: IDBytes' binary storage isn't
// directly the string form the ID scalar expects.
func (a *PlatformAccount) ID() string {
	var u uuid.UUID
	copy(u[:], a.IDBytes)
	return u.String()
}

// Cursor is PlatformAccount's position in the handle-ordered list
// Query.platformAccounts paginates, letting List resume from it via a
// keyset query.
func (a *PlatformAccount) Cursor() page.Cursor {
	return page.Cursor{Key: a.Handle, ID: a.ID()}
}

const selectColumns = `id, platform_id, platform_user_id, handle, bio, studio_id, created_at, updated_at`

type Repository struct {
	db *sqlx.DB
}

func NewRepository(db *sqlx.DB) *Repository {
	return &Repository{db: db}
}

// List returns one page of platform accounts ordered by handle,
// optionally restricted to platformID and/or performerID, requesting
// a.First+1 rows so the service can tell whether another page follows
// without a separate count query. Soft-deleted rows are excluded.
func (r *Repository) List(ctx context.Context, a page.Args, platformID, performerID *string) ([]*PlatformAccount, error) {
	query := `SELECT ` + selectColumns + ` FROM platform_accounts WHERE deleted_at IS NULL`
	args := []any{}
	if platformID != nil {
		query += ` AND platform_id = ?`
		args = append(args, *platformID)
	}
	if performerID != nil {
		pid, err := uuid.Parse(*performerID)
		if err != nil {
			return nil, fmt.Errorf("platformaccounts: invalid performer id %q: %w", *performerID, err)
		}
		query += ` AND id IN (SELECT platform_account_id FROM platform_account_performers WHERE performer_id = ?)`
		args = append(args, pid[:])
	}
	if a.After != nil {
		afterID, err := uuid.Parse(a.After.ID)
		if err != nil {
			return nil, page.ErrBadCursor
		}
		query += ` AND (handle, id) > (?, ?)`
		args = append(args, a.After.Key, afterID[:])
	}
	query += ` ORDER BY handle ASC, id ASC LIMIT ?`
	args = append(args, a.First+1)

	var rows []*PlatformAccount
	if err := r.db.SelectContext(ctx, &rows, r.db.Rebind(query), args...); err != nil {
		return nil, err
	}
	if err := r.attachPerformers(ctx, rows); err != nil {
		return nil, err
	}
	return rows, nil
}

// Count returns the total number of platform accounts, optionally
// restricted to platformID and/or performerID, independent of any page
// window, to back Connection.totalCount. Soft-deleted rows are excluded.
func (r *Repository) Count(ctx context.Context, platformID, performerID *string) (int, error) {
	query := `SELECT COUNT(*) FROM platform_accounts WHERE deleted_at IS NULL`
	args := []any{}
	if platformID != nil {
		query += ` AND platform_id = ?`
		args = append(args, *platformID)
	}
	if performerID != nil {
		pid, err := uuid.Parse(*performerID)
		if err != nil {
			return 0, fmt.Errorf("platformaccounts: invalid performer id %q: %w", *performerID, err)
		}
		query += ` AND id IN (SELECT platform_account_id FROM platform_account_performers WHERE performer_id = ?)`
		args = append(args, pid[:])
	}
	var count int
	if err := r.db.GetContext(ctx, &count, r.db.Rebind(query), args...); err != nil {
		return 0, err
	}
	return count, nil
}

// Create inserts a new platform account row, identified by a
// server-generated UUID v7, along with its performer links, and returns
// it.
func (r *Repository) Create(ctx context.Context, platformID string, platformUserID *string, handle string, bio *string, studioID *string, performerIDs []string) (*PlatformAccount, error) {
	tx, err := r.db.BeginTxx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	id := uuid.NewV7()
	query := `INSERT INTO platform_accounts (id, platform_id, platform_user_id, handle, bio, studio_id) VALUES (?, ?, ?, ?, ?, ?) RETURNING ` + selectColumns
	var row PlatformAccount
	if err := tx.GetContext(ctx, &row, tx.Rebind(query), id[:], platformID, platformUserID, handle, bio, studioID); err != nil {
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

// Update changes an existing platform account's handle, bio, studio, and
// performer links, and returns it.
func (r *Repository) Update(ctx context.Context, id string, platformID string, platformUserID *string, handle string, bio *string, studioID *string, performerIDs []string) (*PlatformAccount, error) {
	accountID, err := uuid.Parse(id)
	if err != nil {
		return nil, fmt.Errorf("platformaccounts: invalid id %q: %w", id, err)
	}

	tx, err := r.db.BeginTxx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	query := `UPDATE platform_accounts SET platform_id = ?, platform_user_id = ?, handle = ?, bio = ?, studio_id = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
		WHERE id = ? RETURNING ` + selectColumns
	var row PlatformAccount
	if err := tx.GetContext(ctx, &row, tx.Rebind(query), platformID, platformUserID, handle, bio, studioID, accountID[:]); err != nil {
		return nil, err
	}

	if _, err := tx.ExecContext(ctx, tx.Rebind(`DELETE FROM platform_account_performers WHERE platform_account_id = ?`), accountID[:]); err != nil {
		return nil, err
	}
	if err := insertPerformerLinks(ctx, tx, accountID, performerIDs); err != nil {
		return nil, err
	}
	row.PerformerIDs = performerIDs

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return &row, nil
}

// Delete soft-deletes the platform account matching id by setting
// deleted_at, and reports whether a row was affected (i.e. it existed
// and wasn't already deleted).
func (r *Repository) Delete(ctx context.Context, id string) (bool, error) {
	accountID, err := uuid.Parse(id)
	if err != nil {
		return false, fmt.Errorf("platformaccounts: invalid id %q: %w", id, err)
	}

	query := `UPDATE platform_accounts SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
		WHERE id = ? AND deleted_at IS NULL`
	res, err := r.db.ExecContext(ctx, r.db.Rebind(query), accountID[:])
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return false, err
	}
	return n > 0, nil
}

// Get returns the platform account matching id if given, else the
// account matching platformID and handle. It returns nil, nil if no row
// matches. Soft-deleted rows are excluded.
func (r *Repository) Get(ctx context.Context, id *string, platformID *string, handle *string) (*PlatformAccount, error) {
	var query string
	var args []any
	if id != nil {
		accountID, err := uuid.Parse(*id)
		if err != nil {
			return nil, fmt.Errorf("platformaccounts: invalid id %q: %w", *id, err)
		}
		query = `SELECT ` + selectColumns + ` FROM platform_accounts WHERE deleted_at IS NULL AND id = ?`
		args = []any{accountID[:]}
	} else {
		query = `SELECT ` + selectColumns + ` FROM platform_accounts WHERE deleted_at IS NULL AND platform_id = ? AND handle = ?`
		args = []any{*platformID, *handle}
	}

	var row PlatformAccount
	if err := r.db.GetContext(ctx, &row, r.db.Rebind(query), args...); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	if err := r.attachPerformers(ctx, []*PlatformAccount{&row}); err != nil {
		return nil, err
	}
	return &row, nil
}

// attachPerformers batch-fetches and attaches performer links for rows,
// so List and Get avoid a per-row round trip.
func (r *Repository) attachPerformers(ctx context.Context, rows []*PlatformAccount) error {
	if len(rows) == 0 {
		return nil
	}
	ids := make([][]byte, len(rows))
	byID := make(map[string]*PlatformAccount, len(rows))
	for i, row := range rows {
		ids[i] = row.IDBytes
		byID[string(row.IDBytes)] = row
	}

	type link struct {
		PlatformAccountID []byte `db:"platform_account_id"`
		PerformerID       []byte `db:"performer_id"`
	}
	var links []link
	query, args, err := sqlx.In(`SELECT platform_account_id, performer_id FROM platform_account_performers WHERE platform_account_id IN (?)`, ids)
	if err != nil {
		return err
	}
	if err := r.db.SelectContext(ctx, &links, r.db.Rebind(query), args...); err != nil {
		return err
	}
	for _, l := range links {
		var u uuid.UUID
		copy(u[:], l.PerformerID)
		account := byID[string(l.PlatformAccountID)]
		account.PerformerIDs = append(account.PerformerIDs, u.String())
	}
	return nil
}

// insertPerformerLinks inserts platform_account_performers rows linking
// accountID to performerIDs within tx.
func insertPerformerLinks(ctx context.Context, tx *sqlx.Tx, accountID uuid.UUID, performerIDs []string) error {
	for _, performerID := range performerIDs {
		pid, err := uuid.Parse(performerID)
		if err != nil {
			return fmt.Errorf("platformaccounts: invalid performer id %q: %w", performerID, err)
		}
		if _, err := tx.ExecContext(ctx, tx.Rebind(`INSERT INTO platform_account_performers (platform_account_id, performer_id) VALUES (?, ?)`), accountID[:], pid[:]); err != nil {
			return err
		}
	}
	return nil
}
