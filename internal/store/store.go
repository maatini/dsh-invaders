// Package store persists arcade scores in SQLite.
package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	_ "modernc.org/sqlite" // pure-Go SQLite driver
)

// Sentinel errors returned by the store.
var (
	ErrInvalidEntry = errors.New("invalid score entry")
	ErrNoScores     = errors.New("no scores recorded")
)

// Score is one leaderboard entry.
type Score struct {
	ID         int64     `json:"id"`
	Name       string    `json:"name"`
	Score      int       `json:"score"`
	Level      int       `json:"level"`
	Difficulty string    `json:"difficulty"`
	CreatedAt  time.Time `json:"createdAt"`
}

// NewScore describes an entry to persist.
type NewScore struct {
	Name       string
	Score      int
	Level      int
	Difficulty string
}

// Stats is a small aggregate used by the leaderboard page.
type Stats struct {
	Runs  int
	Best  int
	Total int
}

// Store is a SQLite-backed score repository. It is safe for concurrent use.
type Store struct {
	db  *sql.DB
	now func() time.Time
}

const schema = `
CREATE TABLE IF NOT EXISTS scores (
	id         INTEGER PRIMARY KEY AUTOINCREMENT,
	name       TEXT    NOT NULL,
	score      INTEGER NOT NULL CHECK (score >= 0),
	level      INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
	difficulty TEXT    NOT NULL DEFAULT 'normal',
	created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scores_leaderboard
	ON scores (score DESC, created_at ASC, id ASC);
`

// Open opens (and creates, if needed) the SQLite database at path and applies
// the schema. Parent directories are created automatically.
func Open(path string) (*Store, error) {
	if strings.TrimSpace(path) == "" {
		return nil, errors.New("store: database path is empty")
	}
	if dir := filepath.Dir(path); dir != "." && dir != "" {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return nil, fmt.Errorf("store: create database directory: %w", err)
		}
	}

	dsn := path + "?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("store: open database: %w", err)
	}
	db.SetMaxOpenConns(4)
	db.SetMaxIdleConns(4)
	db.SetConnMaxLifetime(0)

	s := &Store{db: db, now: time.Now}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("store: ping database: %w", err)
	}
	if _, err := db.ExecContext(ctx, schema); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("store: apply schema: %w", err)
	}
	return s, nil
}

// Close releases the underlying database handle.
func (s *Store) Close() error {
	if s == nil || s.db == nil {
		return nil
	}
	return s.db.Close()
}

// Ping verifies that the database is reachable.
func (s *Store) Ping(ctx context.Context) error {
	return s.db.PingContext(ctx)
}

