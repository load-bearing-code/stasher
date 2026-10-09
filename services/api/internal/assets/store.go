// Package assets stores uploaded files and serves them over HTTP.
package assets

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
)

const URLPrefix = "/assets/"

var imageExtensions = map[string]string{
	"image/avif":               ".avif",
	"image/gif":                ".gif",
	"image/jpeg":               ".jpg",
	"image/png":                ".png",
	"image/svg+xml":            ".svg",
	"image/vnd.microsoft.icon": ".ico",
	"image/webp":               ".webp",
	"image/x-icon":             ".ico",
}

var imageTypesByExtension = map[string]string{
	".avif": "image/avif",
	".gif":  "image/gif",
	".ico":  "image/vnd.microsoft.icon",
	".jpeg": "image/jpeg",
	".jpg":  "image/jpeg",
	".png":  "image/png",
	".svg":  "image/svg+xml",
	".webp": "image/webp",
}

// Upload is the transport-neutral metadata needed to persist an uploaded file.
type Upload struct {
	File        io.ReadSeeker
	Filename    string
	ContentType string
}

// Store owns files below one filesystem root and exposes them below URLPrefix.
type Store struct {
	root string
}

func NewStore(root string) (*Store, error) {
	if root == "" {
		return nil, errors.New("assets: root path is empty")
	}
	absoluteRoot, err := filepath.Abs(root)
	if err != nil {
		return nil, fmt.Errorf("assets: resolve root: %w", err)
	}
	if err := os.MkdirAll(absoluteRoot, 0o755); err != nil {
		return nil, fmt.Errorf("assets: create root: %w", err)
	}
	return &Store{root: absoluteRoot}, nil
}

// SaveImage writes upload under directory using an opaque immutable filename
// and returns the relative URI through which the store serves it.
func (s *Store) SaveImage(directory string, upload Upload) (string, error) {
	if upload.File == nil {
		return "", errors.New("assets: upload has no file")
	}
	extension, err := imageExtension(upload)
	if err != nil {
		return "", err
	}
	directory, err = cleanRelativePath(directory)
	if err != nil {
		return "", fmt.Errorf("assets: invalid directory: %w", err)
	}

	targetDirectory := filepath.Join(s.root, filepath.FromSlash(directory))
	if err := os.MkdirAll(targetDirectory, 0o755); err != nil {
		return "", fmt.Errorf("assets: create directory: %w", err)
	}
	if _, err := upload.File.Seek(0, io.SeekStart); err != nil {
		return "", fmt.Errorf("assets: rewind upload: %w", err)
	}

	randomBytes := make([]byte, 16)
	if _, err := rand.Read(randomBytes); err != nil {
		return "", fmt.Errorf("assets: generate filename: %w", err)
	}
	filename := hex.EncodeToString(randomBytes) + extension
	targetPath := filepath.Join(targetDirectory, filename)
	file, err := os.OpenFile(targetPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return "", fmt.Errorf("assets: create file: %w", err)
	}

	_, copyErr := io.Copy(file, upload.File)
	closeErr := file.Close()
	if copyErr != nil || closeErr != nil {
		_ = os.Remove(targetPath)
		return "", fmt.Errorf("assets: write file: %w", errors.Join(copyErr, closeErr))
	}

	return URLPrefix + path.Join(directory, filename), nil
}

// Delete removes a URI previously returned by SaveImage. A missing file is
// already deleted and therefore succeeds.
func (s *Store) Delete(uri string) error {
	filePath, err := s.pathForURI(uri)
	if err != nil {
		return err
	}
	if err := os.Remove(filePath); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("assets: delete file: %w", err)
	}
	return nil
}

// ServeHTTP serves stored files without exposing directory listings.
func (s *Store) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		http.Error(w, http.StatusText(http.StatusMethodNotAllowed), http.StatusMethodNotAllowed)
		return
	}

	filePath, err := s.pathForURI(r.URL.Path)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	file, err := os.Open(filePath)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil || !info.Mode().IsRegular() {
		http.NotFound(w, r)
		return
	}

	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	if contentType := mime.TypeByExtension(filepath.Ext(filePath)); contentType != "" {
		w.Header().Set("Content-Type", contentType)
	}
	http.ServeContent(w, r, info.Name(), info.ModTime(), file)
}

func (s *Store) pathForURI(uri string) (string, error) {
	if !strings.HasPrefix(uri, URLPrefix) {
		return "", errors.New("assets: URI is outside the asset prefix")
	}
	relative, err := cleanRelativePath(strings.TrimPrefix(uri, URLPrefix))
	if err != nil {
		return "", err
	}
	return filepath.Join(s.root, filepath.FromSlash(relative)), nil
}

func cleanRelativePath(value string) (string, error) {
	if value == "" || value == "." || strings.HasPrefix(value, "/") || strings.HasSuffix(value, "/") || path.Clean(value) != value || strings.HasPrefix(value, "../") || strings.Contains(value, `\`) {
		return "", errors.New("path must name a file or directory below the asset root")
	}
	return value, nil
}

func imageExtension(upload Upload) (string, error) {
	contentType, _, err := mime.ParseMediaType(upload.ContentType)
	contentType = strings.ToLower(contentType)
	if err == nil {
		if extension, ok := imageExtensions[contentType]; ok {
			return extension, nil
		}
	}

	extension := strings.ToLower(filepath.Ext(upload.Filename))
	if contentType == "" || contentType == "application/octet-stream" {
		if _, ok := imageTypesByExtension[extension]; ok {
			return extension, nil
		}
	}
	return "", fmt.Errorf("assets: unsupported image type %q", upload.ContentType)
}
