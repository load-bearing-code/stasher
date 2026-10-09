package gql

// This file will not be regenerated automatically.
//
// It serves as dependency injection for your app, add any dependencies you require
// here.

import (
	"github.com/load-bearing-code/stasher/api/internal"
)

// Version is the build-stamped API version returned by the `version` query.
// Overridden at build time via -ldflags; "dev" otherwise.
var Version = "dev"

type Resolver struct {
	Services *service.Services
	// PublicURL is the externally reachable GraphQL endpoint, reported
	// via serverMetadata.
	PublicURL string
}

func New(services *service.Services, publicURL string) *Resolver {
	return &Resolver{Services: services, PublicURL: publicURL}
}