// Add inserts a score and returns the stored entry including server-side
// timestamps and identifiers.
func (s *Store) Add(ctx context.Context, in NewScore) (Score, error) {
	name := NormalizeName(in.Name)
	if err := ValidateName(name); err != nil {
		return Score{}, err
	}
	if in.Score < 0 || in.Score > 10_000_000 {
		return Score{}, fmt.Errorf("%w: score out of range", ErrInvalidEntry)
	}
	if in.Level < 1 {
		in.Level = 1
	}
	if in.Level > 999 {
		return Score{}, fmt.Errorf("%w: level out of range", ErrInvalidEntry)
	}
	in.Difficulty = NormalizeDifficulty(in.Difficulty)

	created := s.now().UTC().Truncate(time.Second)
	res, err := s.db.ExecContext(ctx,
		`INSERT INTO scores (name, score, level, difficulty, created_at) VALUES (?, ?, ?, ?, ?)`,
		name, in.Score, in.Level, in.Difficulty, created.Unix(),
	)
	if err != nil {
		return Score{}, fmt.Errorf("store: insert score: %w", err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return Score{}, fmt.Errorf("store: last insert id: %w", err)
	}
	return Score{
		ID:         id,
		Name:       name,
		Score:      in.Score,
		Level:      in.Level,
		Difficulty: in.Difficulty,
		CreatedAt:  created,
	}, nil
}

// Top returns the best entries, ordered by score (descending) and age
// (oldest first, so earlier runs keep the higher rank on ties).
func (s *Store) Top(ctx context.Context, limit int) ([]Score, error) {
	if limit <= 0 || limit > 100 {
		limit = 10
	}
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, name, score, level, difficulty, created_at
		 FROM scores
		 ORDER BY score DESC, created_at ASC, id ASC
		 LIMIT ?`, limit)
	if err != nil {
		return nil, fmt.Errorf("store: query top scores: %w", err)
	}
	defer rows.Close()

	scores := make([]Score, 0, limit)
	for rows.Next() {
		var (
			sc      Score
			created int64
		)
		if err := rows.Scan(&sc.ID, &sc.Name, &sc.Score, &sc.Level, &sc.Difficulty, &created); err != nil {
			return nil, fmt.Errorf("store: scan score: %w", err)
		}
		sc.CreatedAt = time.Unix(created, 0).UTC()
		scores = append(scores, sc)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("store: iterate scores: %w", err)
	}
	return scores, nil
}

// Best returns the highest score. It returns ErrNoScores when the leaderboard
// is still empty.
func (s *Store) Best(ctx context.Context) (Score, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, name, score, level, difficulty, created_at
		 FROM scores
		 ORDER BY score DESC, created_at ASC, id ASC
		 LIMIT 1`)

	var (
		sc      Score
		created int64
	)
	if err := row.Scan(&sc.ID, &sc.Name, &sc.Score, &sc.Level, &sc.Difficulty, &created); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return Score{}, ErrNoScores
		}
		return Score{}, fmt.Errorf("store: query best score: %w", err)
	}
	sc.CreatedAt = time.Unix(created, 0).UTC()
	return sc, nil
}

// Rank returns the 1-based position a new entry with the given score would
// occupy. Existing entries with the same score rank ahead of the new one.
func (s *Store) Rank(ctx context.Context, score int) (int, error) {
	var ahead int
	if err := s.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM scores WHERE score >= ?`, score).Scan(&ahead); err != nil {
		return 0, fmt.Errorf("store: query rank: %w", err)
	}
	return ahead + 1, nil
}

// Stats aggregates total runs, best score and total points.
func (s *Store) Stats(ctx context.Context) (Stats, error) {
	var (
		st    Stats
		best  sql.NullInt64
		total sql.NullInt64
	)
	if err := s.db.QueryRowContext(ctx,
		`SELECT COUNT(*), MAX(score), SUM(score) FROM scores`).Scan(&st.Runs, &best, &total); err != nil {
		return Stats{}, fmt.Errorf("store: query stats: %w", err)
	}
	st.Best = int(best.Int64)
	st.Total = int(total.Int64)
	return st, nil
}

// NormalizeName trims surrounding whitespace and collapses inner runs of
// whitespace to single spaces.
func NormalizeName(name string) string {
	return strings.Join(strings.Fields(name), " ")
}

// ValidateName enforces the public name rules: 1-16 runes, no control
// characters, and only letters, digits, spaces and a few punctuation marks.
func ValidateName(name string) error {
	if name == "" {
		return fmt.Errorf("%w: name is empty", ErrInvalidEntry)
	}
	if !utf8.ValidString(name) {
		return fmt.Errorf("%w: name is not valid UTF-8", ErrInvalidEntry)
	}
	if n := utf8.RuneCountInString(name); n > 16 {
		return fmt.Errorf("%w: name must be at most 16 characters", ErrInvalidEntry)
	}
	for _, r := range name {
		switch {
		case unicode.IsLetter(r), unicode.IsDigit(r):
		case r == ' ', r == '_', r == '-', r == '.':
		default:
			return fmt.Errorf("%w: name contains unsupported characters", ErrInvalidEntry)
		}
	}
	return nil
}

// NormalizeDifficulty maps unknown values onto the supported difficulty
// levels.
func NormalizeDifficulty(d string) string {
	switch strings.ToLower(strings.TrimSpace(d)) {
	case "easy":
		return "easy"
	case "hard":
		return "hard"
	default:
		return "normal"
	}
}
