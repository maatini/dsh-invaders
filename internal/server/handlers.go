package server

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/maatini/dsh-invaders/internal/store"
)

const maxFormBytes = 32 << 10

func (s *Server) handleHome(w http.ResponseWriter, r *http.Request) {
	data := s.page(r, "Start", "home")
	s.loadLeaderboard(r, &data, 5)
	s.render(w, r, http.StatusOK, "home.html", data)
}

func (s *Server) handleScores(w http.ResponseWriter, r *http.Request) {
	data := s.page(r, "Bestenliste", "scores")
	s.loadLeaderboard(r, &data, 10)
	stats, err := s.store.Stats(r.Context())
	if err != nil {
		s.log.Error("load score stats", "err", err)
		data.Notice = "Die Bestenliste ist gerade nicht erreichbar."
	}
	data.Stats = stats
	s.render(w, r, http.StatusOK, "scores.html", data)
}

func (s *Server) handleSettingsPage(w http.ResponseWriter, r *http.Request) {
	data := s.page(r, "Einstellungen", "settings")
	data.Saved = r.URL.Query().Get("saved") == "1"
	s.render(w, r, http.StatusOK, "settings.html", data)
}

func (s *Server) handleSaveSettings(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxFormBytes)
	settings := settingsFromForm(r)
	writeSettings(w, r, settings)

	if r.Header.Get("HX-Request") == "true" {
		data := s.page(r, "Einstellungen", "settings")
		data.Settings = settings
		data.Saved = true
		w.Header().Set("HX-Trigger", "settingsSaved")
		s.render(w, r, http.StatusOK, "settings-panel", data)
		return
	}
	http.Redirect(w, r, "/settings?saved=1", http.StatusSeeOther)
}

func (s *Server) handlePlay(w http.ResponseWriter, r *http.Request) {
	data := s.page(r, "Spiel", "play")

	best, err := s.store.Best(r.Context())
	switch {
	case err == nil:
		data.Best = best
		data.HasBest = true
		data.Highscore = best.Score
	case !isNoScores(err):
		s.log.Error("load highscore", "err", err)
		data.Notice = "Highscore konnte nicht geladen werden."
	}

	token, err := issueRunToken(s.secret, s.now(), data.Settings.Difficulty)
	if err != nil {
		s.log.Error("issue run token", "err", err)
		s.renderError(w, r, http.StatusInternalServerError, "Der Spielstart ist momentan nicht möglich.")
		return
	}
	data.Token = token
	data.Form = scoreFormData{
		Token:      token,
		Level:      1,
		Difficulty: data.Settings.Difficulty,
	}
	s.render(w, r, http.StatusOK, "play.html", data)
}

func (s *Server) handleSubmitScore(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxFormBytes)
	if err := r.ParseForm(); err != nil {
		status := http.StatusBadRequest
		message := "Die Anfrage konnte nicht gelesen werden."
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			status = http.StatusRequestEntityTooLarge
			message = "Die Anfrage ist zu groß."
		}
		s.renderScoreError(w, r, status, scoreFormData{}, message)
		return
	}

	form := scoreFormData{
		Token: strings.TrimSpace(r.FormValue("token")),
		Name:  store.NormalizeName(r.FormValue("name")),
	}
	form.Score, _ = strconv.Atoi(strings.TrimSpace(r.FormValue("score")))
	form.Level, _ = strconv.Atoi(strings.TrimSpace(r.FormValue("level")))
	if form.Level < 1 {
		form.Level = 1
	}
	rawScore := strings.TrimSpace(r.FormValue("score"))
	rawLevel := strings.TrimSpace(r.FormValue("level"))

	fail := func(status int, msg string) {
		s.renderScoreError(w, r, status, form, msg)
	}

	info, err := verifyRunToken(s.secret, form.Token, s.now())
	if err != nil {
		fail(http.StatusUnprocessableEntity, "Dieser Lauf ist abgelaufen oder ungültig. Bitte starte ein neues Spiel.")
		return
	}
	form.Difficulty = info.Difficulty

	if _, err := strconv.Atoi(rawScore); err != nil {
		fail(http.StatusUnprocessableEntity, "Der Score ist ungültig.")
		return
	}
	if _, err := strconv.Atoi(rawLevel); err != nil {
		fail(http.StatusUnprocessableEntity, "Das Level ist ungültig.")
		return
	}
	if err := store.ValidateName(form.Name); err != nil {
		fail(http.StatusUnprocessableEntity, nameError(err))
		return
	}
	if form.Score < 0 || form.Score > maxScore {
		fail(http.StatusUnprocessableEntity, "Der Score liegt außerhalb des gültigen Bereichs.")
		return
	}

	elapsed := s.now().Sub(info.IssuedAt)
	if form.Score > plausibleMaxScore(elapsed) {
		s.log.Warn("rejected implausible score", "score", form.Score, "level", form.Level, "elapsed", elapsed)
		fail(http.StatusUnprocessableEntity, "Dieser Score ist zeitlich nicht plausibel. Bitte spiele fair!")
		return
	}
	if form.Level > plausibleMaxLevel(elapsed) {
		s.log.Warn("rejected implausible level", "score", form.Score, "level", form.Level, "elapsed", elapsed)
		fail(http.StatusUnprocessableEntity, "Dieses Level ist zeitlich nicht plausibel. Bitte spiele fair!")
		return
	}

	if !s.runs.claim(info.ID, s.now()) {
		fail(http.StatusUnprocessableEntity, "Dieser Lauf wurde bereits eingetragen. Bitte starte ein neues Spiel.")
		return
	}

	rank, err := s.store.Rank(r.Context(), form.Score)
	if err != nil {
		s.runs.release(info.ID)
		s.log.Error("compute rank", "err", err)
		fail(http.StatusInternalServerError, "Der Score konnte nicht gespeichert werden. Bitte versuche es erneut.")
		return
	}

	saved, err := s.store.Add(r.Context(), store.NewScore{
		Name:       form.Name,
		Score:      form.Score,
		Level:      form.Level,
		Difficulty: info.Difficulty,
	})
	if err != nil {
		s.runs.release(info.ID)
		s.log.Error("save score", "err", err)
		fail(http.StatusInternalServerError, "Der Score konnte nicht gespeichert werden. Bitte versuche es erneut.")
		return
	}

	data := s.page(r, "Score gespeichert", "play")
	data.Form = scoreFormData{
		Token:      form.Token,
		Name:       saved.Name,
		Score:      saved.Score,
		Level:      saved.Level,
		Difficulty: saved.Difficulty,
	}
	data.Rank = rank
	s.render(w, r, http.StatusCreated, "score-saved", data)
}

