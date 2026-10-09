package platforms

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

// List returns one page of platforms, trimming the repository's
// first+1 lookahead row down to a.First and reporting whether it was
// present as HasNext.
func (s *Service) List(ctx context.Context, a page.Args) (page.Result[*Platform], error) {
	rows, err := s.repo.List(ctx, a)
	if err != nil {
		return page.Result[*Platform]{}, err
	}
	hasNext := len(rows) > a.First
	if hasNext {
		rows = rows[:a.First]
	}
	return page.Result[*Platform]{Items: rows, HasNext: hasNext}, nil
}

// Count returns the total number of platforms, independent of any page
// window, to back Connection.totalCount.
func (s *Service) Count(ctx context.Context) (int, error) {
	return s.repo.Count(ctx)
}

// Create adds a new platform and returns it.
func (s *Service) Create(ctx context.Context, id, name string) (*Platform, error) {
	return s.repo.Create(ctx, id, name)
}

// Update changes an existing platform's name and returns it.
func (s *Service) Update(ctx context.Context, id, name string) (*Platform, error) {
	return s.repo.Update(ctx, id, name)
}

// Delete removes the platform matching id, and reports whether a row was
// affected.
func (s *Service) Delete(ctx context.Context, id string) (bool, error) {
	return s.repo.Delete(ctx, id)
}

// Get returns the platform matching id if given, else name. It returns nil,
// nil if no row matches.
func (s *Service) Get(ctx context.Context, id, name *string) (*Platform, error) {
	return s.repo.Get(ctx, id, name)
}

// GetByIDs returns the platforms matching ids, keyed by id. An id with no
// matching row is simply absent from the map, letting callers (e.g. a
// dataloader) decide how to treat a miss.
func (s *Service) GetByIDs(ctx context.Context, ids []string) (map[string]Platform, error) {
	rows, err := s.repo.ListByIDs(ctx, ids)
	if err != nil {
		return nil, err
	}
	byID := make(map[string]Platform, len(rows))
	for _, row := range rows {
		byID[row.ID] = row
	}
	return byID, nil
}
