package server

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/maatini/dsh-invaders/internal/store"
)

const (
	runTokenMaxAge     = 4 * time.Hour
	runTokenFutureSkew = time.Minute
	maxScore           = 10_000_000
)

var errInvalidToken = errors.New("invalid run token")

// runInfo is the trusted data recovered from a signed run token.
type runInfo struct {
	ID         string
	IssuedAt   time.Time
	Difficulty string
}

// runClaims is the JSON payload embedded in a run token. jti makes each token
// single-use: the server records consumed IDs for the token lifetime.
type runClaims struct {
	IssuedAt   int64  `json:"iat"`
	Difficulty string `json:"difficulty"`
	ID         string `json:"jti"`
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
	id, err := newRunID()
	if err != nil {
		return "", err
	}
	claims := runClaims{
		IssuedAt:   now.UTC().Unix(),
		Difficulty: store.NormalizeDifficulty(difficulty),
		ID:         id,
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
	if claims.IssuedAt <= 0 || claims.ID == "" || len(claims.ID) > 64 {
		return runInfo{}, errInvalidToken
	}
	issued := time.Unix(claims.IssuedAt, 0).UTC()
	if issued.After(now.Add(runTokenFutureSkew)) {
		return runInfo{}, errInvalidToken
	}
	if now.Sub(issued) > runTokenMaxAge {
		return runInfo{}, fmt.Errorf("%w: run expired", errInvalidToken)
	}
	return runInfo{
		ID:         claims.ID,
		IssuedAt:   issued,
		Difficulty: store.NormalizeDifficulty(claims.Difficulty),
	}, nil
}

func sign(secret []byte, payload string) string {
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(payload))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func newRunID() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("server: generate run id: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// runRegistry tracks consumed token IDs until the token would have expired.
// It is intentionally in-memory: a restart invalidates tokens issued before it
// when no SECRET_KEY is configured, and a persistent SECRET_KEY only needs to
// survive for the token lifetime anyway.
type runRegistry struct {
	mu   sync.Mutex
	used map[string]time.Time
}

func newRunRegistry() *runRegistry {
	return &runRegistry{used: make(map[string]time.Time)}
}

// claim reserves a token ID. It returns false when the ID was already used.
func (r *runRegistry) claim(id string, now time.Time) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	if len(r.used) > 512 {
		for key, expiry := range r.used {
			if now.After(expiry) {
				delete(r.used, key)
			}
		}
	}
	if _, exists := r.used[id]; exists {
		return false
	}
	r.used[id] = now.Add(runTokenMaxAge)
	return true
}

// release returns a claimed ID so a transient failure can be retried.
func (r *runRegistry) release(id string) {
	r.mu.Lock()
	delete(r.used, id)
	r.mu.Unlock()
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

// plausibleMaxLevel bounds the wave number by elapsed time. A perfect run can
// clear a wave in roughly eight seconds with power-ups, so the bound is
// deliberately generous. The store accepts waves up to 999.
func plausibleMaxLevel(elapsed time.Duration) int {
	if elapsed < 0 {
		return 1
	}
	level := 1 + int(elapsed.Seconds()/8)
	if level > 999 {
		return 999
	}
	return level
}
