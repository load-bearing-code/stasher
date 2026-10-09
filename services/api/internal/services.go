// Package service holds the aggregate of services the API depends on,
// passed to the GraphQL resolver as a single struct so adding a service
// later changes this struct rather than every resolver signature.
package service

import (
	"github.com/load-bearing-code/stasher/api/internal/platforms"
	"github.com/load-bearing-code/stasher/api/internal/studios"
)

// Services aggregates the services the GraphQL resolver depends on.
type Services struct {
	Platforms *platforms.Service
	Studios   *studios.Service
}
