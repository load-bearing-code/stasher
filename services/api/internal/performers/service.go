package performers

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

// List returns one page of performers, trimming the repository's
// first+1 lookahead row down to a.First and reporting whether it was
// present as HasNext.
func (s *Service) List(ctx context.Context, a page.Args) (page.Result[*Performer], error) {
	rows, err := s.repo.List(ctx, a)
	if err != nil {
		return page.Result[*Performer]{}, err
	}
	hasNext := len(rows) > a.First
	if hasNext {
		rows = rows[:a.First]
	}
	return page.Result[*Performer]{Items: rows, HasNext: hasNext}, nil
}

// Count returns the total number of performers, independent of any page
// window, to back Connection.totalCount.
func (s *Service) Count(ctx context.Context) (int, error) {
	return s.repo.Count(ctx)
}

// Create adds a new performer, identified by a server-generated id, and
// returns it.
func (s *Service) Create(ctx context.Context, name string, disambiguation *string, aliases []string) (*Performer, error) {
	return s.repo.Create(ctx, name, disambiguation, aliases)
}

// Update changes an existing performer's name, disambiguation, and
// aliases, and returns it.
func (s *Service) Update(ctx context.Context, id, name string, disambiguation *string, aliases []string) (*Performer, error) {
	return s.repo.Update(ctx, id, name, disambiguation, aliases)
}

// Get returns the performer matching id if given, else name. It returns
// nil, nil if no row matches.
func (s *Service) Get(ctx context.Context, id, name *string) (*Performer, error) {
	return s.repo.Get(ctx, id, name)
}

// Delete soft-deletes the performer matching id, and reports whether a
// row was affected.
func (s *Service) Delete(ctx context.Context, id string) (bool, error) {
	return s.repo.Delete(ctx, id)
}
