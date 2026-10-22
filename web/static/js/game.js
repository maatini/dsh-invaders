/* ==========================================================================
   Neon Invaders – client-side game engine
   Pure Canvas 2D + Web Audio. No engine, no dependencies.
   ========================================================================== */
(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // Constants & helpers
  // ---------------------------------------------------------------------------

  var VW = 480;
  var VH = 720;
  var TAU = Math.PI * 2;
  var COLS = 9;
  var ROWS = 5;
  var COL_GAP = 36;
  var ROW_GAP = 42;
  var PLAYER_Y = 646;

  var COLORS = {
    cyan: "#5ef2ff",
    pink: "#ff4fd8",
    violet: "#b18bff",
    green: "#48ff9b",
    amber: "#ffd166",
    red: "#ff5c7a",
    white: "#f4f1ff"
  };

  var DIFFICULTIES = {
    easy: {
      key: "easy",
      label: "Leicht",
      lives: 5,
      enemySpeed: 0.84,
      fireRate: 1.35,
      scoreMultiplier: 1,
      maxBombs: 5
    },
    normal: {
      key: "normal",
      label: "Normal",
      lives: 3,
      enemySpeed: 1,
      fireRate: 1,
      scoreMultiplier: 1,
      maxBombs: 6
    },
    hard: {
      key: "hard",
      label: "Schwer",
      lives: 2,
      enemySpeed: 1.18,
      fireRate: 0.72,
      scoreMultiplier: 1.25,
      maxBombs: 8
    }
  };

  var numberFormatter = new Intl.NumberFormat("de-DE");

  function formatNumber(value) {
    return numberFormatter.format(Math.max(0, Math.round(value)));
  }

  function clamp(value, min, max) {
    return value < min ? min : value > max ? max : value;
  }

  function lerp(a, b, amount) {
    return a + (b - a) * amount;
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function randInt(min, max) {
    return Math.floor(rand(min, max + 1));
  }

  function chance(probability) {
    return Math.random() < probability;
  }

  function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  // ---------------------------------------------------------------------------
  // Pixel sprites
  // ---------------------------------------------------------------------------

  var ELITE_A = [
    "..####..",
    ".######.",
    "##.##.##",
    "########",
    "#.####.#",
    "#.#..#.#",
    "..####..",
    ".##..##."
  ];
  var ELITE_B = [
    "..####..",
    ".######.",
    "##.##.##",
    "########",
    "#.####.#",
    "..#..#..",
    ".#.##.#.",
    "#.#..#.#"
  ];
  var CRAB_A = [
    "..#.....#..",
    "...#...#...",
    "..#######..",
    ".##.###.##.",
    "###########",
    "#.#######.#",
    "#.#.....#.#",
    "...##.##..."
  ];
  var CRAB_B = [
    "..#.....#..",
    "#..#...#..#",
    "#.#######.#",
    "###.###.###",
    "###########",
    ".#########.",
    "..#.....#..",
    ".#.......#."
  ];
  var OCTO_A = [
    "....####....",
    ".##########.",
    "############",
    "###..##..###",
    "############",
    "..##.##.##..",
    ".##..##..##.",
    "..##....##.."
  ];
  var OCTO_B = [
    "....####....",
    ".##########.",
    "############",
    "###..##..###",
    "############",
    "..##.##.##..",
    ".##..##..##.",
    "....#..#...."
  ];
  var SHIP = [
    "......#......",
    ".....###.....",
    ".....###.....",
    "..#########..",
    ".###########.",
    "#############",
    "##.#######.##",
    "#...#####...#"
  ];
  var UFO = [
    ".....######.....",
    "...##########...",
    "..############..",
    ".##.##.##.##.##.",
    "################",
    "..###..##..###..",
    "...##......##..."
  ];

  var BUNKER_MASK = [
    "..#######..",
    ".#########.",
    "###########",
    "###########",
    "###########",
    "###.....###",
    "##.......##",
    "#.........#"
  ];

  // 5x7 pixel font for canvas labels.
  var FONT = {
    "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
    "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
    "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
    "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
    "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
    "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
    "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
    "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
    "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
    "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
    A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
    C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
    D: ["11100", "10010", "10001", "10001", "10001", "10010", "11100"],
    E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
    F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
    G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
    H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
    I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
    J: ["00111", "00010", "00010", "00010", "10010", "10010", "01100"],
    K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
    L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
    M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
    N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
    O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
    P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
    Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
    R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
    S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
    T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
    U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
    V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
    W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
    X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
    Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
    Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
    "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
    "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
    "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
    ".": ["00000", "00000", "00000", "00000", "00000", "00000", "00100"],
    ":": ["00000", "00100", "00000", "00000", "00100", "00000", "00000"],
    "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
    " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"]
  };

  function makeSprite(rows, color, scale) {
    scale = scale || 3;
    var pad = 9;
    var gridW = rows[0].length;
    var gridH = rows.length;
    var canvas = document.createElement("canvas");
    canvas.width = gridW * scale + pad * 2;
    canvas.height = gridH * scale + pad * 2;
    var ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;

    function paint() {
      for (var y = 0; y < gridH; y++) {
        for (var x = 0; x < gridW; x++) {
          if (rows[y][x] === "#") {
            ctx.fillRect(pad + x * scale, pad + y * scale, scale, scale);
          }
        }
      }
    }

    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 11;
    paint();
    paint();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = "#ffffff";
    paint();
    ctx.globalAlpha = 1;

    return { canvas: canvas, pad: pad, w: gridW * scale, h: gridH * scale };
  }

  var INVADER_TYPES = {
    elite: {
      points: 30,
      color: COLORS.pink,
      frames: [ELITE_A, ELITE_B],
      sprites: null,
      drawW: 0,
      drawH: 0
    },
    crab: {
      points: 20,
      color: COLORS.cyan,
      frames: [CRAB_A, CRAB_B],
      sprites: null,
      drawW: 0,
      drawH: 0
    },
    octo: {
      points: 10,
      color: COLORS.green,
      frames: [OCTO_A, OCTO_B],
      sprites: null,
      drawW: 0,
      drawH: 0
    }
  };

  Object.keys(INVADER_TYPES).forEach(function (key) {
    var type = INVADER_TYPES[key];
    type.sprites = type.frames.map(function (rows) {
      return makeSprite(rows, type.color, 3);
    });
    type.drawW = type.sprites[0].w;
    type.drawH = type.sprites[0].h;
  });

  var PLAYER_SPRITE = makeSprite(SHIP, COLORS.cyan, 3);
  var UFO_SPRITE = makeSprite(UFO, COLORS.amber, 3);

  var POWERUP_TYPES = {
    rapid: { color: COLORS.amber, letter: "R", label: "RAPID FIRE", duration: 12 },
    spread: { color: COLORS.pink, letter: "W", label: "SPREAD SHOT", duration: 12 },
    shield: { color: COLORS.green, letter: "S", label: "SHIELD", duration: 9 }
  };

  function drawSprite(ctx, sprite, cx, cy, alpha) {
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.drawImage(
      sprite.canvas,
      Math.round(cx - sprite.w / 2 - sprite.pad),
      Math.round(cy - sprite.h / 2 - sprite.pad)
    );
    ctx.globalAlpha = 1;
  }

  function pixelText(ctx, text, x, y, scale, color, align, alpha, glow) {
    text = String(text).toUpperCase();
    scale = scale || 2;
    align = align || "center";
    alpha = alpha == null ? 1 : alpha;
    glow = glow == null ? 10 : glow;

    var glyphW = 5 * scale;
    var gap = scale;
    var total = text.length * (glyphW + gap) - gap;
    var startX = align === "center" ? x - total / 2 : align === "right" ? x - total : x;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = glow;
    for (var i = 0; i < text.length; i++) {
      var glyph = FONT[text[i]];
      if (!glyph) continue;
      var gx = startX + i * (glyphW + gap);
      for (var row = 0; row < 7; row++) {
        for (var col = 0; col < 5; col++) {
          if (glyph[row][col] === "1") {
            ctx.fillRect(gx + col * scale, y + row * scale, scale, scale);
          }
        }
      }
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Web Audio
  // ---------------------------------------------------------------------------

  function SoundEngine(enabled) {
    this.enabled = !!enabled;
    this.ctx = null;
    this.master = null;
    this.noiseBuffer = null;
    this.failed = false;
  }

  SoundEngine.prototype.init = function () {
    if (this.ctx || this.failed) return;
    var AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) {
      this.failed = true;
      return;
    }
    try {
      this.ctx = new AudioCtor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? 0.26 : 0;
      this.master.connect(this.ctx.destination);

      var length = Math.floor(this.ctx.sampleRate * 0.75);
      this.noiseBuffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      var data = this.noiseBuffer.getChannelData(0);
      for (var i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    } catch (err) {
      this.failed = true;
    }
  };

  SoundEngine.prototype.unlock = function () {
    this.init();
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(function () {});
    }
  };

  SoundEngine.prototype.setEnabled = function (enabled) {
    this.enabled = !!enabled;
    if (enabled) this.unlock();
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(
        this.enabled ? 0.26 : 0.0001,
        this.ctx.currentTime,
        0.02
      );
    }
  };

  SoundEngine.prototype.ready = function () {
    return !!(this.ctx && this.master && this.enabled && this.ctx.state !== "closed");
  };

  SoundEngine.prototype.tone = function (freq, duration, options) {
    if (!this.ready()) return;
    options = options || {};
    var type = options.type || "square";
    var gain = options.gain == null ? 0.05 : options.gain;
    var delay = options.delay || 0;
    var t0 = this.ctx.currentTime + delay;
    var osc = this.ctx.createOscillator();
    var env = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), t0);
    if (options.endFreq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, options.endFreq), t0 + duration);
    }

    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + Math.min(0.012, duration * 0.25));
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    osc.connect(env);
    env.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  };

  SoundEngine.prototype.noise = function (duration, options) {
    if (!this.ready() || !this.noiseBuffer) return;
    options = options || {};
    var gain = options.gain == null ? 0.1 : options.gain;
    var delay = options.delay || 0;
    var t0 = this.ctx.currentTime + delay;
    var source = this.ctx.createBufferSource();
    var filter = this.ctx.createBiquadFilter();
    var env = this.ctx.createGain();

    source.buffer = this.noiseBuffer;
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(options.from || 1800, t0);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, options.to || 120), t0 + duration);

    env.gain.setValueAtTime(Math.max(0.0002, gain), t0);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    source.connect(filter);
    filter.connect(env);
    env.connect(this.master);
    source.start(t0);
    source.stop(t0 + duration + 0.02);
  };

  SoundEngine.prototype.shoot = function () {
    this.tone(1250, 0.07, { type: "square", endFreq: 380, gain: 0.032 });
    this.tone(660, 0.05, { type: "triangle", endFreq: 200, gain: 0.022, delay: 0.012 });
  };

  SoundEngine.prototype.hit = function () {
    this.tone(300, 0.09, { type: "square", endFreq: 70, gain: 0.045 });
    this.noise(0.09, { gain: 0.05, from: 2600, to: 500 });
  };

  SoundEngine.prototype.explode = function () {
    this.noise(0.32, { gain: 0.16, from: 1900, to: 110 });
    this.tone(95, 0.3, { type: "sine", endFreq: 34, gain: 0.075 });
  };

  SoundEngine.prototype.playerHit = function () {
    this.noise(0.48, { gain: 0.2, from: 1400, to: 70 });
    this.tone(240, 0.5, { type: "sawtooth", endFreq: 42, gain: 0.07 });
  };

  SoundEngine.prototype.ufo = function () {
    this.tone(520, 0.09, { type: "sine", endFreq: 880, gain: 0.038 });
    this.tone(880, 0.09, { type: "sine", endFreq: 520, gain: 0.03, delay: 0.09 });
  };

  SoundEngine.prototype.powerup = function () {
    var notes = [523, 659, 784, 1047];
    for (var i = 0; i < notes.length; i++) {
      this.tone(notes[i], 0.12, { type: "triangle", gain: 0.045, delay: i * 0.065 });
    }
  };

  SoundEngine.prototype.shield = function () {
    this.tone(880, 0.12, { type: "sine", endFreq: 1320, gain: 0.04 });
  };

  SoundEngine.prototype.shieldBreak = function () {
    this.noise(0.2, { gain: 0.09, from: 3000, to: 400 });
    this.tone(660, 0.2, { type: "triangle", endFreq: 180, gain: 0.04 });
  };

  SoundEngine.prototype.levelUp = function () {
    var notes = [392, 523, 659, 784, 1047];
    for (var i = 0; i < notes.length; i++) {
      this.tone(notes[i], 0.16, { type: "triangle", gain: 0.05, delay: i * 0.08 });
    }
  };

  SoundEngine.prototype.gameOver = function () {
    var notes = [392, 330, 262, 196];
    for (var i = 0; i < notes.length; i++) {
      this.tone(notes[i], 0.38, { type: "sawtooth", gain: 0.045, delay: i * 0.16 });
    }
    this.noise(0.7, { gain: 0.08, from: 900, to: 45, delay: 0.35 });
  };

  SoundEngine.prototype.march = function (step) {
    var notes = [110, 98, 87, 82];
    this.tone(notes[step % 4], 0.09, { type: "square", gain: 0.024 });
  };

  // ---------------------------------------------------------------------------
  // Game
  // ---------------------------------------------------------------------------

  function Game(root, canvas) {
    this.root = root;
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.token = root.dataset.token || "";
    this.highscore = parseInt(root.dataset.highscore, 10) || 0;
    this.difficulty = DIFFICULTIES[root.dataset.difficulty] || DIFFICULTIES.normal;
    this.reduceMotion =
      window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    this.sound = new SoundEngine(root.dataset.sound !== "off");
    this.state = "attract";
    this.score = 0;
    this.level = 1;
    this.lives = this.difficulty.lives;
    this.t = 0;
    this.lastTs = 0;
    this.raf = 0;

    this.keys = { left: false, right: false, fire: false };
    this.player = null;
    this.invaders = [];
    this.bullets = [];
    this.bombs = [];
    this.powerups = [];
    this.particles = [];
    this.texts = [];
    this.bunkers = [];
    this.ufo = null;
    this.power = { rapid: 0, spread: 0, shield: 0 };
    this.formation = null;

    this.bombTimer = 2;
    this.ufoTimer = 10;
    this.ufoBlipTimer = 0;
    this.marchTimer = 0;
    this.marchStep = 0;
    this.levelClearTimer = 0;
    this.pendingGameOver = 0;
    this.gameOverShown = false;
    this.banner = null;
    this.shakeAmount = 0;
    this.flashAmount = 0;
    this.shootingStar = null;
    this.shootingStarTimer = rand(4, 9);
    this.hudCache = {};
    this.attractT = 0;

    this.stars = [];
    this.initStars();
    this.cacheDom();
    this.initialFormHTML = this.formArea ? this.formArea.innerHTML : "";
    this.bindEvents();
    this.resize();
    this.sound.setEnabled(root.dataset.sound !== "off");

    this.newPlayer();
    this.beginLevel();
    this.state = "attract";
    this.banner = null;
    this.updateHud(true);

    var self = this;
    this.loop = function (ts) {
      self.frame(ts);
    };
    this.raf = requestAnimationFrame(this.loop);

    if ("ResizeObserver" in window) {
      this.resizeObserver = new ResizeObserver(function () {
        self.resize();
      });
      this.resizeObserver.observe(canvas);
    }
    window.addEventListener("resize", function () {
      self.resize();
    });
  }

  Game.prototype.cacheDom = function () {
    this.scoreEl = document.getElementById("hud-score");
    this.bestEl = document.getElementById("hud-best");
    this.levelEl = document.getElementById("hud-level");
    this.livesEl = document.getElementById("hud-lives");
    this.powerEl = document.getElementById("hud-powerups");
    this.asideHighscoreEl = document.getElementById("aside-highscore");
    this.startOverlay = document.getElementById("start-overlay");
    this.pauseOverlay = document.getElementById("pause-overlay");
    this.gameOverOverlay = document.getElementById("gameover-overlay");
    this.finalScoreEl = document.getElementById("final-score");
    this.finalLevelEl = document.getElementById("final-level");
    this.finalDifficultyEl = document.getElementById("final-difficulty");
    this.formArea = document.getElementById("score-form-area");
    this.soundButton = document.getElementById("sound-toggle-button");
    this.soundLabel = document.getElementById("sound-toggle-label");
    this.statusEl = document.getElementById("game-status");
    this.pauseButton = document.getElementById("pause-button");
  };

  Game.prototype.bindEvents = function () {
    var self = this;

    document.addEventListener("click", function (event) {
      var actionEl = event.target.closest("[data-action]");
      if (!actionEl || !self.root.contains(actionEl)) return;
      var action = actionEl.getAttribute("data-action");
      if (action === "start" || action === "restart") {
        event.preventDefault();
        self.start();
      } else if (action === "resume") {
        event.preventDefault();
        self.resume();
      } else if (action === "pause") {
        event.preventDefault();
        self.togglePause();
      }
    });

    if (this.soundButton) {
      this.soundButton.addEventListener("click", function () {
        self.toggleSound();
      });
    }

    window.addEventListener("keydown", function (event) {
      self.onKeyDown(event);
    });
    window.addEventListener("keyup", function (event) {
      self.onKeyUp(event);
    });

    document.body.addEventListener("htmx:afterSwap", function (event) {
      if (!event.detail || !event.detail.xhr) return;
      var target = event.target;
      if (!target || target.id !== "score-form-area") return;
      if (event.detail.xhr.status === 201) {
        self.highscore = Math.max(self.highscore, self.score);
        self.updateHud(true);
      }
    });

    window.addEventListener("blur", function () {
      self.keys.left = self.keys.right = self.keys.fire = false;
      if (self.state === "playing") self.pause();
    });
    document.addEventListener("visibilitychange", function () {
      if (document.hidden && self.state === "playing") self.pause();
    });

    document.addEventListener(
      "pointerdown",
      function () {
        self.sound.unlock();
      },
      { once: true, passive: true }
    );

    this.bindTouchButton(document.getElementById("touch-left"), "left");
    this.bindTouchButton(document.getElementById("touch-right"), "right");
    this.bindTouchButton(document.getElementById("touch-fire"), "fire");

    var canvas = this.canvas;
    canvas.addEventListener("contextmenu", function (event) {
      event.preventDefault();
    });
  };

  Game.prototype.bindTouchButton = function (button, key) {
    if (!button) return;
    var self = this;
    var down = function (event) {
      event.preventDefault();
      self.sound.unlock();
      self.keys[key] = true;
      button.classList.add("is-pressed");
      if (button.setPointerCapture && event.pointerId != null) {
        try {
          button.setPointerCapture(event.pointerId);
        } catch (err) {
          /* ignore */
        }
      }
    };
    var up = function (event) {
      if (event) event.preventDefault();
      self.keys[key] = false;
      button.classList.remove("is-pressed");
    };
    button.addEventListener("pointerdown", down);
    button.addEventListener("pointerup", up);
    button.addEventListener("pointercancel", up);
    button.addEventListener("pointerleave", up);
    button.addEventListener("lostpointercapture", up);
  };

  Game.prototype.isEditableTarget = function (target) {
    if (!target) return false;
    var tag = target.tagName;
    return (
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT" ||
      target.isContentEditable
    );
  };

  Game.prototype.onKeyDown = function (event) {
    if (this.isEditableTarget(event.target)) return;
    var code = event.code;
    var handled = true;

    if (code === "KeyM") {
      this.toggleSound();
    } else if (this.state === "attract") {
      if (code === "Space" || code === "Enter" || code === "KeyW" || code === "ArrowUp") {
        this.start();
      } else {
        handled = false;
      }
    } else if (this.state === "gameover" || this.state === "dying") {
      handled = false;
    } else if (code === "KeyP" || code === "Escape") {
      this.togglePause();
    } else if (code === "ArrowLeft" || code === "KeyA") {
      this.keys.left = true;
    } else if (code === "ArrowRight" || code === "KeyD") {
      this.keys.right = true;
    } else if (code === "Space" || code === "KeyW" || code === "ArrowUp") {
      this.keys.fire = true;
      this.sound.unlock();
    } else {
      handled = false;
    }

    if (
      handled &&
      (code === "ArrowLeft" || code === "ArrowRight" || code === "ArrowUp" || code === "Space")
    ) {
      event.preventDefault();
    }
  };

  Game.prototype.onKeyUp = function (event) {
    var code = event.code;
    if (code === "ArrowLeft" || code === "KeyA") {
      this.keys.left = false;
    } else if (code === "ArrowRight" || code === "KeyD") {
      this.keys.right = false;
    } else if (code === "Space" || code === "KeyW" || code === "ArrowUp") {
      this.keys.fire = false;
    }
  };

  Game.prototype.toggleSound = function () {
    var enabled = !this.sound.enabled;
    this.sound.setEnabled(enabled);
    this.root.dataset.sound = enabled ? "on" : "off";
    if (this.soundButton) {
      this.soundButton.setAttribute("aria-pressed", enabled ? "true" : "false");
    }
    if (this.soundLabel) {
      this.soundLabel.textContent = "Sound: " + (enabled ? "an" : "aus");
    }
    this.status("Sound " + (enabled ? "eingeschaltet" : "ausgeschaltet") + ".");
  };

  Game.prototype.status = function (message) {
    if (this.statusEl) this.statusEl.textContent = message;
  };

  // ---------------------------------------------------------------------------
  // Run lifecycle
  // ---------------------------------------------------------------------------

  Game.prototype.newPlayer = function () {
    this.player = {
      x: VW / 2,
      y: PLAYER_Y,
      vx: 0,
      speed: 330,
      cooldown: 0,
      invulnerable: 0,
      alive: true
    };
  };

  Game.prototype.start = function () {
    this.sound.unlock();
    this.score = 0;
    this.level = 1;
    this.lives = this.difficulty.lives;
    this.power = { rapid: 0, spread: 0, shield: 0 };
    this.gameOverShown = false;
    this.pendingGameOver = 0;
    this.particles.length = 0;
    this.texts.length = 0;
    this.shakeAmount = 0;
    this.flashAmount = 0;
    this.banner = { title: "WELLE 1", sub: "BEREIT", t: 2.1, max: 2.1 };

    this.newPlayer();
    this.player.invulnerable = 1.6;
    this.beginLevel();

    this.state = "playing";
    this.setOverlay(this.startOverlay, false);
    this.setOverlay(this.pauseOverlay, false);
    this.setOverlay(this.gameOverOverlay, false);
    this.focusCanvas();
    this.restoreScoreForm();
    this.updateTokenField();
    this.refreshRunToken();
    this.updateHud(true);
    if (this.pauseButton) this.pauseButton.textContent = "Pause";
    this.status(
      "Spiel gestartet. Welle 1. " + this.lives + " Leben. Steuerung mit Pfeiltasten und Leertaste."
    );
    this.sound.levelUp();
  };

  Game.prototype.beginLevel = function () {
    var level = this.level;
    this.invaders = [];
    for (var row = 0; row < ROWS; row++) {
      var type = row === 0 ? "elite" : row <= 2 ? "crab" : "octo";
      for (var col = 0; col < COLS; col++) {
        this.invaders.push({
          row: row,
          col: col,
          type: type,
          alive: true
        });
      }
    }

    var startX = VW / 2 - ((COLS - 1) * COL_GAP) / 2;
    var startY = 94 + Math.min(level - 1, 5) * 11;
    this.formation = {
      x: startX,
      y: startY,
      targetY: startY,
      dir: 1,
      frame: 0,
      animTimer: 0,
      edgeCooldown: 0
    };

    this.bullets.length = 0;
    this.bombs.length = 0;
    this.powerups.length = 0;
    this.ufo = null;
    this.ufoTimer = rand(9, 15);
    this.ufoBlipTimer = 0;
    this.bombTimer = rand(1.2, 2.2);
    this.marchTimer = 0;
    this.marchStep = 0;
    this.bunkers = this.createBunkers();

    if (this.player) {
      this.player.x = VW / 2;
      this.player.y = PLAYER_Y;
      this.player.vx = 0;
      this.player.cooldown = 0;
      this.player.invulnerable = Math.max(this.player.invulnerable, 1.2);
      this.player.alive = true;
    }
  };

  Game.prototype.createBunkers = function () {
    var cell = 4;
    var cols = BUNKER_MASK[0].length;
    var rows = BUNKER_MASK.length;
    var width = cols * cell;
    var gap = (VW - 4 * width) / 5;
    var bunkers = [];
    for (var i = 0; i < 4; i++) {
      var cells = [];
      for (var y = 0; y < rows; y++) {
        var line = [];
        for (var x = 0; x < cols; x++) {
          line.push(BUNKER_MASK[y][x] === "#");
        }
        cells.push(line);
      }
      bunkers.push({
        x: gap + i * (width + gap),
        y: 542,
        w: width,
        h: rows * cell,
        cell: cell,
        cols: cols,
        rows: rows,
        cells: cells
      });
    }
    return bunkers;
  };

  Game.prototype.nextLevel = function () {
    this.level += 1;
    this.state = "playing";
    this.beginLevel();
    this.player.invulnerable = 1.6;
    this.banner = { title: "WELLE " + this.level, sub: "ES GEHT WEITER", t: 1.8, max: 1.8 };
    this.status("Welle " + this.level + " beginnt.");
    this.updateHud(true);
  };

  Game.prototype.pause = function () {
    if (this.state !== "playing") return;
    this.state = "paused";
    this.keys.left = this.keys.right = this.keys.fire = false;
    this.setOverlay(this.pauseOverlay, true);
    this.focusElement(
      this.pauseOverlay && this.pauseOverlay.querySelector('[data-action="resume"]')
    );
    if (this.pauseButton) this.pauseButton.textContent = "Weiter";
    this.status("Spiel pausiert. P oder Escape zum Fortsetzen.");
  };

  Game.prototype.resume = function () {
    if (this.state !== "paused") return;
    this.sound.unlock();
    this.state = "playing";
    this.setOverlay(this.pauseOverlay, false);
    this.focusCanvas();
    if (this.pauseButton) this.pauseButton.textContent = "Pause";
    this.status("Weiter geht's. Welle " + this.level + ".");
  };

  Game.prototype.togglePause = function () {
    if (this.state === "playing") {
      this.pause();
    } else if (this.state === "paused") {
      this.resume();
    }
  };

  Game.prototype.setOverlay = function (overlay, visible) {
    if (!overlay) return;
    overlay.hidden = !visible;
  };

  Game.prototype.focusElement = function (element) {
    if (!element) return;
    try {
      element.focus({ preventScroll: true });
    } catch (err) {
      element.focus();
    }
  };

  Game.prototype.focusCanvas = function () {
    this.focusElement(this.canvas);
  };

  Game.prototype.clearLevel = function () {
    if (this.state !== "playing") return;
    this.state = "levelclear";
    this.levelClearTimer = 2.7;
    var bonus = this.level * 100 + this.lives * 50;
    this.grantScore(bonus);
    this.banner = {
      title: "WELLE GERÄUMT",
      sub: "BONUS +" + formatNumber(bonus),
      t: 2.7,
      max: 2.7
    };
    this.shake(4);
    this.sound.levelUp();
    for (var i = 0; i < 5; i++) {
      this.burst(rand(VW * 0.15, VW * 0.85), rand(160, 360), pick([COLORS.cyan, COLORS.pink, COLORS.green, COLORS.amber]), 18, 230, 3);
    }
    this.texts.push({
      x: VW / 2,
      y: 390,
      text: "+" + formatNumber(bonus),
      color: COLORS.amber,
      life: 1.8,
      maxLife: 1.8,
      scale: 3
    });
    this.updateHud(true);
    this.status("Welle " + this.level + " geräumt. Bonus " + bonus + " Punkte.");
  };

  Game.prototype.grantScore = function (amount, x, y, color) {
    var points = Math.max(0, Math.round(amount));
    this.score += points;
    if (x != null && y != null) {
      this.texts.push({
        x: x,
        y: y,
        text: "+" + formatNumber(points),
        color: color || COLORS.cyan,
        life: 0.9,
        maxLife: 0.9,
        scale: 2
      });
    }
    this.updateHud();
  };

  Game.prototype.pointsFor = function (base) {
    var multiplied = base * this.difficulty.scoreMultiplier;
    return Math.max(5, Math.round(multiplied / 5) * 5);
  };

  // ---------------------------------------------------------------------------
  // Input & player
  // ---------------------------------------------------------------------------

  Game.prototype.updatePlayer = function (dt) {
    var player = this.player;
    if (!player.alive) return;

    var direction = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0);
    var targetVelocity = direction * player.speed;
    player.vx = lerp(player.vx, targetVelocity, clamp(dt * 13, 0, 1));
    player.x = clamp(player.x + player.vx * dt, 22, VW - 22);
    if (direction === 0 && Math.abs(player.vx) < 4) player.vx = 0;

    player.cooldown = Math.max(0, player.cooldown - dt);
    player.invulnerable = Math.max(0, player.invulnerable - dt);

    if (this.keys.fire && player.cooldown <= 0) {
      this.fire();
    }
  };

  Game.prototype.fire = function () {
    var player = this.player;
    if (!player.alive) return;

    var spread = this.power.spread > 0;
    var rapid = this.power.rapid > 0;
    var cooldown = rapid ? 0.115 : spread ? 0.34 : 0.29;
    var maxBullets = rapid ? 8 : 5;
    var shots = spread ? 3 : 1;
    if (this.bullets.length + shots > maxBullets) {
      player.cooldown = 0.08;
      return;
    }

    var speed = 690;
    if (spread) {
      this.bullets.push(this.makeBullet(player.x - 8, player.y - 16, -150, -speed * 0.98));
      this.bullets.push(this.makeBullet(player.x, player.y - 18, 0, -speed));
      this.bullets.push(this.makeBullet(player.x + 8, player.y - 16, 150, -speed * 0.98));
    } else {
      this.bullets.push(this.makeBullet(player.x, player.y - 18, 0, -speed));
    }

    player.cooldown = cooldown;
    this.sound.shoot();
    this.burst(player.x, player.y - 18, COLORS.cyan, 3, 70, 1.6);
  };

  Game.prototype.makeBullet = function (x, y, vx, vy) {
    return { x: x, y: y, vx: vx, vy: vy, w: 3, h: 14 };
  };

  Game.prototype.playerRect = function () {
    return {
      x: this.player.x - 16,
      y: this.player.y - 10,
      w: 32,
      h: 20
    };
  };

  // ---------------------------------------------------------------------------
  // Formation
  // ---------------------------------------------------------------------------

  Game.prototype.aliveInvaders = function () {
    var alive = [];
    for (var i = 0; i < this.invaders.length; i++) {
      if (this.invaders[i].alive) alive.push(this.invaders[i]);
    }
    return alive;
  };

  Game.prototype.invaderPos = function (invader) {
    return {
      x: this.formation.x + invader.col * COL_GAP,
      y: this.formation.y + invader.row * ROW_GAP
    };
  };

  Game.prototype.invaderRect = function (invader) {
    var pos = this.invaderPos(invader);
    var type = INVADER_TYPES[invader.type];
    return {
      x: pos.x - type.drawW / 2,
      y: pos.y - type.drawH / 2,
      w: type.drawW,
      h: type.drawH
    };
  };

  Game.prototype.formationBounds = function () {
    var minX = Infinity;
    var maxX = -Infinity;
    var minY = Infinity;
    var maxY = -Infinity;
    var found = false;
    for (var i = 0; i < this.invaders.length; i++) {
      var invader = this.invaders[i];
      if (!invader.alive) continue;
      var rect = this.invaderRect(invader);
      minX = Math.min(minX, rect.x);
      maxX = Math.max(maxX, rect.x + rect.w);
      minY = Math.min(minY, rect.y);
      maxY = Math.max(maxY, rect.y + rect.h);
      found = true;
    }
    if (!found) return null;
    return { left: minX, right: maxX, top: minY, bottom: maxY };
  };

  Game.prototype.formationSpeed = function (aliveCount) {
    var total = COLS * ROWS;
    var losses = total - aliveCount;
    var speed = 20 + this.level * 2.5 + losses * 0.45;
    return Math.min(145, speed * this.difficulty.enemySpeed);
  };

  Game.prototype.updateFormation = function (dt) {
    var formation = this.formation;
    var alive = this.aliveInvaders();
    if (!alive.length) return;

    var speed = this.formationSpeed(alive.length);
    formation.edgeCooldown = Math.max(0, formation.edgeCooldown - dt);

    formation.x += formation.dir * speed * dt;
    var bounds = this.formationBounds();
    if (!bounds) return;

    var margin = 18;
    if (bounds.right > VW - margin) {
      formation.x -= bounds.right - (VW - margin);
      formation.dir = -1;
      if (formation.edgeCooldown <= 0) {
        this.descendFormation();
        formation.edgeCooldown = 0.16;
      }
    } else if (bounds.left < margin) {
      formation.x += margin - bounds.left;
      formation.dir = 1;
      if (formation.edgeCooldown <= 0) {
        this.descendFormation();
        formation.edgeCooldown = 0.16;
      }
    }

    var remaining = formation.targetY - formation.y;
    if (Math.abs(remaining) > 0.4) {
      formation.y += Math.sign(remaining) * Math.min(Math.abs(remaining), dt * 150);
    } else {
      formation.y = formation.targetY;
    }

    formation.animTimer += dt;
    var interval = clamp(0.58 - this.level * 0.02 - (1 - alive.length / (COLS * ROWS)) * 0.22, 0.16, 0.58);
    if (formation.animTimer >= interval) {
      formation.animTimer = 0;
      formation.frame = formation.frame === 0 ? 1 : 0;
    }

    var bottom = this.formationBounds();
    if (bottom && bottom.bottom >= this.player.y - 20) {
      this.gameOverSequence("Die Invader haben die Verteidigungslinie durchbrochen.");
    }
  };

  Game.prototype.descendFormation = function () {
    this.formation.targetY += 15 + Math.min(8, this.level);
  };

  Game.prototype.updateMarch = function (dt) {
    this.marchTimer -= dt;
    if (this.marchTimer <= 0) {
      this.sound.march(this.marchStep++);
      var alive = this.aliveInvaders().length;
      this.marchTimer = clamp(0.62 - (COLS * ROWS - alive) * 0.007 - this.level * 0.015, 0.2, 0.62);
    }
  };

  // ---------------------------------------------------------------------------
  // Player bullets
  // ---------------------------------------------------------------------------

  Game.prototype.updateBullets = function (dt) {
    for (var i = this.bullets.length - 1; i >= 0; i--) {
      var bullet = this.bullets[i];
      var dx = bullet.vx * dt;
      var dy = bullet.vy * dt;
      var steps = Math.max(1, Math.ceil(Math.sqrt(dx * dx + dy * dy) / 3));
      var dead = false;

      for (var step = 0; step < steps && !dead; step++) {
        bullet.x += dx / steps;
        bullet.y += dy / steps;

        if (bullet.y < -20 || bullet.x < -20 || bullet.x > VW + 20) {
          dead = true;
          break;
        }

        if (this.ufo && this.ufoRect && rectsOverlap(this.bulletRect(bullet), this.ufoRect())) {
          this.destroyUfo();
          dead = true;
          break;
        }

        for (var j = 0; j < this.invaders.length; j++) {
          var invader = this.invaders[j];
          if (!invader.alive) continue;
          if (rectsOverlap(this.bulletRect(bullet), this.invaderRect(invader))) {
            this.destroyInvader(invader);
            dead = true;
            break;
          }
        }
        if (dead) break;

        if (this.hitBunker(bullet.x, bullet.y, 1.2)) {
          dead = true;
        }
      }

      if (dead) this.bullets.splice(i, 1);
    }
  };

  Game.prototype.bulletRect = function (bullet) {
    return { x: bullet.x - bullet.w / 2, y: bullet.y - bullet.h / 2, w: bullet.w, h: bullet.h };
  };

  Game.prototype.destroyInvader = function (invader) {
    invader.alive = false;
    var type = INVADER_TYPES[invader.type];
    var pos = this.invaderPos(invader);
    var points = this.pointsFor(type.points);
    this.grantScore(points, pos.x, pos.y - 12, type.color);
    this.burst(pos.x, pos.y, type.color, 18, 190, 2.6);
    this.burst(pos.x, pos.y, COLORS.white, 6, 120, 1.6);
    this.shake(2.4);
    this.sound.hit();
    this.maybeDropPowerup(pos.x, pos.y, 0.095);
    if (this.aliveInvaders().length === 0) {
      this.clearLevel();
    }
  };

  // ---------------------------------------------------------------------------
  // Enemy bombs
  // ---------------------------------------------------------------------------

  Game.prototype.spawnBomb = function () {
    if (this.bombs.length >= this.difficulty.maxBombs + Math.min(4, Math.floor(this.level / 2))) {
      return;
    }
    var alive = this.aliveInvaders();
    if (!alive.length) return;

    var bottomMost = alive.filter(function (candidate) {
      return !alive.some(function (other) {
        return other.col === candidate.col && other.row > candidate.row;
      });
    });
    var shooter = pick(bottomMost.length ? bottomMost : alive);
    var pos = this.invaderPos(shooter);
    var typeData = INVADER_TYPES[shooter.type];

    var kind = "straight";
    var roll = Math.random();
    if (this.level >= 3 && roll < 0.18) {
      kind = "aimed";
    } else if (this.level >= 2 && roll < 0.42) {
      kind = "wave";
    }

    var speed = Math.min(320, (128 + this.level * 9) * rand(0.9, 1.15) * this.difficulty.enemySpeed);
    var vx = 0;
    if (kind === "aimed") {
      var targetX = this.player.x - pos.x;
      var distance = Math.abs(targetX) + 1;
      vx = clamp(targetX / distance, -1, 1) * 55;
    }

    this.bombs.push({
      x: pos.x,
      y: pos.y + typeData.drawH / 2,
      vx: vx,
      vy: speed,
      type: kind,
      age: 0,
      seed: rand(0, TAU),
      w: 4,
      h: 13
    });
  };

  Game.prototype.updateBombSpawner = function (dt) {
    this.bombTimer -= dt;
    if (this.bombTimer > 0) return;
    this.spawnBomb();
    var interval = clamp(
      (1.75 - this.level * 0.07) * this.difficulty.fireRate * rand(0.7, 1.3),
      0.3,
      3
    );
    this.bombTimer = interval;
  };

  Game.prototype.updateBombs = function (dt) {
    for (var i = this.bombs.length - 1; i >= 0; i--) {
      var bomb = this.bombs[i];
      bomb.age += dt;
      var vx = bomb.vx;
      if (bomb.type === "wave") {
        vx = Math.sin(bomb.age * 7 + bomb.seed) * 74;
      }
      var dx = vx * dt;
      var dy = bomb.vy * dt;
      var steps = Math.max(1, Math.ceil(Math.sqrt(dx * dx + dy * dy) / 3));
      var dead = false;

      for (var step = 0; step < steps && !dead; step++) {
        bomb.x += dx / steps;
        bomb.y += dy / steps;

        if (bomb.y > VH + 20) {
          dead = true;
          break;
        }
        if (bomb.x < -12 || bomb.x > VW + 12) {
          dead = true;
          break;
        }
        if (this.hitBunker(bomb.x, bomb.y + 4, 1.35)) {
          this.burst(bomb.x, bomb.y, COLORS.green, 8, 130, 2);
          dead = true;
          break;
        }
        if (this.player.alive && rectsOverlap(this.bombRect(bomb), this.playerRect())) {
          var survived = this.hitPlayer(bomb.x, bomb.y);
          dead = true;
          if (!survived) break;
          if (this.state !== "playing") break;
        }
      }

      if (dead) this.bombs.splice(i, 1);
    }
  };

  Game.prototype.bombRect = function (bomb) {
    return { x: bomb.x - 3, y: bomb.y - 8, w: 6, h: 16 };
  };

  // ---------------------------------------------------------------------------
  // Bunkers
  // ---------------------------------------------------------------------------

  Game.prototype.hitBunker = function (x, y, radius) {
    for (var i = 0; i < this.bunkers.length; i++) {
      var bunker = this.bunkers[i];
      var lx = x - bunker.x;
      var ly = y - bunker.y;
      if (lx < 0 || ly < 0 || lx >= bunker.w || ly >= bunker.h) continue;
      var col = Math.floor(lx / bunker.cell);
      var row = Math.floor(ly / bunker.cell);
      var line = bunker.cells[row];
      if (line && line[col]) {
        this.damageBunker(bunker, col, row, radius || 1.3);
        this.burst(bunker.x + lx, bunker.y + ly, COLORS.green, 7, 120, 1.8);
        return true;
      }
    }
    return false;
  };

  Game.prototype.damageBunker = function (bunker, col, row, radius) {
    var cells = Math.ceil(radius + 1);
    for (var dy = -cells; dy <= cells; dy++) {
      for (var dx = -cells; dx <= cells; dx++) {
        var distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > radius + Math.random() * 0.9) continue;
        var x = col + dx;
        var y = row + dy;
        if (x < 0 || y < 0 || x >= bunker.cols || y >= bunker.rows) continue;
        bunker.cells[y][x] = false;
      }
    }
  };

  // ---------------------------------------------------------------------------
  // UFO
  // ---------------------------------------------------------------------------

  Game.prototype.updateUfo = function (dt) {
    this.ufoTimer -= dt;
    if (!this.ufo && this.ufoTimer <= 0) {
      this.spawnUfo();
    }

    if (!this.ufo) return;
    var ufo = this.ufo;
    ufo.age += dt;
    ufo.x += ufo.dir * ufo.speed * dt;
    ufo.y = ufo.baseY + Math.sin(ufo.age * 4) * 4;

    this.ufoBlipTimer -= dt;
    if (this.ufoBlipTimer <= 0) {
      this.sound.ufo();
      this.ufoBlipTimer = 0.42;
    }

    if (ufo.x < -70 || ufo.x > VW + 70) {
      this.ufo = null;
      this.ufoTimer = rand(16, 26);
    }
  };

  Game.prototype.spawnUfo = function () {
    var direction = chance(0.5) ? 1 : -1;
    var baseY = 62;
    this.ufo = {
      x: direction === 1 ? -54 : VW + 54,
      y: baseY,
      baseY: baseY,
      dir: direction,
      speed: rand(88, 122) + this.level * 3,
      age: 0,
      w: UFO_SPRITE.w,
      h: UFO_SPRITE.h,
      points: pick([100, 150, 200, 300])
    };
    this.ufoBlipTimer = 0;
    this.sound.ufo();
  };

  Game.prototype.ufoRect = function () {
    if (!this.ufo) return null;
    return {
      x: this.ufo.x - 22,
      y: this.ufo.y - 10,
      w: 44,
      h: 20
    };
  };

  Game.prototype.destroyUfo = function () {
    if (!this.ufo) return;
    var points = this.pointsFor(this.ufo.points);
    var x = this.ufo.x;
    var y = this.ufo.y;
    this.grantScore(points, x, y - 16, COLORS.amber);
    this.burst(x, y, COLORS.amber, 34, 280, 3.2);
    this.burst(x, y, COLORS.pink, 16, 180, 2.4);
    this.shake(6);
    this.sound.explode();
    this.maybeDropPowerup(x, y, 0.62);
    this.ufo = null;
    this.ufoTimer = rand(16, 26);
    this.status("Mystery-Ship zerstört. +" + points + " Punkte.");
  };

  // ---------------------------------------------------------------------------
  // Power-ups
  // ---------------------------------------------------------------------------

  Game.prototype.maybeDropPowerup = function (x, y, probability) {
    if (!chance(probability)) return;
    var roll = Math.random();
    var type = roll < 0.4 ? "rapid" : roll < 0.75 ? "spread" : "shield";
    this.powerups.push({
      x: x,
      baseX: x,
      y: y,
      type: type,
      age: 0,
      vy: 76,
      w: 24,
      h: 24
    });
  };

  Game.prototype.updatePowerups = function (dt) {
    for (var i = this.powerups.length - 1; i >= 0; i--) {
      var item = this.powerups[i];
      item.age += dt;
      item.y += item.vy * dt;
      item.x = item.baseX + Math.sin(item.age * 2.4) * 12;

      if (item.y > VH + 30) {
        this.powerups.splice(i, 1);
        continue;
      }
      var rect = { x: item.x - 12, y: item.y - 12, w: 24, h: 24 };
      if (this.player.alive && rectsOverlap(rect, this.playerRect())) {
        this.collectPowerup(item);
        this.powerups.splice(i, 1);
      }
    }
  };

  Game.prototype.collectPowerup = function (item) {
    var type = POWERUP_TYPES[item.type];
    this.power[item.type] = Math.max(this.power[item.type], type.duration);
    this.sound.powerup();
    if (item.type === "shield") this.sound.shield();
    this.burst(item.x, item.y, type.color, 22, 170, 2.4);
    this.texts.push({
      x: this.player.x,
      y: this.player.y - 34,
      text: type.label,
      color: type.color,
      life: 1.2,
      maxLife: 1.2,
      scale: 2
    });
    this.status(type.label + " aktiv für " + type.duration + " Sekunden.");
    this.updateHud(true);
  };

  Game.prototype.updatePowerTimers = function (dt) {
    var expired = false;
    for (var key in this.power) {
      if (this.power[key] > 0) {
        this.power[key] = Math.max(0, this.power[key] - dt);
        if (this.power[key] === 0) expired = true;
      }
    }
    if (expired) this.updateHud(true);
  };

  // ---------------------------------------------------------------------------
  // Player damage & game over
  // ---------------------------------------------------------------------------

  Game.prototype.hitPlayer = function (sourceX, sourceY) {
    if (!this.player.alive || this.player.invulnerable > 0) return true;
    if (this.state !== "playing") return false;

    if (this.power.shield > 0) {
      this.power.shield = Math.max(0, this.power.shield - 3);
      this.burst(sourceX, sourceY, COLORS.green, 16, 190, 2.4);
      this.sound.shieldBreak();
      this.shake(3);
      this.updateHud(true);
      return true;
    }

    this.lives -= 1;
    this.player.invulnerable = 2.5;
    this.burst(this.player.x, this.player.y, COLORS.cyan, 34, 260, 3);
    this.burst(this.player.x, this.player.y, COLORS.pink, 20, 180, 2.4);
    this.shake(10);
    this.flash(0.28);
    this.updateHud(true);

    if (this.lives <= 0) {
      this.gameOverSequence("Dein Schiff wurde zerstört.");
      return false;
    }

    this.sound.playerHit();
    this.status("Treffer! Noch " + this.lives + " Leben.");
    return true;
  };

  Game.prototype.gameOverSequence = function (reason) {
    if (this.state === "dying" || this.state === "gameover") return;
    this.state = "dying";
    this.pendingGameOver = 1.8;
    this.player.alive = false;
    this.lives = 0;
    this.banner = null;
    this.updateHud(true);
    this.burst(this.player.x, this.player.y, COLORS.cyan, 60, 330, 3.4);
    this.burst(this.player.x, this.player.y, COLORS.pink, 36, 240, 2.8);
    this.burst(this.player.x, this.player.y, COLORS.white, 18, 160, 2);
    this.shake(16);
    this.flash(0.5);
    this.sound.playerHit();
    this.sound.gameOver();
    this.deathReason = reason;
    this.status("Game Over. " + reason + " Score: " + this.score + ".");
  };

  Game.prototype.showGameOver = function () {
    if (this.gameOverShown) return;
    this.gameOverShown = true;
    this.state = "gameover";
    this.syncScoreForm();

    if (this.finalScoreEl) this.finalScoreEl.textContent = formatNumber(this.score);
    if (this.finalLevelEl) this.finalLevelEl.textContent = String(this.level);
    if (this.finalDifficultyEl) this.finalDifficultyEl.textContent = this.difficulty.label;
    this.setOverlay(this.startOverlay, false);
    this.setOverlay(this.pauseOverlay, false);
    this.setOverlay(this.gameOverOverlay, true);
    if (this.pauseButton) this.pauseButton.textContent = "Pause";

    var self = this;
    window.setTimeout(function () {
      var input = document.getElementById("player-name");
      if (input && !self.gameOverOverlay.hidden) {
        try {
          input.focus({ preventScroll: true });
        } catch (err) {
          input.focus();
        }
      }
    }, 120);
  };

  Game.prototype.syncScoreForm = function () {
    this.formArea = document.getElementById("score-form-area");
    var scoreInput = document.getElementById("score-input");
    var levelInput = document.getElementById("level-input");
    if (scoreInput) scoreInput.value = String(this.score);
    if (levelInput) levelInput.value = String(this.level);
    this.updateTokenField();
  };

  Game.prototype.updateTokenField = function () {
    var area = document.getElementById("score-form-area");
    if (!area) return;
    this.formArea = area;
    var tokenInput = area.querySelector('input[name="token"]');
    if (tokenInput && this.token) tokenInput.value = this.token;
  };

  Game.prototype.restoreScoreForm = function () {
    var area = document.getElementById("score-form-area");
    if (!area) {
      this.formArea = null;
      return;
    }
    this.formArea = area;
    if (!area.querySelector("form")) {
      area.innerHTML = this.initialFormHTML;
      area = document.getElementById("score-form-area");
      this.formArea = area;
    }
    var scoreInput = document.getElementById("score-input");
    var levelInput = document.getElementById("level-input");
    if (scoreInput) scoreInput.value = "0";
    if (levelInput) levelInput.value = "1";
    this.updateTokenField();
  };

  Game.prototype.refreshRunToken = function () {
    var self = this;
    if (!window.fetch) return;
    fetch("/api/run", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" }
    })
      .then(function (response) {
        if (!response.ok) throw new Error("token request failed");
        return response.json();
      })
      .then(function (data) {
        if (data && typeof data.token === "string" && data.token.length > 0) {
          self.token = data.token;
          self.updateTokenField();
        }
      })
      .catch(function () {
        /* The server-rendered token remains valid. */
      });
  };

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------

  Game.prototype.initStars = function () {
    this.stars.length = 0;
    for (var i = 0; i < 95; i++) {
      this.stars.push({
        x: rand(0, VW),
        y: rand(0, VH),
        z: rand(0.25, 1),
        r: chance(0.18) ? 2 : 1,
        phase: rand(0, TAU),
        twinkle: rand(0.5, 2.1),
        speed: rand(5, 20),
        color: chance(0.12) ? COLORS.pink : chance(0.2) ? COLORS.cyan : COLORS.white
      });
    }
  };

  Game.prototype.updateStars = function (dt) {
    for (var i = 0; i < this.stars.length; i++) {
      var star = this.stars[i];
      star.phase += dt * star.twinkle;
      star.y += star.speed * star.z * dt;
      if (star.y > VH + 4) {
        star.y = -4;
        star.x = rand(0, VW);
      }
    }

    this.shootingStarTimer -= dt;
    if (!this.shootingStar && this.shootingStarTimer <= 0) {
      this.shootingStar = {
        x: rand(VW * 0.15, VW * 0.9),
        y: rand(40, 220),
        vx: rand(-190, -90),
        vy: rand(70, 130),
        life: 1.1,
        maxLife: 1.1
      };
      this.shootingStarTimer = rand(7, 16);
    }
    if (this.shootingStar) {
      var meteor = this.shootingStar;
      meteor.life -= dt;
      meteor.x += meteor.vx * dt;
      meteor.y += meteor.vy * dt;
      if (meteor.life <= 0) this.shootingStar = null;
    }
  };

  Game.prototype.updateParticles = function (dt) {
    for (var i = this.particles.length - 1; i >= 0; i--) {
      var particle = this.particles[i];
      particle.life -= dt;
      if (particle.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      particle.vy += particle.gravity * dt;
      particle.vx *= Math.pow(particle.drag, dt * 60);
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
    }
    if (this.particles.length > 650) {
      this.particles.splice(0, this.particles.length - 650);
    }
  };

  Game.prototype.updateTexts = function (dt) {
    for (var i = this.texts.length - 1; i >= 0; i--) {
      var item = this.texts[i];
      item.life -= dt;
      item.y -= 30 * dt;
      if (item.life <= 0) this.texts.splice(i, 1);
    }
  };

  Game.prototype.updateEffects = function (dt) {
    this.shakeAmount = Math.max(0, this.shakeAmount - dt * 32);
    this.flashAmount = Math.max(0, this.flashAmount - dt * 2.4);
  };

  Game.prototype.updateBanner = function (dt) {
    if (!this.banner) return;
    this.banner.t -= dt;
    if (this.banner.t <= 0) this.banner = null;
  };

  Game.prototype.burst = function (x, y, color, count, speed, size) {
    if (this.reduceMotion) count = Math.ceil(count * 0.45);
    for (var i = 0; i < count; i++) {
      var angle = rand(0, TAU);
      var velocity = rand(speed * 0.25, speed);
      var life = rand(0.28, 0.95);
      this.particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        gravity: rand(40, 150),
        drag: rand(0.97, 0.995),
        life: life,
        maxLife: life,
        size: rand(1, size || 2.5),
        color: color
      });
    }
  };

  Game.prototype.shake = function (amount) {
    if (this.reduceMotion) return;
    this.shakeAmount = Math.max(this.shakeAmount, amount);
  };

  Game.prototype.flash = function (amount) {
    if (this.reduceMotion) return;
    this.flashAmount = Math.max(this.flashAmount, amount);
  };

  // ---------------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------------

  Game.prototype.frame = function (ts) {
    if (!this.lastTs) this.lastTs = ts;
    var dt = clamp((ts - this.lastTs) / 1000, 0, 0.05);
    this.lastTs = ts;
    this.t += dt;
    this.update(dt);
    this.render();
    var self = this;
    this.raf = requestAnimationFrame(function (next) {
      self.frame(next);
    });
  };

  Game.prototype.update = function (dt) {
    if (this.state !== "paused") this.updateStars(dt);

    if (this.state === "playing") {
      this.updatePlayer(dt);
      this.updateFormation(dt);
      if (this.state !== "playing") return;
      this.updateBullets(dt);
      if (this.state !== "playing") return;
      this.updateBombs(dt);
      if (this.state !== "playing") return;
      this.updateBombSpawner(dt);
      if (this.state !== "playing") return;
      this.updateUfo(dt);
      this.updatePowerups(dt);
      this.updatePowerTimers(dt);
      this.updateMarch(dt);
      this.updateParticles(dt);
      this.updateTexts(dt);
      this.updateEffects(dt);
      this.updateBanner(dt);
      this.updateHud();
    } else if (this.state === "levelclear") {
      this.updateParticles(dt);
      this.updateTexts(dt);
      this.updateEffects(dt);
      this.updateBanner(dt);
      this.levelClearTimer -= dt;
      if (this.levelClearTimer <= 0) this.nextLevel();
    } else if (this.state === "dying") {
      this.updateParticles(dt);
      this.updateTexts(dt);
      this.updateEffects(dt);
      this.pendingGameOver -= dt;
      if (this.pendingGameOver <= 0) this.showGameOver();
    } else if (this.state === "attract") {
      this.attractT += dt;
    }
  };

  Game.prototype.updateHud = function (force) {
    var best = Math.max(this.highscore, this.score);
    var powerParts = [];
    var seconds;
    if (this.power.rapid > 0) {
      seconds = Math.ceil(this.power.rapid);
      powerParts.push('<span class="powerup-chip powerup-chip--rapid">R ' + seconds + "s</span>");
    }
    if (this.power.spread > 0) {
      seconds = Math.ceil(this.power.spread);
      powerParts.push('<span class="powerup-chip powerup-chip--spread">W ' + seconds + "s</span>");
    }
    if (this.power.shield > 0) {
      seconds = Math.ceil(this.power.shield);
      powerParts.push('<span class="powerup-chip powerup-chip--shield">S ' + seconds + "s</span>");
    }
    var powerHTML = powerParts.length ? powerParts.join("") : '<span class="powerup-empty">–</span>';
    var livesHTML = "";
    for (var i = 0; i < this.lives; i++) livesHTML += '<span class="life-pip"></span>';

    var scoreText = formatNumber(this.score);
    var bestText = formatNumber(best);
    var levelText = String(this.level);
    var cache = this.hudCache;

    if (force || cache.score !== scoreText) {
      if (this.scoreEl) this.scoreEl.textContent = scoreText;
      cache.score = scoreText;
    }
    if (force || cache.best !== bestText) {
      if (this.bestEl) this.bestEl.textContent = bestText;
      if (this.asideHighscoreEl) this.asideHighscoreEl.textContent = formatNumber(this.highscore);
      cache.best = bestText;
    }
    if (force || cache.level !== levelText) {
      if (this.levelEl) this.levelEl.textContent = levelText;
      cache.level = levelText;
    }
    if (force || cache.lives !== livesHTML) {
      if (this.livesEl) {
        this.livesEl.innerHTML = livesHTML;
        this.livesEl.setAttribute(
          "aria-label",
          this.lives + " Leben"
        );
      }
      cache.lives = livesHTML;
    }
    if (force || cache.power !== powerHTML) {
      if (this.powerEl) this.powerEl.innerHTML = powerHTML;
      cache.power = powerHTML;
    }
  };

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  Game.prototype.resize = function () {
    var rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var width = Math.max(1, Math.round(rect.width * dpr));
    var height = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.ctx.imageSmoothingEnabled = false;
  };

  Game.prototype.render = function () {
    var ctx = this.ctx;
    var width = this.canvas.width;
    var height = this.canvas.height;
    if (!width || !height) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.setTransform(width / VW, 0, 0, height / VH, 0, 0);
    ctx.imageSmoothingEnabled = false;

    var shakeX = 0;
    var shakeY = 0;
    if (this.shakeAmount > 0.2) {
      shakeX = rand(-this.shakeAmount, this.shakeAmount);
      shakeY = rand(-this.shakeAmount, this.shakeAmount);
    }

    ctx.save();
    ctx.translate(shakeX, shakeY);

    this.drawBackground(ctx);
    this.drawStars(ctx);
    this.drawGrid(ctx);
    this.drawBunkers(ctx);
    this.drawInvaders(ctx);
    this.drawUfo(ctx);
    this.drawPowerups(ctx);
    this.drawBombs(ctx);
    this.drawPlayer(ctx);
    this.drawBullets(ctx);
    this.drawParticles(ctx);
    this.drawTexts(ctx);
    this.drawBanner(ctx);

    ctx.restore();

    if (this.flashAmount > 0.01) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.5, this.flashAmount);
      ctx.fillStyle = this.lives > 0 ? COLORS.cyan : COLORS.red;
      ctx.fillRect(0, 0, VW, VH);
      ctx.restore();
    }

    // Vignette keeps focus in the centre without hiding the edges.
    ctx.save();
    var vignette = ctx.createRadialGradient(VW / 2, VH / 2, VH * 0.25, VW / 2, VH / 2, VH * 0.72);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,0.42)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, VW, VH);
    ctx.restore();
  };

  Game.prototype.drawBackground = function (ctx) {
    var gradient = ctx.createLinearGradient(0, 0, 0, VH);
    gradient.addColorStop(0, "#060318");
    gradient.addColorStop(0.55, "#08041c");
    gradient.addColorStop(1, "#03020a");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, VW, VH);

    var nebula = ctx.createRadialGradient(VW * 0.78, 120, 10, VW * 0.78, 120, 260);
    nebula.addColorStop(0, "rgba(139, 107, 255, 0.16)");
    nebula.addColorStop(0.55, "rgba(255, 79, 216, 0.05)");
    nebula.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = nebula;
    ctx.fillRect(0, 0, VW, 420);

    var lower = ctx.createRadialGradient(VW * 0.2, VH * 0.8, 10, VW * 0.2, VH * 0.8, 300);
    lower.addColorStop(0, "rgba(94, 242, 255, 0.06)");
    lower.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = lower;
    ctx.fillRect(0, 400, VW, VH - 400);
  };

  Game.prototype.drawStars = function (ctx) {
    ctx.save();
    for (var i = 0; i < this.stars.length; i++) {
      var star = this.stars[i];
      var twinkle = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(star.phase));
      ctx.globalAlpha = twinkle * star.z;
      ctx.fillStyle = star.color;
      var size = star.r * star.z;
      ctx.fillRect(star.x, star.y, size, size);
    }

    if (this.shootingStar) {
      var meteor = this.shootingStar;
      var progress = meteor.life / meteor.maxLife;
      ctx.globalAlpha = progress * 0.85;
      ctx.strokeStyle = COLORS.cyan;
      ctx.lineWidth = 1.4;
      ctx.shadowColor = COLORS.cyan;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(meteor.x, meteor.y);
      ctx.lineTo(meteor.x - meteor.vx * 0.08, meteor.y - meteor.vy * 0.08);
      ctx.stroke();
    }
    ctx.restore();
  };

  Game.prototype.drawGrid = function (ctx) {
    var horizon = 588;
    ctx.save();
    ctx.strokeStyle = "rgba(94, 242, 255, 0.07)";
    ctx.lineWidth = 1;
    for (var i = 0; i <= 12; i++) {
      var bottomX = (i / 12) * VW * 1.6 - VW * 0.3;
      ctx.beginPath();
      ctx.moveTo(VW / 2, horizon);
      ctx.lineTo(bottomX, VH);
      ctx.stroke();
    }
    for (var line = 1; line <= 6; line++) {
      var t = line / 6;
      var y = horizon + Math.pow(t, 2.1) * (VH - horizon);
      ctx.globalAlpha = 0.4 + t * 0.6;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(VW, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    var glow = ctx.createLinearGradient(0, horizon - 30, 0, horizon + 10);
    glow.addColorStop(0, "rgba(94, 242, 255, 0)");
    glow.addColorStop(1, "rgba(94, 242, 255, 0.08)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, horizon - 30, VW, 40);
    ctx.restore();
  };

  Game.prototype.drawBunkers = function (ctx) {
    ctx.save();
    for (var i = 0; i < this.bunkers.length; i++) {
      var bunker = this.bunkers[i];
      var cx = bunker.x + bunker.w / 2;
      var cy = bunker.y + bunker.h / 2;
      var glow = ctx.createRadialGradient(cx, cy, 2, cx, cy, 38);
      glow.addColorStop(0, "rgba(72, 255, 155, 0.16)");
      glow.addColorStop(1, "rgba(72, 255, 155, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(cx - 42, cy - 42, 84, 84);

      for (var row = 0; row < bunker.rows; row++) {
        for (var col = 0; col < bunker.cols; col++) {
          if (!bunker.cells[row][col]) continue;
          ctx.fillStyle = row < 2 ? COLORS.green : row < 5 ? "#35e88a" : "#27c777";
          ctx.fillRect(
            bunker.x + col * bunker.cell,
            bunker.y + row * bunker.cell,
            bunker.cell,
            bunker.cell
          );
        }
      }
    }
    ctx.restore();
  };

  Game.prototype.drawInvaders = function (ctx) {
    var frame = this.formation ? this.formation.frame : 0;
    for (var i = 0; i < this.invaders.length; i++) {
      var invader = this.invaders[i];
      if (!invader.alive) continue;
      var type = INVADER_TYPES[invader.type];
      var pos = this.invaderPos(invader);
      var bob = 0;
      if (this.state === "attract") {
        bob = Math.sin(this.attractT * 1.8 + invader.col * 0.5 + invader.row * 0.3) * 2;
      }
      drawSprite(ctx, type.sprites[frame], pos.x, pos.y + bob, 1);
    }
  };

  Game.prototype.drawUfo = function (ctx) {
    if (!this.ufo) return;
    var ufo = this.ufo;
    drawSprite(ctx, UFO_SPRITE, ufo.x, ufo.y, 1);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (var i = 0; i < 4; i++) {
      var lit = Math.sin(this.t * 8 + i * 1.7) > 0.1;
      if (!lit) continue;
      ctx.fillStyle = i % 2 === 0 ? COLORS.pink : COLORS.cyan;
      ctx.globalAlpha = 0.9;
      ctx.fillRect(ufo.x - 15 + i * 10, ufo.y + 8, 3, 2);
    }
    ctx.restore();
  };

  Game.prototype.drawPowerups = function (ctx) {
    for (var i = 0; i < this.powerups.length; i++) {
      var item = this.powerups[i];
      var type = POWERUP_TYPES[item.type];
      var pulse = 0.75 + 0.25 * Math.sin(this.t * 6 + item.age);
      ctx.save();
      ctx.translate(item.x, item.y);
      ctx.rotate(Math.PI / 4);
      ctx.shadowColor = type.color;
      ctx.shadowBlur = 14 * pulse;
      ctx.fillStyle = "rgba(5, 3, 13, 0.9)";
      ctx.fillRect(-10, -10, 20, 20);
      ctx.strokeStyle = type.color;
      ctx.lineWidth = 2;
      ctx.strokeRect(-10, -10, 20, 20);
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = type.color;
      ctx.fillRect(-8, -8, 16, 16);
      ctx.restore();

      pixelText(ctx, type.letter, item.x, item.y - 4, 2, type.color, "center", 1, 10);
    }
  };

  Game.prototype.drawBombs = function (ctx) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (var i = 0; i < this.bombs.length; i++) {
      var bomb = this.bombs[i];
      var color = bomb.type === "wave" ? COLORS.amber : bomb.type === "aimed" ? COLORS.violet : COLORS.red;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.shadowColor = color;
      ctx.shadowBlur = 9;
      ctx.beginPath();
      ctx.moveTo(bomb.x - 2, bomb.y - 6);
      ctx.lineTo(bomb.x + 2, bomb.y - 2);
      ctx.lineTo(bomb.x - 2, bomb.y + 2);
      ctx.lineTo(bomb.x + 1, bomb.y + 7);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.55;
      ctx.fillRect(bomb.x - 1, bomb.y - 7, 2, 15);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  };

  Game.prototype.drawPlayer = function (ctx) {
    if (!this.player || !this.player.alive) return;
    var player = this.player;
    var alpha = 1;
    if (player.invulnerable > 0) {
      alpha = 0.35 + 0.65 * (Math.sin(this.t * 26) > 0 ? 1 : 0.2);
    }

    var tilt = clamp(player.vx / 900, -0.18, 0.18);
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(tilt);
    drawSprite(ctx, PLAYER_SPRITE, 0, 0, alpha);

    // Engine glow.
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = alpha * 0.75;
    ctx.fillStyle = COLORS.cyan;
    ctx.shadowColor = COLORS.cyan;
    ctx.shadowBlur = 10;
    ctx.fillRect(-4, 12, 3, rand(3, 7));
    ctx.fillRect(2, 12, 3, rand(3, 7));
    ctx.restore();

    if (this.power.shield > 0) {
      var shieldPulse = 0.7 + 0.3 * Math.sin(this.t * 7);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = COLORS.green;
      ctx.shadowColor = COLORS.green;
      ctx.shadowBlur = 14;
      ctx.globalAlpha = 0.45 + 0.2 * shieldPulse;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(player.x, player.y, 27, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 0.2;
      ctx.beginPath();
      ctx.arc(player.x, player.y, 31, this.t * 2, this.t * 2 + 2.1);
      ctx.stroke();
      ctx.restore();
    }

    if (this.power.rapid > 0) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = COLORS.amber;
      ctx.fillRect(player.x - 2, player.y + 15, 4, 2);
      ctx.restore();
    }
  };

  Game.prototype.drawBullets = function (ctx) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.shadowColor = COLORS.cyan;
    ctx.shadowBlur = 8;
    for (var i = 0; i < this.bullets.length; i++) {
      var bullet = this.bullets[i];
      var gradient = ctx.createLinearGradient(0, bullet.y - 8, 0, bullet.y + 8);
      gradient.addColorStop(0, "#ffffff");
      gradient.addColorStop(0.35, COLORS.cyan);
      gradient.addColorStop(1, "rgba(94, 242, 255, 0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(bullet.x - 1.5, bullet.y - 8, 3, 16);
      ctx.globalAlpha = 0.5;
      ctx.fillRect(bullet.x - 3, bullet.y - 6, 6, 3);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  };

  Game.prototype.drawParticles = function (ctx) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (var i = 0; i < this.particles.length; i++) {
      var particle = this.particles[i];
      var alpha = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.color;
      var size = particle.size * (0.4 + alpha * 0.6);
      ctx.fillRect(particle.x - size / 2, particle.y - size / 2, size, size);
    }
    ctx.restore();
  };

  Game.prototype.drawTexts = function (ctx) {
    for (var i = 0; i < this.texts.length; i++) {
      var item = this.texts[i];
      var alpha = clamp(item.life / item.maxLife, 0, 1);
      pixelText(ctx, item.text, item.x, item.y, item.scale, item.color, "center", alpha, 8);
    }
  };

  Game.prototype.drawBanner = function (ctx) {
    var banner = this.banner;
    if (!banner) return;
    var alpha = clamp(banner.t / 0.45, 0, 1);
    var width = 360;
    var x = (VW - width) / 2;
    var y = 320;

    ctx.save();
    ctx.globalAlpha = alpha * 0.75;
    ctx.fillStyle = "rgba(4, 2, 11, 0.82)";
    ctx.fillRect(0, y, VW, 104);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "rgba(94, 242, 255, 0.55)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + width, y);
    ctx.moveTo(x, y + 104);
    ctx.lineTo(x + width, y + 104);
    ctx.stroke();

    var titleScale = banner.title.length > 11 ? 3 : 4;
    pixelText(ctx, banner.title, VW / 2, y + 24, titleScale, COLORS.cyan, "center", alpha, 16);
    pixelText(ctx, banner.sub, VW / 2, y + 68, 2, COLORS.amber, "center", alpha, 8);
    ctx.restore();
  };

  // ---------------------------------------------------------------------------
  // Bootstrap
  // ---------------------------------------------------------------------------

  function init() {
    var root = document.getElementById("game-root");
    var canvas = document.getElementById("game-canvas");
    if (!root || !canvas) return;
    window.neonInvaders = new Game(root, canvas);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
