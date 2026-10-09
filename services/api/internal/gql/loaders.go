package gql

import (
	"context"
	"net/http"

	"github.com/vikstrous/dataloadgen"

	"github.com/load-bearing-code/stasher/api/internal"
	"github.com/load-bearing-code/stasher/api/internal/performers"
	"github.com/load-bearing-code/stasher/api/internal/platforms"
	"github.com/load-bearing-code/stasher/api/internal/studios"
	"github.com/load-bearing-code/stasher/api/internal/tags"
)

// Loaders batches and caches the by-id lookups resolvers make while
// walking a single GraphQL response (e.g. one Platform lookup per
// PlatformAccount row), collapsing them into one query per type instead
// of one query per row. A fresh set is built per request (see
// LoadersMiddleware) so caches never leak across requests.
type Loaders struct {
	Platform  *dataloadgen.Loader[string, platforms.Platform]
	Studio    *dataloadgen.Loader[string, studios.Studio]
	Performer *dataloadgen.Loader[string, performers.Performer]
	Tag       *dataloadgen.Loader[string, tags.Tag]
}

func newLoaders(services *service.Services) *Loaders {
	return &Loaders{
		Platform:  dataloadgen.NewMappedLoader(services.Platforms.GetByIDs),
		Studio:    dataloadgen.NewMappedLoader(services.Studios.GetByIDs),
		Performer: dataloadgen.NewMappedLoader(services.Performers.GetByIDs),
		Tag:       dataloadgen.NewMappedLoader(services.Tags.GetByIDs),
	}
}

type loadersKey struct{}

// LoadersMiddleware stashes a fresh set of per-request Loaders in the
// request context, ahead of the GraphQL handler so every resolver walking
// that request's response shares the same batching window and cache.
func LoadersMiddleware(services *service.Services) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := context.WithValue(r.Context(), loadersKey{}, newLoaders(services))
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// loadersFromContext retrieves the Loaders stashed by LoadersMiddleware.
func loadersFromContext(ctx context.Context) *Loaders {
	return ctx.Value(loadersKey{}).(*Loaders)
}
