//go:build tools

// Pins codegen tool versions in go.sum without importing them into the
// built binary. Run with `go run <import path>` (see justfile).
package tools

import (
	_ "github.com/99designs/gqlgen"
	_ "github.com/pressly/goose/v3/cmd/goose"
)
