package platforms

import (
	"context"
	"fmt"

	"github.com/jmoiron/sqlx"

	"github.com/load-bearing-code/stasher/api/internal/assets"
	"github.com/load-bearing-code/stasher/api/internal/page"
)

type Service struct {
	repo   *Repository
	assets *assets.Store
}

func New(db *sqlx.DB, assetStore *assets.Store) *Service {
	return &Service{repo: NewRepository(db), assets: assetStore}
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

// Create adds a new platform, storing any uploaded artwork first.
func (s *Service) Create(ctx context.Context, id, name string, icon, wordmark *assets.Upload) (*Platform, error) {
	iconURI, wordmarkURI, saved, err := s.saveUploads(icon, wordmark)
	if err != nil {
		return nil, err
	}
	platform, err := s.repo.Create(ctx, id, name, iconURI, wordmarkURI)
	if err != nil {
		s.deleteAssets(saved...)
		return nil, err
	}
	return platform, nil
}

// Update changes an existing platform, replacing artwork only when a new file
// is supplied.
func (s *Service) Update(ctx context.Context, id, name string, icon, wordmark *assets.Upload) (*Platform, error) {
	existing, err := s.repo.Get(ctx, &id, nil)
	if err != nil {
		return nil, err
	}
	if existing == nil {
		return nil, fmt.Errorf("platform %q not found", id)
	}

	iconURI, wordmarkURI, saved, err := s.saveUploads(icon, wordmark)
	if err != nil {
		return nil, err
	}
	if iconURI == nil {
		iconURI = existing.IconURI
	}
	if wordmarkURI == nil {
		wordmarkURI = existing.WordmarkURI
	}

	platform, err := s.repo.Update(ctx, id, name, iconURI, wordmarkURI)
	if err != nil {
		s.deleteAssets(saved...)
		return nil, err
	}
	if icon != nil && existing.IconURI != nil {
		s.deleteAssets(*existing.IconURI)
	}
	if wordmark != nil && existing.WordmarkURI != nil {
		s.deleteAssets(*existing.WordmarkURI)
	}
	return platform, nil
}

// Delete removes the platform matching id, and reports whether a row was
// affected.
func (s *Service) Delete(ctx context.Context, id string) (bool, error) {
	existing, err := s.repo.Get(ctx, &id, nil)
	if err != nil || existing == nil {
		return false, err
	}
	deleted, err := s.repo.Delete(ctx, id)
	if err != nil || !deleted {
		return deleted, err
	}
	if existing.IconURI != nil {
		s.deleteAssets(*existing.IconURI)
	}
	if existing.WordmarkURI != nil {
		s.deleteAssets(*existing.WordmarkURI)
	}
	return true, nil
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

func (s *Service) saveUploads(icon, wordmark *assets.Upload) (iconURI, wordmarkURI *string, saved []string, err error) {
	if icon != nil {
		uri, saveErr := s.assets.SaveImage("platforms/icons", *icon)
		if saveErr != nil {
			return nil, nil, nil, saveErr
		}
		iconURI = &uri
		saved = append(saved, uri)
	}
	if wordmark != nil {
		uri, saveErr := s.assets.SaveImage("platforms/wordmarks", *wordmark)
		if saveErr != nil {
			s.deleteAssets(saved...)
			return nil, nil, nil, saveErr
		}
		wordmarkURI = &uri
		saved = append(saved, uri)
	}
	return iconURI, wordmarkURI, saved, nil
}

func (s *Service) deleteAssets(uris ...string) {
	for _, uri := range uris {
		// A database mutation has already succeeded or failed at this point;
		// leaving an orphan is safer than misreporting that committed result.
		_ = s.assets.Delete(uri)
	}
}