func (s *Server) renderScoreError(w http.ResponseWriter, r *http.Request, status int, form scoreFormData, msg string) {
	form.Error = msg
	data := s.page(r, "Spiel", "play")
	data.Form = form
	s.render(w, r, status, "score-form", data)
}

func nameError(err error) string {
	switch {
	case errors.Is(err, store.ErrInvalidEntry) && strings.Contains(err.Error(), "empty"):
		return "Bitte gib einen Namen ein."
	case errors.Is(err, store.ErrInvalidEntry):
		return "Name: 1–16 Zeichen, nur Buchstaben, Zahlen, Leerzeichen, Punkt, Bindestrich oder Unterstrich."
	default:
		return "Der Name ist ungültig."
	}
}

// handleNewRun issues a fresh signed run token so every run gets its own
// plausibility window, even when several runs happen without a page reload.
func (s *Server) handleNewRun(w http.ResponseWriter, r *http.Request) {
	settings := readSettings(r)
	token, err := issueRunToken(s.secret, s.now(), settings.Difficulty)
	if err != nil {
		s.log.Error("issue run token", "err", err)
		s.writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "could not start run"})
		return
	}
	s.writeJSON(w, http.StatusOK, struct {
		Token      string `json:"token"`
		Difficulty string `json:"difficulty"`
	}{Token: token, Difficulty: settings.Difficulty})
}

func (s *Server) handleScoresAPI(w http.ResponseWriter, r *http.Request) {
	type response struct {
		Best   *store.Score  `json:"best"`
		Scores []store.Score `json:"scores"`
	}
	var out response

	best, err := s.store.Best(r.Context())
	switch {
	case err == nil:
		out.Best = &best
	case !isNoScores(err):
		s.writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "database unavailable"})
		return
	}
	scores, err := s.store.Top(r.Context(), 10)
	if err != nil {
		s.writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "database unavailable"})
		return
	}
	out.Scores = scores
	s.writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()

	type health struct {
		Status        string `json:"status"`
		Database      string `json:"database"`
		Version       string `json:"version"`
		UptimeSeconds int64  `json:"uptimeSeconds"`
	}
	h := health{
		Status:        "ok",
		Database:      "ok",
		Version:       s.version,
		UptimeSeconds: int64(s.now().Sub(s.started).Seconds()),
	}
	status := http.StatusOK
	if err := s.store.Ping(ctx); err != nil {
		s.log.Error("health check failed", "err", err)
		h.Status = "degraded"
		h.Database = "unavailable"
		status = http.StatusServiceUnavailable
	}
	w.Header().Set("Cache-Control", "no-store")
	s.writeJSON(w, status, h)
}

func (s *Server) handleNotFound(w http.ResponseWriter, r *http.Request) {
	if strings.HasPrefix(r.URL.Path, "/api/") {
		s.writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	s.renderError(w, r, http.StatusNotFound, "Diese Seite existiert nicht.")
}

func (s *Server) renderError(w http.ResponseWriter, r *http.Request, status int, message string) {
	data := s.page(r, "Fehler", "")
	data.Status = status
	data.StatusText = germanStatusText(status)
	data.Error = message
	s.render(w, r, status, "error.html", data)
}

func germanStatusText(status int) string {
	switch status {
	case http.StatusBadRequest:
		return "Ungültige Anfrage"
	case http.StatusForbidden:
		return "Zugriff verweigert"
	case http.StatusNotFound:
		return "Nicht gefunden"
	case http.StatusMethodNotAllowed:
		return "Methode nicht erlaubt"
	case http.StatusRequestEntityTooLarge:
		return "Anfrage zu groß"
	case http.StatusUnprocessableEntity:
		return "Ungültige Eingabe"
	case http.StatusInternalServerError:
		return "Interner Serverfehler"
	case http.StatusServiceUnavailable:
		return "Dienst nicht verfügbar"
	default:
		return "Fehler"
	}
}

func (s *Server) writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		s.log.Debug("encode json", "err", err)
	}
}
