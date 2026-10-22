package server

import (
	"net/http"
	"strings"

	"github.com/maatini/dsh-invaders/internal/store"
)

const (
	soundCookie      = "neon_sound"
	difficultyCookie = "neon_difficulty"
	settingsMaxAge   = 365 * 24 * 60 * 60
)

// Settings are the player's persistent preferences. They live in cookies and
// are applied by the game client on the play page.
type Settings struct {
	Sound      bool
	Difficulty string
}

func defaultSettings() Settings {
	return Settings{Sound: true, Difficulty: "normal"}
}

func normalizeSettings(s Settings) Settings {
	s.Difficulty = store.NormalizeDifficulty(s.Difficulty)
	return s
}

// readSettings loads preferences from cookies, falling back to the defaults.
func readSettings(r *http.Request) Settings {
	s := defaultSettings()
	if c, err := r.Cookie(soundCookie); err == nil {
		s.Sound = c.Value != "off"
	}
	if c, err := r.Cookie(difficultyCookie); err == nil {
		s.Difficulty = store.NormalizeDifficulty(c.Value)
	}
	return normalizeSettings(s)
}

// writeSettings stores preferences as long-lived, HTTP-only cookies.
func writeSettings(w http.ResponseWriter, r *http.Request, s Settings) {
	s = normalizeSettings(s)
	sound := "on"
	if !s.Sound {
		sound = "off"
	}
	secure := requestIsHTTPS(r)
	http.SetCookie(w, &http.Cookie{
		Name:     soundCookie,
		Value:    sound,
		Path:     "/",
		MaxAge:   settingsMaxAge,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   secure,
	})
	http.SetCookie(w, &http.Cookie{
		Name:     difficultyCookie,
		Value:    s.Difficulty,
		Path:     "/",
		MaxAge:   settingsMaxAge,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   secure,
	})
}

// settingsFromForm parses the settings form. An absent "sound" checkbox means
// sound is off; difficulty is normalized to a supported value.
func settingsFromForm(r *http.Request) Settings {
	if err := r.ParseForm(); err != nil {
		return defaultSettings()
	}
	return normalizeSettings(Settings{
		Sound:      strings.EqualFold(r.FormValue("sound"), "on"),
		Difficulty: r.FormValue("difficulty"),
	})
}

func difficultyLabel(d string) string {
	switch store.NormalizeDifficulty(d) {
	case "easy":
		return "Leicht"
	case "hard":
		return "Schwer"
	default:
		return "Normal"
	}
}
