// Package middleware holds HTTP middleware shared by the API's router.
package middleware

import "net/http"

// APIKey rejects requests whose `ApiKey` header doesn't match expected.
// When expected is empty (no API_KEY configured) it is a no-op, so local
// dev just works.
func APIKey(expected string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		if expected == "" {
			return next
		}
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Header.Get("ApiKey") != expected {
				http.Error(w, "invalid or missing ApiKey header", http.StatusUnauthorized)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
