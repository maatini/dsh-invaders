# Neon Invaders

Ein modernes Space-Invaders-Remake als kleine, vollständige Web-App: **Go + HTMX** für Shell, Navigation und Highscores, **Canvas 2D + Web Audio** für das Spiel. Keine Game-Engine, keine externen CDNs, keine Build-Tools für das Frontend.

![stack](https://img.shields.io/badge/Go-1.26-5ef2ff?style=flat-square) ![stack](https://img.shields.io/badge/HTMX-2.0-ff4fd8?style=flat-square) ![stack](https://img.shields.io/badge/SQLite-modernc-8b6bff?style=flat-square)

---

## Schnellstart

Voraussetzungen: [mise](https://mise.jdx.dev/) (empfohlen) oder Go 1.26.10+.

```bash
mise install          # installiert Go 1.26.10 laut mise.toml
mise run dev          # startet den Server auf http://127.0.0.1:4300
```

Ohne mise:

```bash
go mod download
go run ./cmd/neon-invaders
```

Danach im Browser **<http://127.0.0.1:4300>** öffnen.

### Bauen und starten

```bash
mise run build
./bin/neon-invaders -addr 127.0.0.1:4300 -db data/neon-invaders.db
```

Oder direkt:

```bash
go build -o bin/neon-invaders ./cmd/neon-invaders
./bin/neon-invaders
```

### Tests

```bash
mise run test         # go test ./...
mise run check        # gofmt-Check, go vet, Tests
mise run vuln         # govulncheck (Go-Standardbibliothek + Module)
```

---

## Steuerung

| Taste | Aktion |
| --- | --- |
| `←` / `→` oder `A` / `D` | Schiff bewegen |
| `Leertaste`, `W` oder `↑` | Feuern (halten für Dauerfeuer) |
| `P` / `Esc` | Pause / weiter |
| `M` | Sound an/aus (für die laufende Sitzung) |

Auf Touch-Geräten erscheinen unter dem Spielfeld drei große Buttons: **◀**, **Feuer**, **▶**.

Ziel: Die Invader-Formation auslöschen, ohne alle Leben zu verlieren. Die Formation bewegt sich seitlich, stößt am Rand nach unten und wird schneller, je mehr Invader fehlen. Rote, gelbe und violette Bomben unterscheiden sich in Flugbahn und Tempo.

### Spielinhalt

- **Formation** aus 45 Invasoren in fünf Reihen und drei Typen (Squid, Crab, Octopus) mit eigenen Punkten, Farben und Animationen.
- **Vier Bunker** aus einzelnen, zerstörbaren Zellen – Schüsse und Bomben nagen echte Löcher hinein.
- **Mystery-UFO** fliegt periodisch über das Feld, ist 100–300 Punkte wert und lässt häufig ein Power-Up fallen.
- **Kamikaze-Invader**: Verwandeln sich sporadisch, leuchten rot auf und stürzen auf den Spieler zu. Beim Aufprall auf Bunker, Schiff oder Boden explodieren sie; wer im Explosionsradius steht, verliert ein Leben. Abschießen ist möglich, löst aber ebenfalls die Explosion aus.
- **Power-Ups**: Rapid-Fire (`R`, 12 s), Spread-Shot (`W`, 12 s), Shield (`S`, 9 s). Sie fallen langsam herab und werden per Kollision eingesammelt.
- **Wellen** mit steigender Geschwindigkeit, niedrigerer Startposition und dichteren Salven; Wellen-Bonus abhängig von Level und Restleben.
- **Partikel, Screen-Shake, Glow, Sterne, Scanlines** und ein 5×7-Pixel-Font direkt auf dem Canvas.
- **Sound** komplett synthetisiert über die Web Audio API: Schuss, Treffer, Explosion, UFO-Warble, Macht-Up-Arpeggio, Marschrhythmus und Game-Over-Fanfare.

Die Spielmechanik läuft ausschließlich im Browser. Der Server rendert nur die Shell, liefert Assets, speichert Highscores und prüft deren Plausibilität.

---

## Architektur

```
.
├── cmd/neon-invaders/main.go      # Flags, Logger, Graceful Shutdown, DB-Öffnen
├── internal/
│   ├── server/
│   │   ├── server.go              # Server, Routing, Template-Funcs, View-Model
│   │   ├── handlers.go            # Seiten, Score-API, Health, Fehlerbehandlung
│   │   ├── middleware.go          # Logging, Recovery, Security-Header, Origin-Check
│   │   ├── gzip.go                # gzip-Aushandlung für Textantworten
│   │   ├── settings.go            # Sound/Difficulty als Cookies
│   │   └── token.go               # HMAC-Run-Tokens, Einmal-Verbrauch, Plausibilität
│   └── store/
│       ├── store.go               # SQLite-Store, Migration, Validierung
│       └── store_test.go          # Tests für Sortierung, Rank, Persistenz, Validierung
├── web/
│   ├── embed.go                   # //go:embed für Templates und Static Files
│   ├── templates/                 # html/template: Home, Scores, Settings, Play, Partials
│   └── static/
│       ├── css/app.css            # Neon-Design, Responsive Layout, Game-Chrome
│       ├── js/game.js             # komplette Spiel-Engine (Canvas, Audio, Input)
│       ├── js/app.js              # HTMX-Fehlerbehandlung, Header-Verhalten
│       ├── js/htmx.min.js         # HTMX 2.0.4, lokal vendored
│       └── favicon.svg
├── .github/workflows/ci.yml       # Format, Vet, Race-Tests, govulncheck
├── LICENSE                        # MIT
├── mise.toml
├── go.mod
└── README.md
```

### Request-Flow

1. **Seiten** (`/`, `/scores`, `/settings`, `/play`) werden serverseitig mit `html/template` gerendert. Alle Assets sind per `//go:embed` ins Binary eingebettet – das Binary ist eigenständig.
2. **HTMX** übernimmt nur zwei Dinge: das Speichern der Einstellungen (`POST /settings` → Partial) und das Eintragen des Scores nach dem Game Over (`POST /api/scores` → Erfolgs- oder Fehler-Partial). Fehlerhafte Formulare kommen als HTML mit HTTP 422 zurück; `app.js` sorgt dafür, dass HTMX sie trotzdem in das Overlay swappt.
3. **Spielstart** (`GET /play`) enthält einen signierten Run-Token. Beim Start holt sich `game.js` über `GET /api/run` einen frischen Token, damit die Plausibilitätsprüfung pro Lauf gilt.
4. **Spielende**: `game.js` zeigt das Game-Over-Overlay, füllt Score/Level in das versteckte Formular und lässt den Namen per HTMX speichern. Danach zeigt die Antwort Platzierung und einen „Nochmal spielen“-Button.

### Highscore-Validierung

- Name: 1–16 Zeichen, getrimmt, mehrfache Leerzeichen zusammengefasst; erlaubt sind Buchstaben, Zahlen, Leerzeichen, `.`, `_`, `-`.
- Score: ganzzahlig, `0 … 10.000.000`, SQLite-`CHECK` zusätzlich.
- Run-Token: HMAC-SHA256 über Ausstellungszeit, Schwierigkeitsgrad und eine zufällige Run-ID (`jti`), max. 4 Stunden gültig. Jeder Token wird nach erfolgreichem Eintrag einmalig verbraucht (pro laufender Server-Instanz); ein erneuter Versuch mit demselben Token wird abgelehnt.
- Plausibilität: maximal `2.000 + 2.500 × Laufzeitsekunden` Punkte und maximal `1 + Laufzeit/8 s` Wellen (Cap 999). Offensichtliche Manipulationen werden abgelehnt; das ist eine Plausibilitätsprüfung, kein kryptografischer Gameplay-Beweis (der Score wird vom Client gemeldet).
- Die Schwierigkeit wird aus dem signierten Token gelesen, nicht aus einem manipulierbaren Formularfeld.
- Doppelte Scores sind erlaubt; bei Gleichstand rankt der ältere Eintrag zuerst.

### Persistenz

SQLite über den reinen Go-Treiber `modernc.org/sqlite` (kein CGO):

```sql
CREATE TABLE scores (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  score      INTEGER NOT NULL CHECK (score >= 0),
  level      INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
  difficulty TEXT    NOT NULL DEFAULT 'normal',
  created_at INTEGER NOT NULL
);
```

Standardpfad: `data/neon-invaders.db` (Verzeichnis wird automatisch erstellt). Die Datenbank läuft im WAL-Modus.

---

## Endpoints

| Methode | Pfad | Zweck |
| --- | --- | --- |
| `GET` | `/` | Startbildschirm mit Highscore, Top 5 und Start-Button |
| `GET` | `/scores` | Bestenliste (Top 10) mit Statistiken |
| `GET` | `/settings` | Einstellungen (Sound, Schwierigkeit) |
| `POST` | `/settings` | Einstellungen speichern (HTMX-Partial oder Redirect) |
| `GET` | `/play` | Spielseite inkl. signiertem Run-Token |
| `POST` | `/api/scores` | Score validieren und speichern (HTMX) |
| `GET` | `/api/scores` | Top 10 als JSON |
| `GET` | `/api/run` | Frischen Run-Token als JSON |
| `GET` | `/healthz` | Health-Check inkl. DB-Ping (200/503) |
| `GET` | `/static/...` | Eingebettete CSS/JS/SVG-Assets |

### Konfiguration

| Flag | Env-Variable | Default |
| --- | --- | --- |
| `-addr` | `ADDR` | `127.0.0.1:4300` |
| `-db` | `DB_PATH` | `data/neon-invaders.db` |
| `-log-level` | `LOG_LEVEL` | `info` (`debug`, `info`, `warn`, `error`) |
| `-version` | – | Binary-Version ausgeben |

Optional für stabile Run-Tokens über Neustarts hinweg:

```bash
SECRET_KEY="$(openssl rand -hex 32)" mise run dev
```

Ohne `SECRET_KEY` erzeugt der Server beim Start ein zufälliges Secret. Bereits geöffnete Spielseiten können nach einem Neustart dann keinen Score mehr einreichen (Token ungültig); ein Neustart des Laufs behebt das.

---

## Entwicklung

Das Frontend hat keinen Bundler und keine npm-Abhängigkeiten. HTMX liegt als vendored Datei unter `web/static/js/htmx.min.js`. Änderungen an Templates oder Static Files werden über `//go:embed` eingebettet – nach Änderungen also **neu bauen/neu starten**:

```bash
mise run check
mise run build
./bin/neon-invaders -addr 127.0.0.1:4300 -db data/neon-invaders.db
```

Der Server loggt jede Anfrage strukturiert (Methode, Pfad, Status, Dauer), fängt Panics ab und setzt Security-Header (CSP, `X-Content-Type-Options`, `X-Frame-Options`, HSTS hinter TLS, …). Textantworten werden bei Bedarf gzip-komprimiert; Verzeichnislistings unter `/static/` sind deaktiviert. Statische Assets werden 5 Minuten gecacht.

Der Default bindet nur an `127.0.0.1`. Für den Zugriff aus dem LAN bewusst `ADDR=:4300` setzen – die Score-API hat keine Authentifizierung.

### Sound

Alle Effekte werden zur Laufzeit synthetisiert; es gibt keine Audiodateien. Der `AudioContext` wird erst bei der ersten Interaktion entsperrt. Bei aktiviertem Sound-Setting startet das Spiel mit Sound; `M` schaltet ihn nur für die aktuelle Sitzung um. Die Einstellungen-Seite setzt den Default für neue Seitenaufrufe.

### Getestet

- `internal/store`: Insert/Read, Sortierung und Tie-Breaks, `Best`, `Rank`, `Stats`, Persistenz über Reopen, Namens-/Score-/Level-Validierung, Unicode-Namen.
- `internal/server`: Rendering aller Seiten, Security-Header/HSTS, Health-Endpoint, gültige und ungültige Score-Einreichungen (Token, Ablauf, Plausibilität, Name, Einmal-Verbrauch), 413-Limit, Cross-Origin-Schutz, `/api/run`, Settings-Cookie-Roundtrip, gzip und Static-Listing, 404-Handling.
- Zusätzlich im Headless-Browser geprüft: Spielstart, Bewegung/Schuss, Pause/Fokus, Treffer/Leben, Game Over, HTMX-Validierungsfehler, erfolgreiches Speichern, Token-Replay-Schutz, `ArrowUp` ohne Seitenscroll, Kamikaze-Transformation, Explosion nah/fern, Boden- und Bunker-Aufprall, Abschuss, Warten auf das Level-Ende, Desktop-/Mobile-Layout (kein horizontaler Overflow), 60 FPS und null axe-Verstöße.

## Lizenz

MIT – siehe [LICENSE](LICENSE). HTMX ist MIT-lizenziert und als vendored Datei unter `web/static/js/htmx.min.js` enthalten.

Viel Spaß beim Jagen des Highscores. 🚀
