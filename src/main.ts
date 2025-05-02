import {
  Renderer,
  CanvasWindow,
  InputManager,
  Point,
  addPoints,
  scalePoint,
  rectsOverlap,
  Rectangle,
  getDistanceBetween,
  CanvasCamera,
} from "@fcasibu/cnvs-core";

const canvasElement = document.getElementById(
  "game-canvas",
) as HTMLCanvasElement;
const canvasWindow = new CanvasWindow(canvasElement);
const inputManager = new InputManager();
const renderer = new Renderer(canvasWindow.getContext());
const camera = new CanvasCamera(canvasWindow.getContext());

const PLAYER_SIZE = 40;
const PLAYER_ACCELERATION = 1800;
const PLAYER_INITIAL_SPEED = 400;
const PLAYER_MAX_SPEED = 600;
const PLAYER_FRICTION = 0.85;
const PLAYER_COLOR = "#00FFFF";
const PLAYER_SHIELD_COLOR = "#FFFF00";

const ENEMY_BASE_SIZE = 45;
const ENEMY_COLOR = "#FF6347";
const ENEMY_INITIAL_SPEED = 300;
const ENEMY_MAX_SPEED = 900;
const ENEMY_INITIAL_SPAWN_INTERVAL = 0.8;
const ENEMY_MIN_SPAWN_INTERVAL = 0.15;
const ENEMY_MAX_COUNT = 20;

const DIFFICULTY_INCREASE_INTERVAL = 5;
const DIFFICULTY_SPEED_INCREASE = 30;
const DIFFICULTY_SPAWN_RATE_MULTIPLIER = 0.94;

const SCORE_MULTIPLIER = 100;
const NEAR_MISS_DISTANCE = 25;
const NEAR_MISS_SCORE = 50;

const POWERUP_SPAWN_CHANCE = 0.005;
const POWERUP_SIZE = 30;
const POWERUP_FALL_SPEED = 200;
const POWERUP_DURATION = 5;

const SCREEN_SHAKE_DURATION = 0.3;
const SCREEN_SHAKE_MAGNITUDE = 8;

const GAME_FONT_SIZE = 24;
const GAME_OVER_FONT_SIZE = 48;
const TEXT_COLOR = "#FFFFFF";
const BACKGROUND_COLOR = "#222222";

interface GameObject {
  position: Point;
  velocity?: Point;
  size: number;
  speed: number;
  color: string;
  getRect: () => Rectangle;
}

interface Enemy extends GameObject {
  nearMissScored: boolean;
}

type PowerUpType = "Shield" | "SlowMo";

interface PowerUp extends GameObject {
  type: PowerUpType;
  activeTimer?: number;
}

type GameStatus = "Playing" | "GameOver";

let gameState: GameStatus = "Playing";
let player: GameObject & { velocity: Point; isShielded: boolean };
let enemies: Enemy[] = [];
let powerUps: PowerUp[] = [];
let activePowerUps: { [key in PowerUpType]?: number } = {};

let score = 0;
let highScore = 0;
let enemySpawnTimer = ENEMY_INITIAL_SPAWN_INTERVAL;
let difficultyTimer = 0;
let currentEnemySpeed = ENEMY_INITIAL_SPEED;
let currentSpawnInterval = ENEMY_INITIAL_SPAWN_INTERVAL;

let screenShakeTimer = 0;
let screenShakeMagnitude = 0;

