package assets

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestStoreSavesAndServesImage(t *testing.T) {
	store, err := NewStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	contents := []byte("image contents")
	uri, err := store.SaveImage("platforms/icons", Upload{
		File:        bytes.NewReader(contents),
		Filename:    "icon.png",
		ContentType: "image/png",
	})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(uri, "/assets/platforms/icons/") || !strings.HasSuffix(uri, ".png") {
		t.Fatalf("unexpected asset URI %q", uri)
	}

	response := httptest.NewRecorder()
	store.ServeHTTP(response, httptest.NewRequest(http.MethodGet, uri, nil))
	if response.Code != http.StatusOK {
		t.Fatalf("GET %s returned %d", uri, response.Code)
	}
	served, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(served, contents) {
		t.Fatalf("served contents %q, want %q", served, contents)
	}
	if got := response.Header().Get("Content-Type"); got != "image/png" {
		t.Fatalf("Content-Type = %q, want image/png", got)
	}
	if got := response.Header().Get("Cache-Control"); got != "public, max-age=31536000, immutable" {
		t.Fatalf("Cache-Control = %q", got)
	}

	if err := store.Delete(uri); err != nil {
		t.Fatal(err)
	}
	response = httptest.NewRecorder()
	store.ServeHTTP(response, httptest.NewRequest(http.MethodGet, uri, nil))
	if response.Code != http.StatusNotFound {
		t.Fatalf("GET deleted asset returned %d, want 404", response.Code)
	}
}

func TestStoreRejectsUnsupportedFilesAndUnsafePaths(t *testing.T) {
	store, err := NewStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.SaveImage("platforms/icons", Upload{
		File:        bytes.NewReader([]byte("not an image")),
		Filename:    "payload.html",
		ContentType: "text/html",
	}); err == nil {
		t.Fatal("SaveImage accepted an unsupported content type")
	}
	if _, err := store.SaveImage("../outside", Upload{
		File:        bytes.NewReader(nil),
		Filename:    "icon.png",
		ContentType: "image/png",
	}); err == nil {
		t.Fatal("SaveImage accepted a path outside the asset root")
	}
	if err := store.Delete("/not-assets/file.png"); err == nil {
		t.Fatal("Delete accepted a URI outside the asset prefix")
	}
	if err := store.Delete("/assets/."); err == nil {
		t.Fatal("Delete accepted the asset root")
	}

	response := httptest.NewRecorder()
	store.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/assets/", nil))
	if response.Code != http.StatusNotFound {
		t.Fatalf("asset root returned %d, want 404", response.Code)
	}
	response = httptest.NewRecorder()
	store.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/assets/file.png", nil))
	if response.Code != http.StatusMethodNotAllowed {
		t.Fatalf("POST returned %d, want 405", response.Code)
	}
}
