package api

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/jmoiron/sqlx"
	_ "modernc.org/sqlite"

	service "github.com/load-bearing-code/stasher/api/internal"
	"github.com/load-bearing-code/stasher/api/internal/assets"
	"github.com/load-bearing-code/stasher/api/internal/migrations"
	"github.com/load-bearing-code/stasher/api/internal/performers"
	"github.com/load-bearing-code/stasher/api/internal/platformaccounts"
	"github.com/load-bearing-code/stasher/api/internal/platforms"
	"github.com/load-bearing-code/stasher/api/internal/studios"
	"github.com/load-bearing-code/stasher/api/internal/tags"
)

func TestCreatePlatformUploadsAndServesAssets(t *testing.T) {
	ctx := context.Background()
	databasePath := filepath.Join(t.TempDir(), "stasher.db")
	if err := migrations.Apply(ctx, databasePath); err != nil {
		t.Fatal(err)
	}
	db, err := sqlx.Open("sqlite", databasePath+"?_pragma=foreign_keys(1)&_pragma=journal_mode(WAL)")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	db.SetMaxOpenConns(1)

	assetStore, err := assets.NewStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	services := &service.Services{
		Platforms:        platforms.New(db, assetStore),
		Studios:          studios.New(db),
		Performers:       performers.New(db),
		PlatformAccounts: platformaccounts.New(db),
		Tags:             tags.New(db),
	}
	router := NewRouter(services, assetStore, "", "", "")

	icon := []byte("icon image")
	wordmark := []byte("wordmark image")
	request := multipartGraphQLRequest(t, icon, wordmark)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("mutation returned %d: %s", response.Code, response.Body.String())
	}

	var result struct {
		Data struct {
			CreatePlatform struct {
				ID          string  `json:"id"`
				Name        string  `json:"name"`
				IconURI     *string `json:"iconUri"`
				WordmarkURI *string `json:"wordmarkUri"`
			} `json:"createPlatform"`
		} `json:"data"`
		Errors []json.RawMessage `json:"errors"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if len(result.Errors) > 0 {
		t.Fatalf("mutation returned GraphQL errors: %s", response.Body.String())
	}
	platform := result.Data.CreatePlatform
	if platform.ID != "fansly" || platform.Name != "Fansly" {
		t.Fatalf("unexpected platform: %+v", platform)
	}
	if platform.IconURI == nil || !strings.HasPrefix(*platform.IconURI, "/assets/platforms/icons/") {
		t.Fatalf("unexpected icon URI: %v", platform.IconURI)
	}
	if platform.WordmarkURI == nil || !strings.HasPrefix(*platform.WordmarkURI, "/assets/platforms/wordmarks/") {
		t.Fatalf("unexpected wordmark URI: %v", platform.WordmarkURI)
	}

	assertAssetResponse(t, router, *platform.IconURI, icon)
	assertAssetResponse(t, router, *platform.WordmarkURI, wordmark)

	var stored struct {
		IconURI     *string `db:"icon_uri"`
		WordmarkURI *string `db:"wordmark_uri"`
	}
	if err := db.GetContext(ctx, &stored, `SELECT icon_uri, wordmark_uri FROM platforms WHERE id = 'fansly'`); err != nil {
		t.Fatal(err)
	}
	if stored.IconURI == nil || *stored.IconURI != *platform.IconURI || stored.WordmarkURI == nil || *stored.WordmarkURI != *platform.WordmarkURI {
		t.Fatalf("stored URIs %+v do not match response", stored)
	}

	originalIconURI := *platform.IconURI
	originalWordmarkURI := *platform.WordmarkURI
	updatedIcon := []byte("updated icon image")
	response = httptest.NewRecorder()
	router.ServeHTTP(response, multipartUpdateGraphQLRequest(t, updatedIcon))
	if response.Code != http.StatusOK {
		t.Fatalf("update mutation returned %d: %s", response.Code, response.Body.String())
	}
	var updateResult struct {
		Data struct {
			UpdatePlatform struct {
				IconURI     *string `json:"iconUri"`
				WordmarkURI *string `json:"wordmarkUri"`
			} `json:"updatePlatform"`
		} `json:"data"`
		Errors []json.RawMessage `json:"errors"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &updateResult); err != nil {
		t.Fatal(err)
	}
	if len(updateResult.Errors) > 0 {
		t.Fatalf("update mutation returned GraphQL errors: %s", response.Body.String())
	}
	updated := updateResult.Data.UpdatePlatform
	if updated.IconURI == nil || *updated.IconURI == originalIconURI {
		t.Fatalf("icon was not replaced: %v", updated.IconURI)
	}
	if updated.WordmarkURI == nil || *updated.WordmarkURI != originalWordmarkURI {
		t.Fatalf("omitted wordmark was not preserved: %v", updated.WordmarkURI)
	}
	assertAssetResponse(t, router, *updated.IconURI, updatedIcon)
	assertAssetResponse(t, router, *updated.WordmarkURI, wordmark)
	deletedResponse := httptest.NewRecorder()
	router.ServeHTTP(deletedResponse, httptest.NewRequest(http.MethodGet, originalIconURI, nil))
	if deletedResponse.Code != http.StatusNotFound {
		t.Fatalf("replaced icon returned %d, want 404", deletedResponse.Code)
	}
}

func multipartGraphQLRequest(t *testing.T, icon, wordmark []byte) *http.Request {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	operations := `{"query":"mutation CreatePlatform($input: CreatePlatformInput!) { createPlatform(input: $input) { id name iconUri wordmarkUri } }","variables":{"input":{"id":"fansly","name":"Fansly","icon":null,"wordmark":null}}}`
	if err := writer.WriteField("operations", operations); err != nil {
		t.Fatal(err)
	}
	if err := writer.WriteField("map", `{"0":["variables.input.icon"],"1":["variables.input.wordmark"]}`); err != nil {
		t.Fatal(err)
	}
	iconPart, err := writer.CreateFormFile("0", "icon.png")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := iconPart.Write(icon); err != nil {
		t.Fatal(err)
	}
	wordmarkPart, err := writer.CreateFormFile("1", "wordmark.webp")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := wordmarkPart.Write(wordmark); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}

	request := httptest.NewRequest(http.MethodPost, "/graphql", &body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	return request
}

func multipartUpdateGraphQLRequest(t *testing.T, icon []byte) *http.Request {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	operations := `{"query":"mutation UpdatePlatform($input: UpdatePlatformInput!) { updatePlatform(input: $input) { iconUri wordmarkUri } }","variables":{"input":{"id":"fansly","name":"Fansly Updated","icon":null}}}`
	if err := writer.WriteField("operations", operations); err != nil {
		t.Fatal(err)
	}
	if err := writer.WriteField("map", `{"0":["variables.input.icon"]}`); err != nil {
		t.Fatal(err)
	}
	iconPart, err := writer.CreateFormFile("0", "icon.png")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := iconPart.Write(icon); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}

	request := httptest.NewRequest(http.MethodPost, "/graphql", &body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	return request
}

func assertAssetResponse(t *testing.T, handler http.Handler, uri string, expected []byte) {
	t.Helper()
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, uri, nil))
	if response.Code != http.StatusOK {
		t.Fatalf("GET %s returned %d", uri, response.Code)
	}
	actual, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(actual, expected) {
		t.Fatalf("GET %s returned %q, want %q", uri, actual, expected)
	}
}
