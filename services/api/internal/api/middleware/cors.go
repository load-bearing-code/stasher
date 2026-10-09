package middleware

import (
	"net/http"
	"strings"
)

// CORS adds CORS response headers for browser clients and short-circuits
// preflight (OPTIONS) requests with 204. allowedOrigins is a
// comma-separated allowlist; empty allows any origin, so local dev just
// works. It must wrap APIKey so preflight requests, which carry no
// ApiKey header, aren't rejected before reaching here.
func CORS(allowedOrigins string) func(http.Handler) http.Handler {
	allowed := parseOrigins(allowedOrigins)
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if origin != "" && originAllowed(origin, allowed) {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Add("Vary", "Origin")
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
				w.Header().Set("Access-Control-Allow-Headers", "Content-Type, ApiKey")
			}
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// parseOrigins splits a comma-separated origin list into a trimmed set.
// A nil result means "allow any origin".
func parseOrigins(raw string) map[string]struct{} {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	set := make(map[string]struct{})
	for _, o := range strings.Split(raw, ",") {
		if o = strings.TrimSpace(o); o != "" {
			set[o] = struct{}{}
		}
	}
	return set
}

// originAllowed reports whether origin is permitted. A nil allowlist
// permits any origin.
func originAllowed(origin string, allowed map[string]struct{}) bool {
	if allowed == nil {
		return true
	}
	_, ok := allowed[origin]
	return ok
}