const getRandomNumberInRange = (min: number, max: number): number => {
  return Math.random() * (max - min) + min;
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

const getGameObjectCenter = (obj: GameObject): Point => {
  return { x: obj.position.x + obj.size / 2, y: obj.position.y + obj.size / 2 };
};

const createPlayer = (): GameObject & {
  velocity: Point;
  isShielded: boolean;
} => ({
  speed: PLAYER_INITIAL_SPEED,
  position: {
    x: canvasWindow.getWindowWidth() / 2 - PLAYER_SIZE / 2,
    y: canvasWindow.getWindowHeight() - PLAYER_SIZE,
  },
  velocity: { x: 0, y: 0 },
  size: PLAYER_SIZE,
  color: PLAYER_COLOR,
  isShielded: false,
  getRect: function () {
    return {
      type: "rectangle",
      x: this.position.x,
      y: this.position.y,
      width: this.size,
      height: this.size,
      color: this.isShielded ? PLAYER_SHIELD_COLOR : this.color,
    };
  },
});

const createEnemy = (): Enemy => {
  const sizeVariance = getRandomNumberInRange(0.8, 1.2);
  const size = ENEMY_BASE_SIZE * sizeVariance;
  const xPosition = getRandomNumberInRange(
    0,
    canvasWindow.getWindowWidth() - size,
  );
  const speedVariance = getRandomNumberInRange(-60, 60);

  return {
    position: {
      x: xPosition,
      y:
        -size - getRandomNumberInRange(0, canvasWindow.getWindowHeight() * 0.5),
    },
    size: size,
    speed: clamp(
      currentEnemySpeed + speedVariance,
      ENEMY_INITIAL_SPEED / 2,
      ENEMY_MAX_SPEED,
    ),
    color: ENEMY_COLOR,
    nearMissScored: false,
    getRect: function () {
      return {
        type: "rectangle",
        x: this.position.x,
        y: this.position.y,
        width: this.size,
        height: this.size,
        color: this.color,
      };
    },
  };
};

const createPowerUp = (): PowerUp => {
  const types: PowerUpType[] = ["Shield", "SlowMo"];
  const type = types[Math.floor(Math.random() * types.length)];
  const xPosition = getRandomNumberInRange(
    0,
    canvasWindow.getWindowWidth() - POWERUP_SIZE,
  );
  let color = "#FFFFFF";

  switch (type) {
    case "Shield":
      color = PLAYER_SHIELD_COLOR;
      break;
    case "SlowMo":
      color = "#ADD8E6";
      break;
  }

  return {
    position: {
      x: xPosition,
      y: -POWERUP_SIZE,
    },
    size: POWERUP_SIZE,
    color: color,
    type: type,
    speed: 0,
    getRect: function () {
      return {
        type: "rectangle",
        x: this.position.x,
        y: this.position.y,
        width: this.size,
        height: this.size,
        color: this.color,
      };
    },
  };
};

const loadHighScore = () => {
  const storedScore = localStorage.getItem("dodge_blocks_hs");
  highScore = storedScore ? parseInt(storedScore, 10) : 0;
};

const saveHighScore = () => {
  localStorage.setItem("dodge_blocks_hs", highScore.toString());
};

const triggerScreenShake = (magnitude: number, duration: number) => {
  screenShakeMagnitude = magnitude;
  screenShakeTimer = duration;
};

const resetGame = () => {
  gameState = "Playing";
  player = createPlayer();
  enemies = [];
  powerUps = [];
  activePowerUps = {};
  score = 0;
  enemySpawnTimer = ENEMY_INITIAL_SPAWN_INTERVAL;
  difficultyTimer = 0;
  currentEnemySpeed = ENEMY_INITIAL_SPEED;
  currentSpawnInterval = ENEMY_INITIAL_SPAWN_INTERVAL;
  screenShakeTimer = 0;
  screenShakeMagnitude = 0;
  loadHighScore();

  if (canvasWindow.isPaused()) {
    canvasWindow.resume();
  }
};

const updatePlayer = (dt: number) => {
  let targetVelocityX = 0;

  if (
    inputManager.isKeyPressed("a") ||
    inputManager.isKeyPressed("ArrowLeft")
  ) {
    targetVelocityX -= PLAYER_MAX_SPEED;
  }

  if (
    inputManager.isKeyPressed("d") ||
    inputManager.isKeyPressed("ArrowRight")
  ) {
    targetVelocityX += PLAYER_MAX_SPEED;
  }

  if (targetVelocityX !== 0) {
    player.velocity.x +=
      (targetVelocityX > player.velocity.x ? 1 : -1) * PLAYER_ACCELERATION * dt;
    player.velocity.x = clamp(
      player.velocity.x,
      -PLAYER_MAX_SPEED,
      PLAYER_MAX_SPEED,
    );
  } else {
    player.velocity.x *= Math.pow(PLAYER_FRICTION, dt);

    if (Math.abs(player.velocity.x) < 1) {
      player.velocity.x = 0;
    }
  }

  const moveDelta = scalePoint(player.velocity, dt);
  const newPosition = addPoints(player.position, moveDelta);

  player.position.x = clamp(
    newPosition.x,
    0,
    canvasWindow.getWindowWidth() - player.size,
  );

  player.isShielded = (activePowerUps["Shield"] ?? 0) > 0;
};

const updateEnemies = (dt: number) => {
  const timeScale = (activePowerUps["SlowMo"] ?? 0) > 0 ? 0.4 : 1.0;
  const effectiveDt = dt * timeScale;

  enemySpawnTimer -= dt;

  if (enemySpawnTimer <= 0 && enemies.length < ENEMY_MAX_COUNT) {
    enemies.push(createEnemy());
    enemySpawnTimer = currentSpawnInterval;
  }

  const playerRect = player.getRect();
  const playerCenter = getGameObjectCenter(player);

  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];
    const moveDelta = scalePoint({ x: 0, y: 1 }, enemy.speed * effectiveDt);
    enemy.position = addPoints(enemy.position, moveDelta);

    if (
      !enemy.nearMissScored &&
      enemy.position.y > player.position.y - enemy.size
    ) {
      const enemyCenter = getGameObjectCenter(enemy);
      const distance = getDistanceBetween(playerCenter, enemyCenter);
      const combinedHalfSize = player.size / 2 + enemy.size / 2;

      if (distance < combinedHalfSize + NEAR_MISS_DISTANCE) {
        if (!rectsOverlap(playerRect, enemy.getRect())) {
          score += NEAR_MISS_SCORE;
          enemy.nearMissScored = true;
        }
      }
    }

    if (rectsOverlap(playerRect, enemy.getRect())) {
      if (player.isShielded) {
        enemies.splice(i, 1);
      } else {
        gameState = "GameOver";
        triggerScreenShake(SCREEN_SHAKE_MAGNITUDE, SCREEN_SHAKE_DURATION);

        if (score > highScore) {
          highScore = Math.floor(score);
          saveHighScore();
        }

        return;
      }
    }

    if (enemy.position.y > canvasWindow.getWindowHeight()) {
      enemies.splice(i, 1);
    }
  }
};

