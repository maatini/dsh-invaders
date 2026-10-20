package server

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"neoninvaders/internal/store"
)

const (
	runTokenMaxAge     = 4 * time.Hour
	runTokenFutureSkew = time.Minute
	maxScore           = 10_000_000
)

var errInvalidToken = errors.New("invalid run token")

// runInfo is the trusted data recovered from a signed run token.
type runInfo struct {
	IssuedAt   time.Time
	Difficulty string
}

// runClaims is the JSON payload embedded in a run token.
type runClaims struct {
	IssuedAt   int64  `json:"iat"`
	Difficulty string `json:"difficulty"`
}

// newSecret returns a random 32-byte HMAC key.
func newSecret() ([]byte, error) {
	secret := make([]byte, 32)
	if _, err := rand.Read(secret); err != nil {
		return nil, fmt.Errorf("server: generate secret: %w", err)
	}
	return secret, nil
}

// issueRunToken signs the start time and difficulty of a game run. The token
// binds a submitted score to a server-issued start time, which lets the server
// reject implausible scores without trusting hidden form fields.
func issueRunToken(secret []byte, now time.Time, difficulty string) (string, error) {
	claims := runClaims{
		IssuedAt:   now.UTC().Unix(),
		Difficulty: store.NormalizeDifficulty(difficulty),
	}
	payload, err := json.Marshal(claims)
	if err != nil {
		return "", fmt.Errorf("server: marshal run token: %w", err)
	}
	encoded := base64.RawURLEncoding.EncodeToString(payload)
	return encoded + "." + sign(secret, encoded), nil
}

func verifyRunToken(secret []byte, token string, now time.Time) (runInfo, error) {
	if token == "" || len(token) > 512 {
		return runInfo{}, errInvalidToken
	}
	payload, signature, ok := cutToken(token)
	if !ok {
		return runInfo{}, errInvalidToken
	}
	want := sign(secret, payload)
	if !hmac.Equal([]byte(signature), []byte(want)) {
		return runInfo{}, errInvalidToken
	}
	raw, err := base64.RawURLEncoding.DecodeString(payload)
	if err != nil {
		return runInfo{}, errInvalidToken
	}
	var claims runClaims
	if err := json.Unmarshal(raw, &claims); err != nil {
		return runInfo{}, errInvalidToken
	}
	if claims.IssuedAt <= 0 {
		return runInfo{}, errInvalidToken
	}
	issued := time.Unix(claims.IssuedAt, 0).UTC()
	if issued.After(now.Add(runTokenFutureSkew)) {
		return runInfo{}, errInvalidToken
	}
	if now.Sub(issued) > runTokenMaxAge {
		return runInfo{}, fmt.Errorf("%w: run expired", errInvalidToken)
	}
	return runInfo{IssuedAt: issued, Difficulty: store.NormalizeDifficulty(claims.Difficulty)}, nil
}

func sign(secret []byte, payload string) string {
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(payload))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func cutToken(token string) (payload, signature string, ok bool) {
	for i := 0; i < len(token); i++ {
		if token[i] == '.' {
			if i == 0 || i == len(token)-1 {
				return "", "", false
			}
			return token[:i], token[i+1:], true
		}
	}
	return "", "", false
}

// plausibleMaxScore is a deliberately generous upper bound on the number of
// points a run of the given age can plausibly produce. A very good player
// earns a few hundred points per second; the bound leaves headroom for
// power-ups and bonus waves while still rejecting obvious forgeries.
func plausibleMaxScore(elapsed time.Duration) int {
	if elapsed < 0 {
		return 0
	}
	limit := 2_000 + int(elapsed.Seconds()*2_500)
	if limit > maxScore {
		return maxScore
	}
	return limit
}

// plausibleMaxLevel bounds the wave number by elapsed time. Clearing a wave
// takes at least ~12 seconds even for a perfect run.
func plausibleMaxLevel(elapsed time.Duration) int {
	if elapsed < 0 {
		return 1
	}
	level := 1 + int(elapsed.Seconds()/12)
	if level > 99 {
		return 99
	}
	return level
}
