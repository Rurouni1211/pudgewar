// client/scenes/GameScene.js

import { socket } from "../game.js";

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: "GameScene" });
    this.myBox = null;
    this.otherPlayers = {}; // Use an object/Map to store other players by ID
    this.opponentId = null; // Still useful if you want to track a specific "primary" opponent
    this.playerBounds = null;
    this.isTopPlayer = false; // Flag to determine which half the player belongs to

    this.cooldowns = { hook: 0, blink: 0, shift: 0 };
    this.currentAbility = null;
    this.facing = "up"; // Default facing direction
    this.shiftActive = false;
    this.originalColor = 0x00ff00; // Original color (you might not need this if using sprites)
    this.shiftTimer = null;

    this.activeHookLine = null;
    this.hookTween = null;
    this.respawnCountdownText = null; // New: For displaying countdown

    this.myScore = 0;
    this.playerScores = {}; // Use an object to store all player scores { playerId: score, ... }
    this.myScoreText = null;
    this.scoreTexts = {}; // To manage multiple score displays on the UI

    this.gameOverText = null; // New: To display game over message
  }

  preload() {
    console.log("GameScene: Preloading assets...");
    this.load.image("hookIcon", "assets/hook.png");
    this.load.image("blinkIcon", "assets/blink.png");
    this.load.image("shiftIcon", "assets/shift.png");
    this.load.image("bg", "assets/background.png");
    this.load.spritesheet("butcher", "assets/butchers.png", {
      frameWidth: 24,
      frameHeight: 32,
    });

    console.log("GameScene: Assets preloaded.");
  }

  create(initialGameData) {
    console.log("GameScene: create method started.");
    this.add
      .image(0, 0, "bg")
      .setOrigin(0, 0)
      .setDisplaySize(this.game.config.width, this.game.config.height)
      .setDepth(-100);

    socket.removeAllListeners(); // Clear existing listeners to prevent duplicates
    this.anims.create({
      key: "butcher_idle",
      frames: [{ key: "butcher", frame: 0 }],
      frameRate: 1,
      repeat: -1,
    });

    this.anims.create({
      key: "butcher_walk_down",
      frames: this.anims.generateFrameNumbers("butcher", { start: 0, end: 3 }),
      frameRate: 6,
      repeat: -1,
    });

    this.anims.create({
      key: "butcher_walk_left",
      frames: this.anims.generateFrameNumbers("butcher", { start: 4, end: 7 }),
      frameRate: 6,
      repeat: -1,
    });

    this.anims.create({
      key: "butcher_walk_right",
      frames: this.anims.generateFrameNumbers("butcher", { start: 4, end: 7 }), // reuse left frames or mirror via flipX
      frameRate: 6,
      repeat: -1,
    });

    this.anims.create({
      key: "butcher_walk_up",
      frames: this.anims.generateFrameNumbers("butcher", { start: 8, end: 11 }),
      frameRate: 6,
      repeat: -1,
    });

    // Initialize myBox here, its position will be set in setupGame
    this.myBox = this.add.sprite(0, 0, "butcher").setDepth(5);
    this.myBox.setScale(2, 2);
    this.myBox.play("butcher_idle");

    // Add physics body AFTER setting initial position. This is critical for movement.
    this.physics.add.existing(this.myBox);
    this.myBox.body.setCollideWorldBounds(true);
    this.myBox.body.setImmovable(false);
    this.myBox.body.setAllowGravity(false);
    this.myBox.body.setSize(32, 32);
    this.myBox.body.setBounce(0);
    console.log("💡 myBox.body type:", this.myBox.body.constructor.name);

    // Setup keyboard input
    this.cursors = this.input.keyboard.createCursorKeys();
    this.WASD = this.input.keyboard.addKeys("W,A,S,D");
    this.input.keyboard.on("keydown-Q", this.tryHook, this);
    this.input.keyboard.on("keydown-R", this.tryBlink, this);
    this.input.keyboard.on("keydown-E", this.tryShift, this);
    this.input.keyboard.on("keydown-S", this.cancelAction, this); // 'S' for Cancel Action

    // --- NEW MOUSE MOVEMENT LOGIC (Click-to-Move) ---
    this.input.on("pointerdown", (pointer) => {
      // Only respond to left-click for movement and if no ability is active or game is not over
      if (
        !this.currentAbility &&
        pointer.leftButtonDown() &&
        !this.isGameOver
      ) {
        this.targetPosition = new Phaser.Math.Vector2(pointer.x, pointer.y);
        // Immediately stop keyboard movement if a new mouse target is set
        this.myBox.body.setVelocity(0, 0);
        // Emit position to server immediately to register the start of a move
        socket.emit("playerMove", {
          id: socket.id,
          x: this.myBox.x,
          y: this.myBox.y,
        });
      }
    });

    // Setup ability icons and their cooldown overlays/texts (unchanged)
    this.skillIcons = {
      hook: this.add.image(50, 550, "hookIcon").setScale(0.5).setDepth(10),
      blink: this.add.image(120, 550, "blinkIcon").setScale(0.5).setDepth(10),
      shift: this.add.image(190, 550, "shiftIcon").setScale(0.5).setDepth(10),
    };

    this.cooldownOverlays = {
      hook: this.add
        .rectangle(50, 550, 64, 64, 0x000000, 0.6)
        .setDepth(11)
        .setVisible(false),
      blink: this.add
        .rectangle(120, 550, 64, 64, 0x000000, 0.6)
        .setDepth(11)
        .setVisible(false),
      shift: this.add
        .rectangle(190, 550, 64, 64, 0x000000, 0.6)
        .setDepth(11)
        .setVisible(false),
    };
    this.cooldownTexts = {
      hook: this.add
        .text(50, 550, "", {
          font: "20px Arial",
          fontStyle: "bold",
          fill: "#ffffff",
          stroke: "#000000",
          strokeThickness: 3,
        })
        .setOrigin(0.5)
        .setDepth(12),
      blink: this.add
        .text(120, 550, "", {
          font: "20px Arial",
          fontStyle: "bold",
          fill: "#ffffff",
          stroke: "#000000",
          strokeThickness: 3,
        })
        .setOrigin(0.5)
        .setDepth(12),
      shift: this.add
        .text(190, 550, "", {
          font: "20px Arial",
          fontStyle: "bold",
          fill: "#ffffff",
          stroke: "#000000",
          strokeThickness: 3,
        })
        .setOrigin(0.5)
        .setDepth(12),
    };

    // Initialize all player score texts
    this.scoreTexts[socket.id] = this.add
      .text(16, 16, `My Score: 0`, {
        font: "24px Arial",
        fill: "#ffffff",
        stroke: "#000000",
        strokeThickness: 4,
      })
      .setDepth(100);

    // Respawn countdown text setup
    this.respawnCountdownText = this.add
      .text(this.game.config.width / 2, this.game.config.height / 2, "", {
        font: "48px Arial",
        fontStyle: "bold",
        fill: "#fff",
        stroke: "#000",
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(20)
      .setVisible(false);

    // Game Over Text
    this.gameOverText = this.add
      .text(this.game.config.width / 2, this.game.config.height / 2, "", {
        font: "60px Arial",
        fontStyle: "bold",
        fill: "#ff0000",
        stroke: "#000000",
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setDepth(100)
      .setVisible(false);

    // This line draws a white line at y=300 for visual debugging or reference.
    this.add
      .line(0, 300, 0, 0, 1024, 0, 0xffffff)
      .setOrigin(0, 0)
      .setLineWidth(2)
      .setAlpha(0.2)
      .setDepth(1);

    if (
      initialGameData &&
      initialGameData.players &&
      initialGameData.positions
    ) {
      console.log(
        "GameScene: Applying initial game data from scene transition."
      );
      this.setupGame(initialGameData.players, initialGameData.positions);
    } else {
      console.warn(
        "GameScene: No initial game data received. This scene might have been started incorrectly without a proper lobby."
      );
    }

    // --- Socket Listeners ---
    socket.on("playerMove", ({ id, x, y }) => {
      if (id !== socket.id) {
        const playerSprite = this.otherPlayers[id];
        if (!playerSprite) {
          console.warn(`Player sprite not found for ID: ${id}`);
          return;
        }
        const oldX = playerSprite.x;
        const oldY = playerSprite.y;

        // Always update the opponent's position for accuracy
        playerSprite.setPosition(x, y);

        const dx = x - oldX;
        const dy = y - oldY;
        const distanceTraveled = Phaser.Math.Distance.Between(x, y, oldX, oldY);

        // Define a threshold for "significant" movement
        const movementThreshold = 5;

        if (distanceTraveled > movementThreshold) {
          if (Math.abs(dx) > Math.abs(dy)) {
            playerSprite.setFlipX(dx < 0);
            playerSprite.play("butcher_walk_left", true);
          } else {
            playerSprite.setFlipX(false);
            playerSprite.play(
              dy > 0 ? "butcher_walk_down" : "butcher_walk_up",
              true
            );
          }
        } else {
          if (playerSprite.anims.currentAnim?.key !== "butcher_idle") {
            playerSprite.play("butcher_idle", true);
          }
        }
      }
    });

    socket.on(
      "hookStarted",
      ({ playerId, startX, startY, hookAngle, hookLength, hookSpeed }) => {
        console.log(
          `🎣 Hook started by ${playerId} from (${startX}, ${startY})`
        );
        // Clear any existing hook line if one is active (e.g., from a previous player)
        if (this.activeHookLine) this.activeHookLine.destroy();
        if (this.hookTween) this.hookTween.stop();

        this.activeHookLine = this.add.graphics().setDepth(6);
        this.activeHookLine.lineStyle(2, 0xffffff, 1);
        const hookVisualState = { currentLength: 0 };
        this.hookTween = this.tweens.add({
          targets: hookVisualState,
          currentLength: hookLength,
          duration: (hookLength / hookSpeed) * 1000,
          ease: "Linear",
          onUpdate: () => {
            this.activeHookLine.clear();
            this.activeHookLine.lineStyle(2, 0xffffff, 1);
            const currentEndX =
              startX + Math.cos(hookAngle) * hookVisualState.currentLength;
            const currentEndY =
              startY + Math.sin(hookAngle) * hookVisualState.currentLength;
            this.activeHookLine
              .beginPath()
              .moveTo(startX, startY)
              .lineTo(currentEndX, currentEndY)
              .strokePath();
          },
          onComplete: () => {
            console.log(`Hook animation completed for ${playerId}.`);
            if (this.activeHookLine) {
              this.activeHookLine.destroy();
              this.activeHookLine = null;
            }
            this.hookTween = null;
          },
        });
      }
    );

    socket.on("scoreUpdated", ({ playerId, score }) => {
      // Update the score for the specific player
      this.playerScores[playerId] = score;

      // Update the display text for that player.
      // You might need a more sophisticated UI for multiple scores,
      // e.g., iterating through this.scoreTexts or specific positions for each.
      if (playerId === socket.id) {
        this.myScore = score; // Keep myScore for convenience
        this.scoreTexts[playerId].setText(`My Score: ${score}`);
        console.log(`My score updated to: ${this.myScore}`);
      } else if (this.scoreTexts[playerId]) {
        this.scoreTexts[playerId].setText(
          `P${
            Object.keys(this.otherPlayers).indexOf(playerId) + 1
          } Score: ${score}`
        );
        console.log(`Player ${playerId} score updated to: ${score}`);
      }
    });

    socket.on("hookHit", ({ by, target, pullTo }) => {
      console.log(
        `🎣 HookHit received: by ${by}, target ${target}, pullTo (${pullTo.x}, ${pullTo.y})`
      );
      if (this.activeHookLine) {
        this.activeHookLine.destroy();
        this.activeHookLine = null;
      }
      if (this.hookTween) {
        this.hookTween.stop();
        this.hookTween = null;
      }

      if (by === socket.id) {
        // I hooked someone
        const hookedPlayerSprite = this.otherPlayers[target];
        if (hookedPlayerSprite) {
          // ✅ Dim the player (make semi-transparent)
          hookedPlayerSprite.setAlpha(0.5);

          this.tweens.add({
            targets: hookedPlayerSprite,
            x: pullTo.x,
            y: pullTo.y - 40,
            duration: 300,
            // onComplete: () => {
            //   // ✅ Restore full opacity after pull
            //   hookedPlayerSprite.setAlpha(1);
            // },
          });
        }
        this.currentAbility = null;
        console.log("currentAbility cleared (Hook hit by me).");
      } else if (target === socket.id) {
        // I was hooked
        this.tweens.add({
          targets: this.myBox,
          x: pullTo.x,
          y: pullTo.y + 40, // Adjust pullTo Y if needed for visual effect
          duration: 300,
          onComplete: () => {
            this.myBox.setVisible(false); // Hide player immediately after pull
            this.currentAbility = "hooked"; // Set a temporary state to prevent movement/abilities
            console.log("Player hidden and in 'hooked' state.");
            this.respawnCountdownText.setVisible(true).setText("2"); // Show countdown
            this.time.delayedCall(1000, () =>
              this.respawnCountdownText.setText("1")
            );
            this.time.delayedCall(2000, () =>
              this.respawnCountdownText.setText("")
            ); // Clear after delay
          },
        });
      }
    });

    socket.on("hookMiss", () => {
      console.log("❌ HookMiss received.");
      if (this.activeHookLine) {
        this.activeHookLine.destroy();
        this.activeHookLine = null;
      }
      if (this.hookTween) {
        this.hookTween.stop();
        this.hookTween = null;
      }
      this.currentAbility = null;
      console.log("currentAbility cleared (Hook missed).");
    });

    socket.on("startRespawnCountdown", ({ target }) => {
      console.log(`Received startRespawnCountdown for ${target}.`);
      if (target === socket.id) {
        this.myBox.setVisible(false); // Hide if you're the one getting respawned
      } else {
        const respawnedPlayer = this.otherPlayers[target];
        if (respawnedPlayer) {
          respawnedPlayer.setVisible(false); // Hide opponent
        }
      }

      // Show countdown on screen regardless of whether it's you or another player (customize as needed)
      this.respawnCountdownText.setVisible(true).setText("2");

      this.time.delayedCall(1000, () => {
        this.respawnCountdownText.setText("1");
      });

      this.time.delayedCall(2000, () => {
        this.respawnCountdownText.setVisible(false);
      });
    });

    socket.on("respawn", ({ x, y, target }) => {
      console.log(`♻️ Respawn received for ${target}: (${x}, ${y})`);
      if (socket.id === target) {
        this.myBox.setPosition(x, y);
        if (this.myBox.body) {
          this.myBox.body.x = x - this.myBox.body.width / 2;
          this.myBox.body.y = y - this.myBox.body.height / 2;
        }
        this.myBox.setVisible(true); // Ensure player is visible after respawn
        this.currentAbility = null; // Ensure ability state is cleared after respawn
        this.respawnCountdownText.setVisible(false); // Hide countdown text
        console.log("Player respawned and visible.");
      } else {
        const respawnedPlayer = this.otherPlayers[target];
        if (respawnedPlayer) {
          respawnedPlayer.setPosition(x, y);
          respawnedPlayer.setVisible(true);
          respawnedPlayer.setAlpha(1); // ✅ Fully visible again after respawn
          console.log(`Opponent ${target} respawned and visible.`);
        }
      }
    });

    socket.on("blinkEffect", ({ playerId, newX, newY }) => {
      console.log(
        `✨ BlinkEffect received for ${playerId}: (${newX}, ${newY})`
      );
      if (playerId !== socket.id) {
        const playerSprite = this.otherPlayers[playerId];
        if (playerSprite) {
          playerSprite.setPosition(newX, newY);
        }
      }
    });

    socket.on("shiftEffect", ({ playerId }) => {
      console.log(`👻 ShiftEffect received for ${playerId}`);
      if (playerId !== socket.id) {
        const playerSprite = this.otherPlayers[playerId];
        if (playerSprite) {
          // Assuming you have a way to visually represent this (e.g., tint, alpha)
          playerSprite.setAlpha(0.5); // Example: make opponent semi-transparent
        }
      }
    });

    socket.on("shiftEndEffect", ({ playerId }) => {
      console.log(`✅ ShiftEndEffect received for ${playerId}`);
      if (playerId !== socket.id) {
        const playerSprite = this.otherPlayers[playerId];
        if (playerSprite) {
          playerSprite.setAlpha(1); // Example: revert alpha
        }
      }
    });

    socket.on("opponentDisconnected", (message) => {
      console.warn(`💔 Opponent disconnected: ${message}`);
      alert(message);
      // Clean up all players and go back to lobby
      this.cleanupGame();
      this.scene.start("LobbyScene");
    });

    // --- NEW: Game Over Listener ---
    socket.on("gameOver", ({ winnerId, winnerName }) => {
      console.log(`🎉 Game Over! Winner: ${winnerName} (${winnerId})`);
      this.isGameOver = true; // Set a flag to disable further gameplay
      this.myBox.body.setVelocity(0, 0); // Stop player movement
      this.gameOverText.setText(`${winnerName} Wins!`).setVisible(true);

      // Disable all controls
      this.input.keyboard.enabled = false;
      this.input.mouse.enabled = false;
      this.currentAbility = "gameOver"; // Prevent any abilities

      // Fade out all player sprites (optional, but good for visual feedback)
      this.tweens.add({
        targets: [this.myBox, ...Object.values(this.otherPlayers)],
        alpha: 0.2,
        duration: 1000,
        ease: "Linear",
      });
    });

    socket.on("gameReset", () => {
      console.log("Game reset received. Returning to lobby.");
      this.cleanupGame(); // Clean up all game objects
      this.scene.start("LobbyScene"); // Transition to Lobby Scene
    });

    this.highlightSkill(null);
    console.log("GameScene: create method finished.");
  }

  setupGame(players, positions) {
    // Now allows for more than 2 players, as long as there's at least one other player
    if (!positions || !positions[socket.id] || !players || players.length < 1) {
      console.warn("⚠️ Invalid game data for setupGame:", positions, players);
      return;
    }

    console.log(`GameScene Setup: My ID: ${socket.id}`);
    this.isGameOver = false; // Reset game over flag
    this.gameOverText.setVisible(false); // Hide game over text

    // Clear any previous players/scores from a prior game
    for (const id in this.otherPlayers) {
      this.otherPlayers[id].destroy();
      delete this.otherPlayers[id];
    }
    for (const id in this.scoreTexts) {
      this.scoreTexts[id].destroy();
      delete this.scoreTexts[id];
    }
    this.playerScores = {}; // Reset all scores

    const gameHeight = this.game.config.height;
    const gameWidth = this.game.config.width;

    // --- CRITICAL CONSTANTS: ADJUST THESE BASED ON YOUR BACKGROUND IMAGE ---
    const riverVisualTop = 240;
    const riverVisualBottom = 380;
    // --- END CRITICAL CONSTANTS ---

    let scoreDisplayY = 16; // Starting Y position for scores
    const scoreDisplayXOffset = gameWidth - 16; // For right-aligned scores
    const scoreDisplayLineHeight = 30; // Vertical space between scores

    players.forEach((playerId, index) => {
      const playerSpawn = positions[playerId];
      if (!playerSpawn) {
        console.warn(`No spawn position found for player ID: ${playerId}`);
        return;
      }

      if (playerId === socket.id) {
        // This is my player
        console.log(
          `GameScene Setup: Setting myBox position to (${playerSpawn.x}, ${playerSpawn.y})`
        );
        this.myBox.setPosition(playerSpawn.x, playerSpawn.y);
        this.myBox.setVisible(true); // Ensure my player is visible
        this.myBox.setAlpha(1); // Ensure my player is full alpha
        this.myBox.play("butcher_idle"); // Start with idle animation

        this.isTopPlayer = playerSpawn.y < gameHeight / 2;

        if (this.isTopPlayer) {
          this.playerBounds = new Phaser.Geom.Rectangle(
            0,
            0,
            gameWidth,
            riverVisualTop
          );
        } else {
          this.playerBounds = new Phaser.Geom.Rectangle(
            0,
            riverVisualBottom,
            gameWidth,
            gameHeight - riverVisualBottom
          );
        }
        console.log(
          `GameScene Setup: Player ${socket.id} is the ${
            this.isTopPlayer ? "TOP" : "BOTTOM"
          } player. Bounds: ${JSON.stringify(this.playerBounds)}`
        );
        // My score is always top-left
        this.scoreTexts[playerId] = this.add
          .text(16, 16, `My Score: 0`, {
            font: "24px Arial",
            fill: "#ffffff",
            stroke: "#000000",
            strokeThickness: 4,
          })
          .setDepth(100);
      } else {
        // This is an opponent
        console.log(
          `GameScene Setup: Creating and setting opponent ${playerId} position to (${playerSpawn.x}, ${playerSpawn.y})`
        );
        const opponentSprite = this.add
          .sprite(playerSpawn.x, playerSpawn.y, "butcher")
          .setDepth(5);
        opponentSprite.setScale(2, 2);
        opponentSprite.play("butcher_idle");
        this.otherPlayers[playerId] = opponentSprite; // Store the opponent sprite

        // Place opponent scores, for example, on the right side of the screen
        this.scoreTexts[playerId] = this.add
          .text(
            scoreDisplayXOffset,
            scoreDisplayY + index * scoreDisplayLineHeight,
            `P${index} Score: 0`,
            {
              // P1, P2, P3 etc
              font: "24px Arial",
              fill: "#ffffff",
              stroke: "#000000",
              strokeThickness: 4,
            }
          )
          .setOrigin(1, 0) // Align to top-right
          .setDepth(100);
      }
      this.playerScores[playerId] = 0; // Initialize score for all players
    });

    console.log("GameScene Setup: Initial game setup complete.");
  }

  /**
   * Phaser's update loop, runs every frame. Handles player movement and cooldowns.
   */
  update() {
    // Prevent any action if game is over
    if (this.isGameOver) {
      if (this.myBox?.body && this.myBox.body.speed > 0) {
        this.myBox.body.setVelocity(0, 0);
      }
      return;
    }

    // Only allow movement if myBox/playerBounds are ready, and player is not hooked
    if (
      !this.myBox?.body ||
      !this.playerBounds ||
      this.currentAbility === "hooked" // Prevent movement if "hooked"
    ) {
      // If we're hooked, we should stop any ongoing movement.
      if (this.myBox?.body && this.myBox.body.speed > 0) {
        this.myBox.body.setVelocity(0, 0);
        socket.emit("playerMove", {
          id: socket.id,
          x: this.myBox.x,
          y: this.myBox.y,
        });
      }
      return;
    }

    const speed = 200;
    let velocityX = 0;
    let velocityY = 0;
    let playerMovedThisFrame = false; // Flag to track if player's velocity was set this frame

    // --- Mouse Movement (Click-to-Move) ---
    // If a target position is set AND player is not in shift mode AND no ability is active
    if (this.targetPosition && !this.shiftActive && !this.currentAbility) {
      const distance = Phaser.Math.Distance.BetweenPoints(
        this.myBox,
        this.targetPosition
      );

      // Define a small threshold to consider the player "at" the target
      const arrivalThreshold = 5;

      if (distance > arrivalThreshold) {
        // Player is not at the target, calculate velocity towards it
        const angle = Phaser.Math.Angle.Between(
          this.myBox.x,
          this.myBox.y,
          this.targetPosition.x,
          this.targetPosition.y
        );
        velocityX = Math.cos(angle) * speed;
        velocityY = Math.sin(angle) * speed;
        playerMovedThisFrame = true;

        // Update facing direction based on movement direction
        if (Math.abs(velocityX) > Math.abs(velocityY)) {
          this.facing = velocityX > 0 ? "right" : "left";
        } else {
          this.facing = velocityY > 0 ? "down" : "up";
        }
      } else {
        // Player has reached the target, stop movement and clear target
        this.targetPosition = null;
        velocityX = 0;
        velocityY = 0;
        playerMovedThisFrame = true; // Still counts as a "movement" to stop
      }
    }
    if (velocityX === 0 && velocityY === 0) {
      this.myBox.play("butcher_idle", true);
    } else if (Math.abs(velocityX) > Math.abs(velocityY)) {
      // Horizontal movement
      this.myBox.setFlipX(velocityX > 0); // ✅ flip when moving right
      this.myBox.play("butcher_walk_left", true); // use only walk_left animation
    } else {
      // Vertical movement
      this.myBox.setFlipX(false); // reset flip
      this.myBox.play(
        velocityY > 0 ? "butcher_walk_down" : "butcher_walk_up",
        true
      );
    }

    // Apply velocity if not in shift mode
    if (!this.shiftActive) {
      this.myBox.body.setVelocity(velocityX, velocityY);

      // Clamp the physics body's position to enforce boundaries
      this.myBox.body.x = Phaser.Math.Clamp(
        this.myBox.body.x,
        this.playerBounds.x, // Minimum X (left edge of bounds)
        this.playerBounds.x + this.playerBounds.width - this.myBox.body.width // Maximum X (right edge of bounds - player width)
      );
      this.myBox.body.y = Phaser.Math.Clamp(
        this.myBox.body.y,
        this.playerBounds.y, // Minimum Y (top edge of bounds)
        this.playerBounds.y + this.playerBounds.height - this.myBox.body.height // Maximum Y (bottom edge of bounds - player height)
      );

      // Sync the visual rectangle's center to the physics body's center
      this.myBox.x = this.myBox.body.x + this.myBox.body.width / 2;
      this.myBox.y = this.myBox.body.y + this.myBox.body.height / 2;

      // Emit player movement to the server if they moved or stopped moving
      if (
        playerMovedThisFrame ||
        (this.myBox.body.speed > 0 && velocityX === 0 && velocityY === 0)
      ) {
        socket.emit("playerMove", {
          id: socket.id,
          x: this.myBox.x,
          y: this.myBox.y,
        });
      }
    } else {
      this.myBox.body.setVelocity(0, 0); // Player cannot move during shift
    }

    // Update cooldown texts for abilities (unchanged)
    for (const key in this.cooldowns) {
      const remaining = this.cooldowns[key] - this.time.now;
      this.cooldownTexts[key].setText(
        remaining >= 0 ? Math.ceil(remaining / 1000).toString() : ""
      );
    }
  }

  /**
   * Attempts to fire the Hook ability.
   */
  tryHook() {
    console.log("Attempting Hook...");
    // Prevent hook if currently "hooked" or game is over
    if (
      this.isGameOver ||
      this.currentAbility === "hooked" ||
      this.currentAbility ||
      this.cooldowns.hook > this.time.now
    ) {
      console.log(
        `Hook on cooldown or another ability active. Cooldown: ${this.cooldowns.hook}, Current Ability: ${this.currentAbility}, Current Time: ${this.time.now}`
      );
      return;
    }

    this.currentAbility = "hook";
    console.log("currentAbility set to 'hook' in tryHook");
    this.cooldowns.hook = this.time.now + 4000;
    this.highlightSkill("hook");
    this.showCooldown("hook", 4000);

    // Get the current mouse pointer's world coordinates
    // const worldPointer = this.input.activePointer.positionToCamera(
    //   this.cameras.main
    // );
    // const targetX = worldPointer.x;
    // const targetY = worldPointer.y;

    const pointer = this.input.activePointer;
    const targetX = pointer.worldX;
    const targetY = pointer.worldY;

    console.log("Hook fired (event sent to server)! Coords:", {
      from: { x: this.myBox.x, y: this.myBox.y },
      to: { targetX, targetY },
    });

    // Send the player's current position and the target coordinates to the server.
    // The server will then calculate the angle and handle the hook logic.
    socket.emit("hookFired", {
      playerId: socket.id,
      startX: this.myBox.x,
      startY: this.myBox.y,
      targetX,
      targetY,
    });

    // console.log("Target (mouse):", targetX, targetY);
    // console.log("Start (player):", this.myBox.x, this.myBox.y);
    // this.add.circle(targetX, targetY, 4, 0xff0000).setDepth(999); // dot at mouse
    // this.add.circle(this.myBox.x, this.myBox.y, 4, 0x00ff00).setDepth(999); // dot at start
  }

  /**
   * Attempts to use the Blink ability.
   */
  tryBlink() {
    console.log("Attempting Blink...");
    if (!this.myBox || !this.playerBounds) {
      console.warn("Cannot blink: myBox or playerBounds not initialized.");
      return;
    }
    // Prevent blink if currently "hooked" or game is over
    if (
      this.isGameOver ||
      this.currentAbility === "hooked" ||
      this.currentAbility ||
      this.cooldowns.blink > this.time.now
    ) {
      console.log(
        `Blink on cooldown or another ability active. Cooldown: ${this.cooldowns.blink}, Current Ability: ${this.currentAbility}, Current Time: ${this.time.now}`
      );
      return;
    }

    this.currentAbility = "blink";
    console.log("currentAbility set to 'blink' in tryBlink");
    this.cooldowns.blink = this.time.now + 4000; // 4-second cooldown
    this.highlightSkill("blink");
    this.showCooldown("blink", 4000);
    console.log("Blink fired!");

    // Calculate new position after blinking
    const distance = 100;
    let dx = 0,
      dy = 0;
    switch (this.facing) {
      case "left":
        dx = -distance;
        break;
      case "right":
        dx = distance;
        break;
      case "up":
        dy = -distance;
        break;
      case "down":
        dy = distance;
        break;
    }

    // Clamp new position within player's bounds
    // Similar clamping logic as in update() to ensure player lands within bounds
    const newX = Phaser.Math.Clamp(
      this.myBox.x + dx,
      this.playerBounds.x + this.myBox.width / 2, // Min X (center)
      this.playerBounds.x + this.playerBounds.width - this.myBox.width / 2 // Max X (center)
    );
    const newY = Phaser.Math.Clamp(
      this.myBox.y + dy,
      this.playerBounds.y + this.myBox.height / 2, // Min Y (center)
      this.playerBounds.y + this.playerBounds.height - this.myBox.height / 2 // Max Y (center)
    );

    this.myBox.setPosition(newX, newY); // Update visual position
    if (this.myBox.body) {
      // Update physics body position
      this.myBox.body.x = newX - this.myBox.body.width / 2;
      this.myBox.body.y = newY - this.myBox.body.height / 2;
    }
    socket.emit("blinkFired", { playerId: socket.id, newX, newY }); // Notify server
    this.time.delayedCall(200, () => {
      this.currentAbility = null;
      console.log("currentAbility cleared (Blink ability ended).");
    });
  }

  /**
   * Attempts to use the Shift ability (temporary invulnerability/movement disable).
   */
  tryShift() {
    console.log("Attempting Shift...");
    // Prevent shift if currently "hooked" or game is over
    if (
      this.isGameOver ||
      this.currentAbility === "hooked" ||
      this.currentAbility ||
      this.cooldowns.shift > this.time.now
    ) {
      console.log(
        `Shift on cooldown or another ability active. Cooldown: ${this.cooldowns.shift}, Current Ability: ${this.currentAbility}, Current Time: ${this.time.now}`
      );
      return;
    }
    this.currentAbility = "shift";
    console.log("currentAbility set to 'shift' in tryShift");
    this.cooldowns.shift = this.time.now + 5000; // 5-second cooldown
    this.highlightSkill("shift");
    this.showCooldown("shift", 5000);
    console.log("Shift activated!");

    this.myBox.setAlpha(0.5); // Example: Change player alpha during shift
    socket.emit("shiftFired", { playerId: socket.id }); // Notify server

    // Set a timer for shift duration (2 seconds active time)
    this.shiftTimer = this.time.delayedCall(2000, () => {
      this.shiftActive = false; // Deactivate shift state
      this.myBox.setAlpha(1); // Revert alpha
      socket.emit("shiftEnd", { playerId: socket.id }); // Notify server
      this.currentAbility = null; // Clear ability status
      console.log("currentAbility cleared (Shift duration ended).");
    });
  }

  /**
   * Cancels the currently active action or ability (specifically for Shift and Hook).
   */
  cancelAction() {
    console.log("Cancelling action...");
    // If game is over, prevent any cancellation
    if (this.isGameOver) {
      console.log("Game is over, cannot cancel action.");
      return;
    }

    // If in "hooked" state, allow cancellation of the visual effect/state
    if (this.currentAbility === "hooked") {
      this.respawnCountdownText.setVisible(false);
      this.myBox.setVisible(true); // Ensure player is visible
      this.currentAbility = null;
      console.log("currentAbility cleared (Hooked state cancelled manually).");
    }

    if (this.currentAbility === "shift") {
      if (this.shiftTimer) {
        this.shiftTimer.remove(false); // Stop the delayed call for shift end
        this.shiftTimer = null;
      }
      this.shiftActive = false;
      this.myBox.setAlpha(1); // Revert alpha
      socket.emit("shiftEnd", { playerId: socket.id });
      this.currentAbility = null;
      console.log("currentAbility cleared (Shift cancelled manually).");
    }
    // Also cancel the hook visualization if active (e.g., if the user presses 'S' while hook is extending)
    if (this.currentAbility === "hook") {
      if (this.activeHookLine) {
        this.activeHookLine.destroy();
        this.activeHookLine = null;
      }
      if (this.hookTween) {
        this.hookTween.stop();
        this.hookTween = null;
      }
      this.currentAbility = null;
      console.log("currentAbility cleared (Hook cancelled manually).");
    }

    // Stop player movement
    if (this.myBox?.body) {
      this.myBox.body.setVelocity(0, 0);
      console.log("Player movement stopped.");
      socket.emit("playerMove", {
        id: socket.id,
        x: this.myBox.x,
        y: this.myBox.y,
      }); // Send final position to server
    }
    this.targetPosition = null; // Also clear mouse movement target
  }

  /**
   * UI: Highlights a skill icon based on its active state or cooldown status.
   * @param {string|null} activeSkill - The key of the currently active skill, or null if none.
   */
  highlightSkill(activeSkill) {
    for (const key in this.skillIcons) {
      this.skillIcons[key].setAlpha(
        key === activeSkill || this.cooldowns[key] <= this.time.now ? 1 : 0.3 // Full alpha if active/off cooldown, dimmed if on cooldown
      );
    }
  }

  /**
   * UI: Shows a cooldown overlay and updates the cooldown text for a skill icon.
   * @param {string} skillName - The key of the skill (e.g., 'hook', 'blink', 'shift').
   * @param {number} duration - The total cooldown duration in milliseconds.
   */
  showCooldown(skillName, duration) {
    console.log(`Showing cooldown for ${skillName} (${duration / 1000}s)`);
    const overlay = this.cooldownOverlays[skillName];
    const icon = this.skillIcons[skillName];

    overlay.setVisible(true);
    icon.setAlpha(1); // Ensure icon is fully visible when on cooldown

    // Hide cooldown overlay after duration
    this.time.delayedCall(duration, () => {
      overlay.setVisible(false);
      this.cooldowns[skillName] = 0; // Reset cooldown
      if (!this.currentAbility) {
        // Only re-highlight if no other ability is active
        this.highlightSkill(null);
      }
      console.log(`${skillName} cooldown ended.`);
    });
  }

  /**
   * Cleans up all dynamic game objects and resets state when leaving the scene.
   */
  cleanupGame() {
    console.log("Cleaning up GameScene...");
    // Destroy player sprites
    if (this.myBox) {
      this.myBox.destroy();
      this.myBox = null;
    }
    for (const id in this.otherPlayers) {
      if (this.otherPlayers[id]) {
        this.otherPlayers[id].destroy();
      }
    }
    this.otherPlayers = {};

    // Destroy score texts
    for (const id in this.scoreTexts) {
      if (this.scoreTexts[id]) {
        this.scoreTexts[id].destroy();
      }
    }
    this.scoreTexts = {};
    this.playerScores = {};

    // Destroy hook line and tween if active
    if (this.activeHookLine) {
      this.activeHookLine.destroy();
      this.activeHookLine = null;
    }
    if (this.hookTween) {
      this.hookTween.stop();
      this.hookTween = null;
    }

    // Stop any active timers (e.g., shift timer)
    if (this.shiftTimer) {
      this.shiftTimer.remove(false);
      this.shiftTimer = null;
    }

    // Hide and clear UI elements
    this.respawnCountdownText.setVisible(false).setText("");
    this.gameOverText.setVisible(false).setText("");

    // Re-enable input if it was disabled (e.g., by game over)
    this.input.keyboard.enabled = true;
    this.input.mouse.enabled = true;

    // Reset game state flags
    this.isGameOver = false;
    this.currentAbility = null;

    console.log("GameScene cleanup complete.");
  }
}
