package server

import (
	"log/slog"
	"net/http"
	"net/url"
	"runtime/debug"
	"strings"
	"time"
)

type statusRecorder struct {
	http.ResponseWriter
	status int
	bytes  int
	wrote  bool
}

func (r *statusRecorder) WriteHeader(status int) {
	if r.wrote {
		return
	}
	r.wrote = true
	r.status = status
	r.ResponseWriter.WriteHeader(status)
}

func (r *statusRecorder) Write(b []byte) (int, error) {
	if !r.wrote {
		r.WriteHeader(http.StatusOK)
	}
	n, err := r.ResponseWriter.Write(b)
	r.bytes += n
	return n, err
}

func (r *statusRecorder) Unwrap() http.ResponseWriter { return r.ResponseWriter }

// logRequests emits one structured line per request. Static files and health
// checks are logged at debug level to keep the log readable.
func (s *Server) logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w}
		next.ServeHTTP(rec, r)
		level := slog.LevelInfo
		if strings.HasPrefix(r.URL.Path, "/static/") || r.URL.Path == "/healthz" {
			level = slog.LevelDebug
		}
		s.log.Log(r.Context(), level, "http request",
			"method", r.Method,
			"path", r.URL.Path,
			"status", rec.status,
			"bytes", rec.bytes,
			"duration", time.Since(start).Round(time.Microsecond),
			"remote", r.RemoteAddr,
		)
	})
}

// recoverPanics turns a panic in any handler into a 500 instead of killing the
// process.
func recoverPanics(log *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				if recovered := recover(); recovered != nil {
					log.Error("panic in handler",
						"err", recovered,
						"method", r.Method,
						"path", r.URL.Path,
						"stack", string(debug.Stack()),
					)
					if r.Header.Get("HX-Request") == "true" {
						http.Error(w, "Interner Serverfehler", http.StatusInternalServerError)
						return
					}
					http.Error(w, "Interner Serverfehler", http.StatusInternalServerError)
				}
			}()
			next.ServeHTTP(w, r)
		})
	}
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		h.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		h.Set("Content-Security-Policy",
			"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "+
				"img-src 'self' data:; connect-src 'self'; base-uri 'none'; "+
				"form-action 'self'; frame-ancestors 'none'; object-src 'none'")
		if strings.HasPrefix(r.URL.Path, "/static/") {
			h.Set("Cache-Control", "public, max-age=300")
		}
		next.ServeHTTP(w, r)
	})
}

// sameOrigin rejects cross-site form posts when a browser supplies an Origin
// header. Requests without an Origin (curl, tests) are allowed.
func sameOrigin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete:
			if origin := r.Header.Get("Origin"); origin != "" {
				u, err := url.Parse(origin)
				if err != nil || !strings.EqualFold(u.Host, r.Host) {
					http.Error(w, "Cross-origin request blocked", http.StatusForbidden)
					return
				}
			}
		}
		next.ServeHTTP(w, r)
	})
}
