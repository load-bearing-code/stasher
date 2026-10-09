package platformaccounts

import (
	"context"

	"github.com/jmoiron/sqlx"

	"github.com/load-bearing-code/stasher/api/internal/page"
)

type Service struct {
	repo *Repository
}

func New(db *sqlx.DB) *Service {
	return &Service{repo: NewRepository(db)}
}

// List returns one page of platform accounts, optionally restricted to
// platformID and/or performerID, trimming the repository's first+1
// lookahead row down to a.First and reporting whether it was present as
// HasNext.
func (s *Service) List(ctx context.Context, a page.Args, platformID, performerID *string) (page.Result[*PlatformAccount], error) {
	rows, err := s.repo.List(ctx, a, platformID, performerID)
	if err != nil {
		return page.Result[*PlatformAccount]{}, err
	}
	hasNext := len(rows) > a.First
	if hasNext {
		rows = rows[:a.First]
	}
	return page.Result[*PlatformAccount]{Items: rows, HasNext: hasNext}, nil
}

// Count returns the total number of platform accounts, optionally
// restricted to platformID and/or performerID, independent of any page
// window, to back Connection.totalCount.
func (s *Service) Count(ctx context.Context, platformID, performerID *string) (int, error) {
	return s.repo.Count(ctx, platformID, performerID)
}

// Create adds a new platform account, identified by a server-generated
// id, and returns it.
func (s *Service) Create(ctx context.Context, platformID string, platformUserID *string, handle string, bio *string, studioID *string, performerIDs []string) (*PlatformAccount, error) {
	return s.repo.Create(ctx, platformID, platformUserID, handle, bio, studioID, performerIDs)
}

// Update changes an existing platform account's platform, handle, bio,
// studio, and performer links, and returns it.
func (s *Service) Update(ctx context.Context, id string, platformID string, platformUserID *string, handle string, bio *string, studioID *string, performerIDs []string) (*PlatformAccount, error) {
	return s.repo.Update(ctx, id, platformID, platformUserID, handle, bio, studioID, performerIDs)
}

// Get returns the platform account matching id if given, else the
// account matching platformID and handle. It returns nil, nil if no row
// matches.
func (s *Service) Get(ctx context.Context, id *string, platformID *string, handle *string) (*PlatformAccount, error) {
	return s.repo.Get(ctx, id, platformID, handle)
}

// Delete soft-deletes the platform account matching id, and reports
// whether a row was affected.
func (s *Service) Delete(ctx context.Context, id string) (bool, error) {
	return s.repo.Delete(ctx, id)
}