const updatePowerUps = (dt: number) => {
  if (Math.random() < POWERUP_SPAWN_CHANCE * dt * 60 && powerUps.length < 3) {
    powerUps.push(createPowerUp());
  }

  const playerRect = player.getRect();
  for (let i = powerUps.length - 1; i >= 0; i--) {
    const pu = powerUps[i];
    const moveDelta = scalePoint({ x: 0, y: 1 }, POWERUP_FALL_SPEED * dt);
    pu.position = addPoints(pu.position, moveDelta);

    if (rectsOverlap(playerRect, pu.getRect())) {
      activePowerUps[pu.type] =
        (activePowerUps[pu.type] ?? 0) + POWERUP_DURATION;
      powerUps.splice(i, 1);
    } else if (pu.position.y > canvasWindow.getWindowHeight()) {
      powerUps.splice(i, 1);
    }
  }

  for (const type in activePowerUps) {
    if (activePowerUps[type as PowerUpType]! > 0) {
      activePowerUps[type as PowerUpType]! -= dt;

      if (activePowerUps[type as PowerUpType]! <= 0) {
        delete activePowerUps[type as PowerUpType];
      }
    }
  }
};

const updateDifficulty = (dt: number) => {
  difficultyTimer += dt;
  if (difficultyTimer >= DIFFICULTY_INCREASE_INTERVAL) {
    difficultyTimer -= DIFFICULTY_INCREASE_INTERVAL;

    currentEnemySpeed = Math.min(
      ENEMY_MAX_SPEED,
      currentEnemySpeed + DIFFICULTY_SPEED_INCREASE,
    );

    currentSpawnInterval = Math.max(
      ENEMY_MIN_SPAWN_INTERVAL,
      currentSpawnInterval * DIFFICULTY_SPAWN_RATE_MULTIPLIER,
    );
  }
};

const updateGame = (dt: number) => {
  if (screenShakeTimer > 0) {
    screenShakeTimer -= dt;

    if (screenShakeTimer <= 0) {
      screenShakeMagnitude = 0;
      screenShakeTimer = 0;
    }
  }

  if (gameState === "GameOver") {
    canvasWindow.pause();
    return;
  }

  updatePlayer(dt);
  updateEnemies(dt);

  if (gameState === "Playing") {
    updatePowerUps(dt);
    updateDifficulty(dt);
    score += dt * SCORE_MULTIPLIER;
  }
};

