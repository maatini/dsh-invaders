package server

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"neoninvaders/internal/store"
)

type testEnv struct {
	handler http.Handler
	store   *store.Store
	now     time.Time
	secret  []byte
}

func newTestEnv(t *testing.T) *testEnv {
	t.Helper()
	st, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	t.Cleanup(func() { _ = st.Close() })

	env := &testEnv{
		store:  st,
		now:    time.Date(2026, 10, 19, 20, 0, 0, 0, time.UTC),
		secret: []byte("test-secret-please-do-not-use-in-production"),
	}
	logger := slog.New(slog.NewTextHandler(io.Discard, &slog.HandlerOptions{Level: slog.LevelError}))
	srv, err := New(st, Options{
		Secret:  env.secret,
		Version: "test",
		Logger:  logger,
		Now:     func() time.Time { return env.now },
	})
	if err != nil {
		t.Fatalf("server.New: %v", err)
	}
	env.handler = srv.Handler()
	return env
}

func (e *testEnv) do(t *testing.T, method, path string, form url.Values, headers map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	var body io.Reader
	if form != nil {
		body = strings.NewReader(form.Encode())
	}
	req := httptest.NewRequest(method, path, body)
	if form != nil {
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	}
	for key, value := range headers {
		req.Header.Set(key, value)
	}
	rec := httptest.NewRecorder()
	e.handler.ServeHTTP(rec, req)
	return rec
}

func TestPagesRender(t *testing.T) {
	env := newTestEnv(t)
	cases := []struct {
		path     string
		contains string
	}{
		{"/", "Neon"},
		{"/scores", "Bestenliste"},
		{"/settings", "Schwierigkeitsgrad"},
		{"/play", "game-canvas"},
	}
	for _, tc := range cases {
		rec := env.do(t, http.MethodGet, tc.path, nil, nil)
		if rec.Code != http.StatusOK {
			t.Errorf("GET %s = %d, want 200; body: %s", tc.path, rec.Code, rec.Body.String())
			continue
		}
		if !strings.Contains(rec.Body.String(), tc.contains) {
			t.Errorf("GET %s body does not contain %q", tc.path, tc.contains)
		}
		if got := rec.Header().Get("X-Content-Type-Options"); got != "nosniff" {
			t.Errorf("GET %s missing security headers, got %q", tc.path, got)
		}
	}
}

func TestPlayPageEmbedsTokenAndHighscore(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()
	if _, err := env.store.Add(ctx, store.NewScore{Name: "Ada", Score: 4200, Level: 6, Difficulty: "hard"}); err != nil {
		t.Fatalf("Add: %v", err)
	}
	rec := env.do(t, http.MethodGet, "/play", nil, nil)
	body := rec.Body.String()
	for _, want := range []string{`data-token="`, `data-highscore="4200"`, `data-difficulty="normal"`, "data-sound=\"on\""} {
		if !strings.Contains(body, want) {
			t.Errorf("play page missing %q", want)
		}
	}
}

func TestHealth(t *testing.T) {
	env := newTestEnv(t)
	rec := env.do(t, http.MethodGet, "/healthz", nil, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("health status = %d, want 200", rec.Code)
	}
	var payload map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode health JSON: %v", err)
	}
	if payload["status"] != "ok" || payload["database"] != "ok" {
		t.Errorf("health payload = %v", payload)
	}
}

func TestSubmitScore(t *testing.T) {
	env := newTestEnv(t)
	token, err := issueRunToken(env.secret, env.now.Add(-90*time.Second), "hard")
	if err != nil {
		t.Fatalf("issueRunToken: %v", err)
	}
	form := url.Values{
		"token": {token},
		"name":  {"  Nova  "},
		"score": {"1230"},
		"level": {"3"},
	}
	rec := env.do(t, http.MethodPost, "/api/scores", form, map[string]string{"HX-Request": "true"})
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201; body: %s", rec.Code, rec.Body.String())
	}
	body := rec.Body.String()
	if !strings.Contains(body, "Platz #1") {
		t.Errorf("success body missing rank: %s", body)
	}
	if !strings.Contains(body, "Nova") || !strings.Contains(body, "1.230") {
		t.Errorf("success body missing name or score: %s", body)
	}

	top, err := env.store.Top(context.Background(), 10)
	if err != nil {
		t.Fatalf("Top: %v", err)
	}
	if len(top) != 1 {
		t.Fatalf("stored %d scores, want 1", len(top))
	}
	if top[0].Name != "Nova" || top[0].Score != 1230 || top[0].Difficulty != "hard" || top[0].Level != 3 {
		t.Errorf("stored score = %+v", top[0])
	}
}

