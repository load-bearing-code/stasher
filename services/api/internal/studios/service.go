package studios

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

// List returns one page of studios, trimming the repository's
// first+1 lookahead row down to a.First and reporting whether it was
// present as HasNext.
func (s *Service) List(ctx context.Context, a page.Args) (page.Result[*Studio], error) {
	rows, err := s.repo.List(ctx, a)
	if err != nil {
		return page.Result[*Studio]{}, err
	}
	hasNext := len(rows) > a.First
	if hasNext {
		rows = rows[:a.First]
	}
	return page.Result[*Studio]{Items: rows, HasNext: hasNext}, nil
}

// Count returns the total number of studios, independent of any page
// window, to back Connection.totalCount.
func (s *Service) Count(ctx context.Context) (int, error) {
	return s.repo.Count(ctx)
}

// Get returns the studio matching id if given, else name. It returns nil,
// nil if no row matches.
func (s *Service) Get(ctx context.Context, id, name *string) (*Studio, error) {
	return s.repo.Get(ctx, id, name)
}
