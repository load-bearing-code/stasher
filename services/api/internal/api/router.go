// Package api composes the HTTP handler: a GraphQL endpoint and a
// playground for local exploration.
package api

import (
	"net/http"

	"github.com/99designs/gqlgen/graphql/handler"
	"github.com/99designs/gqlgen/graphql/playground"

	"github.com/load-bearing-code/stasher/api/internal"
	"github.com/load-bearing-code/stasher/api/internal/api/middleware"
	"github.com/load-bearing-code/stasher/api/internal/gql"
)

// NewRouter returns the API's HTTP handler: GraphQL at /graphql, guarded
// by an optional ApiKey header check (apiKey; empty disables the check),
// and a playground at / for local exploration.
func NewRouter(services *service.Services, apiKey string) http.Handler {
	resolver := gql.New(services)
	schema := gql.NewExecutableSchema(gql.Config{Resolvers: resolver})
	graphqlHandler := handler.NewDefaultServer(schema)

	mux := http.NewServeMux()
	mux.Handle("/", playground.Handler("Stasher API", "/graphql"))
	mux.Handle("/graphql", middleware.APIKey(apiKey)(gql.LoadersMiddleware(services)(graphqlHandler)))
	return mux
}
