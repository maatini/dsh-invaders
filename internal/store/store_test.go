package store

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"testing"
	"time"
)

func newTestStore(t *testing.T) *Store {
	t.Helper()
	s, err := Open(filepath.Join(t.TempDir(), "scores.db"))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() {
		if err := s.Close(); err != nil {
			t.Errorf("Close: %v", err)
		}
	})
	return s
}

func TestAddAndTop(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	for i := 1; i <= 12; i++ {
		got, err := s.Add(ctx, NewScore{
			Name:       fmt.Sprintf("Pilot %d", i),
			Score:      i * 100,
			Level:      i,
			Difficulty: "normal",
		})
		if err != nil {
			t.Fatalf("Add(%d): %v", i, err)
		}
		if got.ID == 0 {
			t.Fatalf("Add(%d): zero ID", i)
		}
		if got.CreatedAt.IsZero() {
			t.Fatalf("Add(%d): zero timestamp", i)
		}
	}

	top, err := s.Top(ctx, 10)
	if err != nil {
		t.Fatalf("Top: %v", err)
	}
	if len(top) != 10 {
		t.Fatalf("Top returned %d entries, want 10", len(top))
	}
	for i, want := range []int{1200, 1100, 1000, 900, 800, 700, 600, 500, 400, 300} {
		if top[i].Score != want {
			t.Errorf("top[%d].Score = %d, want %d", i, top[i].Score, want)
		}
	}
	if top[0].Name != "Pilot 12" {
		t.Errorf("top[0].Name = %q, want %q", top[0].Name, "Pilot 12")
	}
}

func TestTopTieBreaksByInsertionAge(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	base := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	for i := 0; i < 3; i++ {
		now := base.Add(time.Duration(i) * time.Minute)
		s.now = func() time.Time { return now }
		if _, err := s.Add(ctx, NewScore{Name: fmt.Sprint("Tie", i), Score: 500, Level: 2}); err != nil {
			t.Fatalf("Add: %v", err)
		}
	}

	top, err := s.Top(ctx, 10)
	if err != nil {
		t.Fatalf("Top: %v", err)
	}
	if len(top) != 3 {
		t.Fatalf("got %d entries, want 3", len(top))
	}
	for i, want := range []string{"Tie0", "Tie1", "Tie2"} {
		if top[i].Name != want {
			t.Errorf("top[%d].Name = %q, want %q", i, top[i].Name, want)
		}
	}
}

func TestBestRankAndStats(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	if _, err := s.Best(ctx); !errors.Is(err, ErrNoScores) {
		t.Fatalf("Best on empty store: err = %v, want ErrNoScores", err)
	}

	for _, entry := range []NewScore{
		{Name: "Ada", Score: 300, Level: 3, Difficulty: "hard"},
		{Name: "Grace", Score: 900, Level: 7, Difficulty: "hard"},
		{Name: "Linus", Score: 600, Level: 5, Difficulty: "easy"},
	} {
		if _, err := s.Add(ctx, entry); err != nil {
			t.Fatalf("Add(%q): %v", entry.Name, err)
		}
	}

	best, err := s.Best(ctx)
	if err != nil {
		t.Fatalf("Best: %v", err)
	}
	if best.Name != "Grace" || best.Score != 900 || best.Difficulty != "hard" {
		t.Errorf("Best = %+v, want Grace/900/hard", best)
	}

	for _, tc := range []struct {
		score int
		want  int
	}{
		{1000, 1}, {900, 2}, {800, 2}, {600, 3}, {599, 3}, {0, 4},
	} {
		rank, err := s.Rank(ctx, tc.score)
		if err != nil {
			t.Fatalf("Rank(%d): %v", tc.score, err)
		}
		if rank != tc.want {
			t.Errorf("Rank(%d) = %d, want %d", tc.score, rank, tc.want)
		}
	}

	stats, err := s.Stats(ctx)
	if err != nil {
		t.Fatalf("Stats: %v", err)
	}
	if stats.Runs != 3 || stats.Best != 900 || stats.Total != 1800 {
		t.Errorf("Stats = %+v, want {Runs:3 Best:900 Total:1800}", stats)
	}
}

