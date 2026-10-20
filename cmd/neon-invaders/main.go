// Command neon-invaders starts the Neon Invaders web game.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"neoninvaders/internal/server"
	"neoninvaders/internal/store"
)

// version is overridden at build time with -ldflags "-X main.version=...".
var version = "dev"

func main() {
	if err := run(os.Args[1:]); err != nil {
		slog.Error("fatal", "err", err)
		os.Exit(1)
	}
}

func run(args []string) error {
	fs := flag.NewFlagSet("neon-invaders", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)
	addr := fs.String("addr", envOr("ADDR", ":4300"), "HTTP listen address")
	dbPath := fs.String("db", envOr("DB_PATH", "data/neon-invaders.db"), "path to the SQLite database")
	logLevel := fs.String("log-level", envOr("LOG_LEVEL", "info"), "log level: debug, info, warn, error")
	showVersion := fs.Bool("version", false, "print version and exit")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if *showVersion {
		fmt.Println(version)
		return nil
	}

	logger, err := newLogger(*logLevel)
	if err != nil {
		return err
	}
	slog.SetDefault(logger)

	st, err := store.Open(*dbPath)
	if err != nil {
		return err
	}
	defer func() {
		if cerr := st.Close(); cerr != nil {
			logger.Error("close score store", "err", cerr)
		}
	}()

	srv, err := server.New(st, server.Options{
		Secret:  []byte(os.Getenv("SECRET_KEY")),
		Version: version,
		Logger:  logger,
	})
	if err != nil {
		return fmt.Errorf("build server: %w", err)
	}

	httpServer := &http.Server{
		Addr:              *addr,
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	shutdownDone := make(chan struct{})
	go func() {
		<-ctx.Done()
		logger.Info("shutdown requested")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := httpServer.Shutdown(shutdownCtx); err != nil {
			logger.Error("graceful shutdown", "err", err)
			_ = httpServer.Close()
		}
		close(shutdownDone)
	}()

	logger.Info("neon invaders online",
		"addr", *addr,
		"db", *dbPath,
		"version", version,
		"url", browseURL(*addr),
	)
	if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return fmt.Errorf("serve: %w", err)
	}
	if ctx.Err() != nil {
		<-shutdownDone
	}
	logger.Info("server stopped")
	return nil
}

func newLogger(level string) (*slog.Logger, error) {
	var l slog.Level
	switch strings.ToLower(strings.TrimSpace(level)) {
	case "debug":
		l = slog.LevelDebug
	case "info", "":
		l = slog.LevelInfo
	case "warn", "warning":
		l = slog.LevelWarn
	case "error":
		l = slog.LevelError
	default:
		return nil, fmt.Errorf("unknown log level %q", level)
	}
	handler := slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: l})
	return slog.New(handler).With("app", "neon-invaders"), nil
}

func envOr(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && strings.TrimSpace(v) != "" {
		return v
	}
	return fallback
}

func browseURL(addr string) string {
	host := addr
	if strings.HasPrefix(host, ":") {
		host = "127.0.0.1" + host
	}
	if strings.HasPrefix(host, "0.0.0.0:") {
		host = "127.0.0.1:" + strings.TrimPrefix(host, "0.0.0.0:")
	}
	return "http://" + host
}
