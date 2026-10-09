// Package logging constructs the application's structured logger.
package logging

import (
	"log/slog"
	"os"
)

// New returns the root application logger. When ENVIRONMENT=development it
// emits human-readable text; otherwise structured JSON.
func New() *slog.Logger {
	if os.Getenv("ENVIRONMENT") == "development" {
		return slog.New(slog.NewTextHandler(os.Stderr, nil))
	}
	return slog.New(slog.NewJSONHandler(os.Stderr, nil))
}
