package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jmoiron/sqlx"
	_ "modernc.org/sqlite"

	"github.com/load-bearing-code/stasher/api/internal"
	"github.com/load-bearing-code/stasher/api/internal/api"
	"github.com/load-bearing-code/stasher/api/internal/migrations"
	"github.com/load-bearing-code/stasher/api/internal/performers"
	"github.com/load-bearing-code/stasher/api/internal/pkg/config"
	"github.com/load-bearing-code/stasher/api/internal/pkg/logging"
	"github.com/load-bearing-code/stasher/api/internal/platforms"
	"github.com/load-bearing-code/stasher/api/internal/studios"
)

// shutdownTimeout bounds how long in-flight requests get to finish draining
// once a shutdown signal arrives before the server forces a close.
const shutdownTimeout = 10 * time.Second

func main() {
	logger := logging.New()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if err := run(ctx, logger); err != nil {
		logger.Error("fatal", "err", err)
		os.Exit(1)
	}
}

func run(ctx context.Context, logger *slog.Logger) error {
	cfg := config.Load()

	// Bring the database schema up to date before opening the long-lived
	// pool. Migrations are the single source of truth for the schema.
	if err := migrations.Apply(ctx, cfg.DBPath); err != nil {
		return err
	}

	db, err := sqlx.Open("sqlite", cfg.DBPath+"?_pragma=foreign_keys(1)&_pragma=journal_mode(WAL)")
	if err != nil {
		return err
	}
	defer db.Close()
	// SQLite permits a single writer; one connection avoids "database is
	// locked" under concurrent access.
	db.SetMaxOpenConns(1)

	services := &service.Services{
		Platforms:  platforms.New(db),
		Studios:    studios.New(db),
		Performers: performers.New(db),
	}

	handler := api.NewRouter(services, cfg.APIKey)
	srv := &http.Server{
		Addr:              cfg.ListenAddr,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	serveErr := make(chan error, 1)
	go func() {
		logger.Info("listening", "addr", cfg.ListenAddr, "db", cfg.DBPath)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serveErr <- err
			return
		}
		serveErr <- nil
	}()

	select {
	case err := <-serveErr:
		return err
	case <-ctx.Done():
	}

	logger.Info("shutdown signal received")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()

	logger.Info("draining")
	if err := srv.Shutdown(shutdownCtx); err != nil {
		return err
	}
	logger.Info("stopped")

	return nil
}
