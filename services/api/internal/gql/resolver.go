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
}

func New(services *service.Services) *Resolver {
	return &Resolver{Services: services}
}