func TestPersistenceAcrossReopen(t *testing.T) {
	path := filepath.Join(t.TempDir(), "persistent.db")
	ctx := context.Background()

	first, err := Open(path)
	if err != nil {
		t.Fatalf("Open first: %v", err)
	}
	if _, err := first.Add(ctx, NewScore{Name: "Nova", Score: 1230, Level: 4}); err != nil {
		t.Fatalf("Add: %v", err)
	}
	if err := first.Close(); err != nil {
		t.Fatalf("Close first: %v", err)
	}

	second, err := Open(path)
	if err != nil {
		t.Fatalf("Open second: %v", err)
	}
	t.Cleanup(func() { _ = second.Close() })

	top, err := second.Top(ctx, 10)
	if err != nil {
		t.Fatalf("Top: %v", err)
	}
	if len(top) != 1 || top[0].Name != "Nova" || top[0].Score != 1230 {
		t.Fatalf("Top after reopen = %+v, want Nova/1230", top)
	}
}

func TestValidation(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	if _, err := s.Add(ctx, NewScore{Name: "   ", Score: 10, Level: 1}); !errors.Is(err, ErrInvalidEntry) {
		t.Errorf("blank name: err = %v, want ErrInvalidEntry", err)
	}
	if _, err := s.Add(ctx, NewScore{Name: "ThisNameIsWayTooLong", Score: 10, Level: 1}); !errors.Is(err, ErrInvalidEntry) {
		t.Errorf("long name: err = %v, want ErrInvalidEntry", err)
	}
	if _, err := s.Add(ctx, NewScore{Name: "Bad<script>", Score: 10, Level: 1}); !errors.Is(err, ErrInvalidEntry) {
		t.Errorf("invalid chars: err = %v, want ErrInvalidEntry", err)
	}
	if _, err := s.Add(ctx, NewScore{Name: "Valid", Score: -1, Level: 1}); !errors.Is(err, ErrInvalidEntry) {
		t.Errorf("negative score: err = %v, want ErrInvalidEntry", err)
	}
	if _, err := s.Add(ctx, NewScore{Name: "Valid", Score: 10, Level: 1000}); !errors.Is(err, ErrInvalidEntry) {
		t.Errorf("level out of range: err = %v, want ErrInvalidEntry", err)
	}

	// Normalized names are persisted and unicode letters are allowed.
	got, err := s.Add(ctx, NewScore{Name: "  Zoë   Nova  ", Score: 10, Level: 1, Difficulty: "HARD"})
	if err != nil {
		t.Fatalf("Add unicode: %v", err)
	}
	if got.Name != "Zoë Nova" {
		t.Errorf("normalized name = %q, want %q", got.Name, "Zoë Nova")
	}
	if got.Difficulty != "hard" {
		t.Errorf("normalized difficulty = %q, want hard", got.Difficulty)
	}
}

func TestNormalizeDifficulty(t *testing.T) {
	for in, want := range map[string]string{
		"": "normal", "NORMAL": "normal", " easy ": "easy", "Hard": "hard", "insane": "normal",
	} {
		if got := NormalizeDifficulty(in); got != want {
			t.Errorf("NormalizeDifficulty(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestMemoryStore(t *testing.T) {
	s, err := Open(":memory:")
	if err != nil {
		t.Fatalf("Open(:memory:): %v", err)
	}
	t.Cleanup(func() { _ = s.Close() })

	if _, err := s.Add(context.Background(), NewScore{Name: "Nova", Score: 1230, Level: 2}); err != nil {
		t.Fatalf("Add: %v", err)
	}
	top, err := s.Top(context.Background(), 10)
	if err != nil {
		t.Fatalf("Top: %v", err)
	}
	if len(top) != 1 || top[0].Name != "Nova" {
		t.Fatalf("Top = %+v, want Nova", top)
	}
}

func TestTopLimitIsCapped(t *testing.T) {
	s := newTestStore(t)
	for i := 1; i <= 3; i++ {
		if _, err := s.Add(context.Background(), NewScore{Name: "Nova", Score: i * 10, Level: 1}); err != nil {
			t.Fatalf("Add: %v", err)
		}
	}
	top, err := s.Top(context.Background(), 101)
	if err != nil {
		t.Fatalf("Top: %v", err)
	}
	if len(top) != 3 {
		t.Fatalf("Top(101) returned %d entries, want 3", len(top))
	}
}
