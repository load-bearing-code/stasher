// Package config loads runtime configuration from the environment.
package config

import "os"

// Config holds the API's runtime configuration, loaded from env.
type Config struct {
	// ListenAddr is the address the HTTP server binds to (ADDR).
	ListenAddr string
	// DBPath is the filesystem path to the SQLite database (DB_PATH).
	DBPath string
	// APIKey, when set, must be sent as the ApiKey request header on
	// every /graphql request (API_KEY). Unset by default so local dev
	// just works.
	APIKey string
	// PublicURL is the externally reachable URL of the GraphQL endpoint
	// (PUBLIC_URL), reported via serverMetadata. The server sits behind
	// a proxy, so it cannot derive this from ListenAddr.
	PublicURL string
	// CORSOrigins is a comma-separated allowlist of browser origins
	// permitted to call the API (CORS_ORIGINS). Empty allows any origin,
	// so local dev just works.
	CORSOrigins string
}

// Load reads configuration from the environment, applying defaults.
func Load() *Config {
	return &Config{
		ListenAddr:  envOr("ADDR", ":8080"),
		DBPath:      envOr("DB_PATH", "stasher.db"),
		APIKey:      os.Getenv("API_KEY"),
		PublicURL:   os.Getenv("PUBLIC_URL"),
		CORSOrigins: os.Getenv("CORS_ORIGINS"),
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
