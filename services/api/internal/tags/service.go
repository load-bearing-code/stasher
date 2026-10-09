package tags

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

// List returns one page of tags, optionally restricted to performerID,
// trimming the repository's first+1 lookahead row down to a.First and
// reporting whether it was present as HasNext.
func (s *Service) List(ctx context.Context, a page.Args, performerID *string) (page.Result[*Tag], error) {
	rows, err := s.repo.List(ctx, a, performerID)
	if err != nil {
		return page.Result[*Tag]{}, err
	}
	hasNext := len(rows) > a.First
	if hasNext {
		rows = rows[:a.First]
	}
	return page.Result[*Tag]{Items: rows, HasNext: hasNext}, nil
}

// Count returns the total number of tags, optionally restricted to
// performerID, independent of any page window, to back
// Connection.totalCount.
func (s *Service) Count(ctx context.Context, performerID *string) (int, error) {
	return s.repo.Count(ctx, performerID)
}

// Create adds a new tag, identified by a server-generated id, and
// returns it.
func (s *Service) Create(ctx context.Context, name string, description *string, performerIDs []string) (*Tag, error) {
	return s.repo.Create(ctx, name, description, performerIDs)
}

// Update changes an existing tag's name, description, and performer
// links, and returns it.
func (s *Service) Update(ctx context.Context, id, name string, description *string, performerIDs []string) (*Tag, error) {
	return s.repo.Update(ctx, id, name, description, performerIDs)
}

// Get returns the tag matching id if given, else name. It returns
// nil, nil if no row matches.
func (s *Service) Get(ctx context.Context, id, name *string) (*Tag, error) {
	return s.repo.Get(ctx, id, name)
}

// Delete removes the tag matching id, and reports whether a row was
// affected.
func (s *Service) Delete(ctx context.Context, id string) (bool, error) {
	return s.repo.Delete(ctx, id)
}

// GetByIDs returns the tags matching ids, keyed by id. An id with no
// matching row is simply absent from the map, letting callers (e.g. a
// dataloader) decide how to treat a miss.
func (s *Service) GetByIDs(ctx context.Context, ids []string) (map[string]Tag, error) {
	rows, err := s.repo.ListByIDs(ctx, ids)
	if err != nil {
		return nil, err
	}
	byID := make(map[string]Tag, len(rows))
	for _, row := range rows {
		byID[row.ID()] = *row
	}
	return byID, nil
}