const drawGame = () => {
  renderer.clear(BACKGROUND_COLOR);

  powerUps.forEach((pu) => {
    renderer.drawShape(pu.getRect());
  });

  enemies.forEach((enemy) => {
    renderer.drawShape(enemy.getRect());
  });

  renderer.drawShape(player.getRect());

  renderer.drawText({
    text: `Score: ${Math.floor(score)}`,
    position: { x: 10, y: 30 },
    color: TEXT_COLOR,
    fontSize: GAME_FONT_SIZE,
  });
  renderer.drawText({
    text: `Hi: ${highScore}`,
    position: { x: canvasWindow.getWindowWidth() - 150, y: 30 },
    color: TEXT_COLOR,
    fontSize: GAME_FONT_SIZE,
  });

  let powerupYOffset = 60;
  for (const type in activePowerUps) {
    const timer = activePowerUps[type as PowerUpType]!;

    if (timer > 0) {
      renderer.drawText({
        text: `${type}: ${timer.toFixed(1)}s`,
        position: { x: 10, y: powerupYOffset },
        color: TEXT_COLOR,
        fontSize: GAME_FONT_SIZE * 0.8,
      });

      powerupYOffset += GAME_FONT_SIZE;
    }
  }
};

const drawGameOver = () => {
  renderer.setGlobalAlpha(0.7);
  renderer.drawShape({
    type: "rectangle",
    x: 0,
    y: 0,
    width: canvasWindow.getWindowWidth(),
    height: canvasWindow.getWindowHeight(),
    color: "#000000",
  });
  renderer.setGlobalAlpha(1.0);

  const gameOverText = "Game Over";
  const gameOverMeasure = renderer.measureText({
    text: gameOverText,
    fontSize: GAME_OVER_FONT_SIZE,
  });
  renderer.drawText({
    text: gameOverText,
    position: {
      x: (canvasWindow.getWindowWidth() - gameOverMeasure.width) / 2,
      y: canvasWindow.getWindowHeight() / 2 - GAME_OVER_FONT_SIZE,
    },
    color: TEXT_COLOR,
    fontSize: GAME_OVER_FONT_SIZE,
  });

  const scoreText = `Final Score: ${Math.floor(score)}`;
  const scoreMeasure = renderer.measureText({
    text: scoreText,
    fontSize: GAME_FONT_SIZE,
  });
  renderer.drawText({
    text: scoreText,
    position: {
      x: (canvasWindow.getWindowWidth() - scoreMeasure.width) / 2,
      y: canvasWindow.getWindowHeight() / 2 + 10,
    },
    color: TEXT_COLOR,
    fontSize: GAME_FONT_SIZE,
  });

  const highScoreText = `High Score: ${highScore}`;
  const highScoreMeasure = renderer.measureText({
    text: highScoreText,
    fontSize: GAME_FONT_SIZE,
  });
  renderer.drawText({
    text: highScoreText,
    position: {
      x: (canvasWindow.getWindowWidth() - highScoreMeasure.width) / 2,
      y: canvasWindow.getWindowHeight() / 2 + GAME_FONT_SIZE + 20,
    },
    color: TEXT_COLOR,
    fontSize: GAME_FONT_SIZE,
  });

  const restartText = "Press 'R' to Restart";
  const restartMeasure = renderer.measureText({
    text: restartText,
    fontSize: GAME_FONT_SIZE,
  });
  renderer.drawText({
    text: restartText,
    position: {
      x: (canvasWindow.getWindowWidth() - restartMeasure.width) / 2,
      y: canvasWindow.getWindowHeight() / 2 + GAME_FONT_SIZE * 2 + 40,
    },
    color: TEXT_COLOR,
    fontSize: GAME_FONT_SIZE,
  });
};

const gameLoop = (dt: number) => {
  const cappedDt = Math.min(dt, 1 / 30);

  if (gameState === "Playing") {
    updateGame(cappedDt);
  } else if (gameState === "GameOver") {
    if (screenShakeTimer > 0) {
      screenShakeTimer -= cappedDt;

      if (screenShakeTimer <= 0) {
        screenShakeMagnitude = 0;
        screenShakeTimer = 0;
      }
    }

    if (inputManager.isKeyPressed("r")) {
      resetGame();
    }
  }

  let shakeX = 0;
  let shakeY = 0;

  if (screenShakeTimer > 0 && screenShakeMagnitude > 0) {
    shakeX = (Math.random() - 0.5) * 2 * screenShakeMagnitude;
    shakeY = (Math.random() - 0.5) * 2 * screenShakeMagnitude;
  }

  camera.configure({ offset: { x: -shakeX, y: -shakeY } });
  camera.apply();
  drawGame();

  if (gameState === "GameOver") {
    drawGameOver();
  }

  camera.reset();
};

inputManager.registerListeners(canvasElement);
canvasWindow.setFps(144);
loadHighScore();
resetGame();

canvasWindow.run(gameLoop);
