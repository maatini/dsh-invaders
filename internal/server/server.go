// Package server serves the HTMX shell, static game assets and the score API.
package server

import (
	"bytes"
	"errors"
	"html/template"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/maatini/dsh-invaders/internal/store"
	"github.com/maatini/dsh-invaders/web"
)

var errNilStore = errors.New("server: score store must not be nil")

// Server wires the score store, templates and static assets together.
type Server struct {
	store     *store.Store
	log       *slog.Logger
	templates *template.Template
	static    http.Handler
	secret    []byte
	version   string
	now       func() time.Time
	started   time.Time
	runs      *runRegistry
}

// Options configures a Server. Zero values are replaced by sane defaults.
type Options struct {
	Secret  []byte
	Version string
	Now     func() time.Time
	Logger  *slog.Logger
}

// New builds a server. It fails when the embedded templates cannot be parsed
// or no signing secret can be generated.
func New(st *store.Store, opts Options) (*Server, error) {
	if st == nil {
		return nil, errNilStore
	}
	logger := opts.Logger
	if logger == nil {
		logger = slog.Default()
	}
	now := opts.Now
	if now == nil {
		now = time.Now
	}
	secret := opts.Secret
	if len(secret) == 0 {
		var err error
		secret, err = newSecret()
		if err != nil {
			return nil, err
		}
	}

	s := &Server{
		store:   st,
		log:     logger,
		static:  http.FileServer(http.FS(web.Static())),
		secret:  secret,
		version: strings.TrimSpace(opts.Version),
		now:     now,
		started: now(),
		runs:    newRunRegistry(),
	}
	if s.version == "" {
		s.version = "dev"
	}

	tmpl, err := template.New("neon-invaders").Funcs(templateFuncs()).ParseFS(web.Templates(), "templates/*.html")
	if err != nil {
		return nil, err
	}
	s.templates = tmpl
	return s, nil
}

// Handler returns the fully wrapped HTTP handler.
func (s *Server) Handler() http.Handler {
	mux := s.routes()
	return recoverPanics(s.log)(
		securityHeaders(
			s.logRequests(
				gzipResponses(
					sameOrigin(mux),
				),
			),
		),
	)
}

func (s *Server) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /{$}", s.handleHome)
	mux.HandleFunc("GET /scores", s.handleScores)
	mux.HandleFunc("GET /settings", s.handleSettingsPage)
	mux.HandleFunc("POST /settings", s.handleSaveSettings)
	mux.HandleFunc("GET /play", s.handlePlay)
	mux.HandleFunc("POST /api/scores", s.handleSubmitScore)
	mux.HandleFunc("GET /api/scores", s.handleScoresAPI)
	mux.HandleFunc("GET /api/run", s.handleNewRun)
	mux.HandleFunc("GET /healthz", s.handleHealth)
	mux.Handle("GET /static/", http.StripPrefix("/static/", noDirectoryListing(s.static)))
	mux.HandleFunc("GET /", s.handleNotFound)
	return mux
}

// pageData is the view model shared by all templates.
type pageData struct {
	Title      string
	Nav        string
	Settings   Settings
	Best       store.Score
	HasBest    bool
	Scores     []store.Score
	Stats      store.Stats
	Highscore  int
	Rank       int
	Token      string
	Form       scoreFormData
	Saved      bool
	Error      string
	Notice     string
	Status     int
	StatusText string
	Year       int
}

// scoreFormData backs the game-over form partial.
type scoreFormData struct {
	Token      string
	Score      int
	Level      int
	Name       string
	Error      string
	Difficulty string
}

func (s *Server) page(r *http.Request, title, nav string) pageData {
	return pageData{
		Title:    title,
		Nav:      nav,
		Settings: readSettings(r),
		Year:     s.now().Year(),
	}
}

// render executes a template into a buffer first so a template error cannot
// leave a half-written page behind.
func (s *Server) render(w http.ResponseWriter, r *http.Request, status int, name string, data pageData) {
	var buf bytes.Buffer
	if err := s.templates.ExecuteTemplate(&buf, name, data); err != nil {
		s.log.Error("render template", "template", name, "err", err)
		http.Error(w, "Interner Serverfehler", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	if r.Method == http.MethodHead {
		return
	}
	if _, err := buf.WriteTo(w); err != nil {
		s.log.Debug("write response", "err", err)
	}
}

// loadLeaderboard fills the best score and top list. Failures are logged and
// surfaced in the UI without failing the whole page.
func (s *Server) loadLeaderboard(r *http.Request, data *pageData, limit int) {
	ctx := r.Context()
	best, err := s.store.Best(ctx)
	switch {
	case err == nil:
		data.Best = best
		data.HasBest = true
		data.Highscore = best.Score
	case err != nil && !isNoScores(err):
		s.log.Error("load best score", "err", err)
		data.Notice = "Die Bestenliste ist gerade nicht erreichbar."
	}
	scores, err := s.store.Top(ctx, limit)
	if err != nil {
		s.log.Error("load top scores", "err", err)
		data.Notice = "Die Bestenliste ist gerade nicht erreichbar."
	}
	data.Scores = scores
}

func isNoScores(err error) bool {
	return errors.Is(err, store.ErrNoScores)
}

// ---- template helpers -------------------------------------------------------

func templateFuncs() template.FuncMap {
	return template.FuncMap{
		"formatNumber": formatNumber,
		"formatDate":   formatDate,
		"difficulty":   difficultyLabel,
		"initial":      initial,
		"rank":         func(i int) string { return leftPad(strconv.Itoa(i+1), 2, '0') },
	}
}

// formatNumber renders 12345 as "12.345" (German thousands separator).
func formatNumber(n int) string {
	sign := ""
	if n < 0 {
		sign = "-"
		n = -n
	}
	s := strconv.Itoa(n)
	var b strings.Builder
	lead := len(s) % 3
	if lead == 0 {
		lead = 3
	}
	b.WriteString(s[:lead])
	for i := lead; i < len(s); i += 3 {
		b.WriteByte('.')
		b.WriteString(s[i : i+3])
	}
	return sign + b.String()
}

func formatDate(t time.Time) string {
	if t.IsZero() {
		return "–"
	}
	return t.In(time.Local).Format("02.01.2006")
}

func initial(name string) string {
	for _, r := range strings.TrimSpace(name) {
		return string(unicode.ToUpper(r))
	}
	return "?"
}

func leftPad(s string, width int, pad rune) string {
	n := utf8.RuneCountInString(s)
	if n >= width {
		return s
	}
	return strings.Repeat(string(pad), width-n) + s
}