func TestSubmitScoreRejectsCheating(t *testing.T) {
	env := newTestEnv(t)
	validToken, err := issueRunToken(env.secret, env.now.Add(-10*time.Second), "normal")
	if err != nil {
		t.Fatalf("issueRunToken: %v", err)
	}
	expiredToken, err := issueRunToken(env.secret, env.now.Add(-5*time.Hour), "normal")
	if err != nil {
		t.Fatalf("issueRunToken: %v", err)
	}

	cases := []struct {
		name string
		form url.Values
		want int
	}{
		{
			name: "invalid token",
			form: url.Values{"token": {"forged.token"}, "name": {"Nova"}, "score": {"100"}, "level": {"1"}},
			want: http.StatusUnprocessableEntity,
		},
		{
			name: "expired token",
			form: url.Values{"token": {expiredToken}, "name": {"Nova"}, "score": {"100"}, "level": {"1"}},
			want: http.StatusUnprocessableEntity,
		},
		{
			name: "implausible score",
			form: url.Values{"token": {validToken}, "name": {"Nova"}, "score": {"500000"}, "level": {"1"}},
			want: http.StatusUnprocessableEntity,
		},
		{
			name: "implausible level",
			form: url.Values{"token": {validToken}, "name": {"Nova"}, "score": {"100"}, "level": {"90"}},
			want: http.StatusUnprocessableEntity,
		},
		{
			name: "invalid name",
			form: url.Values{"token": {validToken}, "name": {"Nova<script>"}, "score": {"100"}, "level": {"1"}},
			want: http.StatusUnprocessableEntity,
		},
		{
			name: "missing score",
			form: url.Values{"token": {validToken}, "name": {"Nova"}, "score": {""}, "level": {"1"}},
			want: http.StatusUnprocessableEntity,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := env.do(t, http.MethodPost, "/api/scores", tc.form, map[string]string{"HX-Request": "true"})
			if rec.Code != tc.want {
				t.Errorf("status = %d, want %d; body: %s", rec.Code, tc.want, rec.Body.String())
			}
		})
	}

	top, err := env.store.Top(context.Background(), 10)
	if err != nil {
		t.Fatalf("Top: %v", err)
	}
	if len(top) != 0 {
		t.Errorf("rejected submissions were stored: %+v", top)
	}
}

func TestNewRunToken(t *testing.T) {
	env := newTestEnv(t)
	req := httptest.NewRequest(http.MethodGet, "/api/run", nil)
	req.AddCookie(&http.Cookie{Name: difficultyCookie, Value: "hard"})
	rec := httptest.NewRecorder()
	env.handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var payload struct {
		Token      string `json:"token"`
		Difficulty string `json:"difficulty"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if payload.Difficulty != "hard" {
		t.Errorf("difficulty = %q, want hard", payload.Difficulty)
	}
	info, err := verifyRunToken(env.secret, payload.Token, env.now)
	if err != nil {
		t.Fatalf("verifyRunToken: %v", err)
	}
	if info.Difficulty != "hard" {
		t.Errorf("token difficulty = %q, want hard", info.Difficulty)
	}
}

func TestSettingsRoundTrip(t *testing.T) {
	env := newTestEnv(t)
	form := url.Values{"sound": {"on"}, "difficulty": {"easy"}}
	rec := env.do(t, http.MethodPost, "/settings", form, map[string]string{"HX-Request": "true"})
	if rec.Code != http.StatusOK {
		t.Fatalf("settings status = %d, want 200", rec.Code)
	}
	cookies := rec.Result().Cookies()
	values := map[string]string{}
	for _, cookie := range cookies {
		values[cookie.Name] = cookie.Value
	}
	if values[soundCookie] != "on" || values[difficultyCookie] != "easy" {
		t.Fatalf("cookies = %v, want sound=on, difficulty=easy", values)
	}
	if !strings.Contains(rec.Body.String(), "Einstellungen gespeichert") {
		t.Errorf("settings response missing confirmation")
	}

	// A request with the fresh cookies renders the game with easy mode.
	req := httptest.NewRequest(http.MethodGet, "/play", nil)
	for _, cookie := range cookies {
		req.AddCookie(cookie)
	}
	page := httptest.NewRecorder()
	env.handler.ServeHTTP(page, req)
	if !strings.Contains(page.Body.String(), `data-difficulty="easy"`) {
		t.Error("play page did not pick up the easy difficulty")
	}
}

func TestScoreAPIAndNotFound(t *testing.T) {
	env := newTestEnv(t)
	rec := env.do(t, http.MethodGet, "/api/nope", nil, nil)
	if rec.Code != http.StatusNotFound {
		t.Errorf("unknown API status = %d, want 404", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.Contains(ct, "application/json") {
		t.Errorf("unknown API content type = %q", ct)
	}

	rec = env.do(t, http.MethodGet, "/does-not-exist", nil, nil)
	if rec.Code != http.StatusNotFound {
		t.Errorf("unknown page status = %d, want 404", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "existiert nicht") {
		t.Error("unknown page did not render the error template")
	}
}

func TestPlausibilityBounds(t *testing.T) {
	if got := plausibleMaxScore(-time.Second); got != 0 {
		t.Errorf("negative elapsed max score = %d, want 0", got)
	}
	if got := plausibleMaxScore(0); got != 2000 {
		t.Errorf("zero elapsed max score = %d, want 2000", got)
	}
	if got := plausibleMaxScore(10 * time.Second); got != 27000 {
		t.Errorf("10s max score = %d, want 27000", got)
	}
	if got := plausibleMaxScore(48 * time.Hour); got != maxScore {
		t.Errorf("huge elapsed max score = %d, want cap %d", got, maxScore)
	}
	if got := plausibleMaxLevel(0); got != 1 {
		t.Errorf("zero elapsed max level = %d, want 1", got)
	}
	if got := plausibleMaxLevel(5 * time.Minute); got != 26 {
		t.Errorf("5min max level = %d, want 26", got)
	}
}
