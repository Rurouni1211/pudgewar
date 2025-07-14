// client/scenes/GameScene.js
import { socket } from "../game.js";

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: "GameScene" });
    // Initialize game object references to null
    this.myBox = null;
    this.enemyBox = null;
    this.opponentId = null;
    this.playerBounds = null; // Defined per player (top/bottom half)

    // Initialize ability/game state variables in constructor
    this.cooldowns = { hook: 0, blink: 0, shift: 0 };
    this.currentAbility = null; // Should be null initially
    this.facing = "up"; // Default facing direction
    this.shiftActive = false;
    this.originalColor = 0x00ff00; // Store original color for shift ability (green)
    this.shiftTimer = null; // Reference to the Phaser timed event for shift duration
  }

  preload() {
    console.log("GameScene: Preloading assets...");
    this.load.image("hookIcon", "assets/hook.png");
    this.load.image("blinkIcon", "assets/blink.png");
    this.load.image("shiftIcon", "assets/shift.png");
    console.log("GameScene: Assets preloaded.");
  }

  // `initialGameData` parameter receives data passed from scene.start()
  create(initialGameData) {
    console.log("GameScene: create method started.");

    // Critical: Clear ALL socket listeners here before re-registering
    // This prevents duplicate listeners if the scene is ever restarted
    socket.removeAllListeners();

    // Create player and enemy visual representations (rectangles)
    // IMPORTANT FIX: Set a high enough depth for player boxes so they are visible
    this.myBox = this.add.rectangle(0, 0, 32, 32, 0x00ff00).setDepth(5); // Player's green box
    this.enemyBox = this.add.rectangle(0, 0, 32, 32, 0xff0000).setDepth(5); // Opponent's red box

    // Setup keyboard input
    this.cursors = this.input.keyboard.createCursorKeys();
    this.WASD = this.input.keyboard.addKeys("W,A,S,D"); // Ensure these are correctly mapped
    this.input.keyboard.on("keydown-Q", this.tryHook, this);
    this.input.keyboard.on("keydown-R", this.tryBlink, this);
    this.input.keyboard.on("keydown-E", this.tryShift, this);
    this.input.keyboard.on("keydown-S", this.cancelAction, this); // 'S' for Cancel Action

    // Setup ability icons and their cooldown overlays/texts
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

    // Draw the dividing line in the middle of the game area
    // Set its depth lower than players but higher than background
    this.add
      .line(0, 300, 0, 0, 1024, 0, 0xffffff)
      .setOrigin(0, 0)
      .setLineWidth(2)
      .setAlpha(0.2)
      .setDepth(1);

    // Handle initial game data passed from the LobbyScene
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
      // In a production scenario, you might want to redirect to a lobby or an error screen here.
    }

    // Register persistent socket listeners for ongoing game events
    socket.on("playerMove", ({ id, x, y }) => {
      if (id !== socket.id) this.enemyBox.setPosition(x, y);
    });

    socket.on("hookHit", ({ by, target, pullTo }) => {
      console.log(
        `🎣 HookHit received: by ${by}, target ${target}, pullTo (${pullTo.x}, ${pullTo.y})`
      );
      if (by === socket.id) {
        this.tweens.add({
          targets: this.enemyBox,
          x: pullTo.x,
          y: pullTo.y - 40,
          duration: 300,
        });
      } else if (target === socket.id) {
        this.tweens.add({
          targets: this.myBox,
          x: pullTo.x,
          y: pullTo.y + 40,
          duration: 300,
        });
      }
    });

    socket.on("respawn", ({ x, y, target }) => {
      console.log(`♻️ Respawn received for ${target}: (${x}, ${y})`);
      if (socket.id === target) {
        this.myBox.setPosition(x, y);
        // Ensure physics body position is updated to match visual position
        if (this.myBox.body) {
          this.myBox.body.x = x - this.myBox.body.width / 2;
          this.myBox.body.y = y - this.myBox.body.height / 2;
        }
      }
    });

    socket.on("blinkEffect", ({ playerId, newX, newY }) => {
      console.log(
        `✨ BlinkEffect received for ${playerId}: (${newX}, ${newY})`
      );
      if (playerId !== socket.id) this.enemyBox.setPosition(newX, newY);
    });

    socket.on("shiftEffect", ({ playerId }) => {
      console.log(`👻 ShiftEffect received for ${playerId}`);
      if (playerId !== socket.id) this.enemyBox.fillColor = 0x999999;
    });

    socket.on("shiftEndEffect", ({ playerId }) => {
      console.log(`✅ ShiftEndEffect received for ${playerId}`);
      if (playerId !== socket.id) this.enemyBox.fillColor = 0xff0000;
    });

    // Handle opponent disconnection
    socket.on("opponentDisconnected", (message) => {
      console.warn(`💔 Opponent disconnected: ${message}`);
      alert(message); // Simple alert, could be a more sophisticated UI notification
      this.scene.start("LobbyScene"); // Return to lobby if opponent leaves
    });

    this.highlightSkill(null); // Initialize skill icon states
    console.log("GameScene: create method finished.");
  }

  /**
   * Initializes game elements with initial player data received from the server.
   * This method is called once by the create() method when the scene starts.
   * @param {Array<string>} players - Array of player IDs.
   * @param {object} positions - Object mapping player IDs to their initial {x, y} positions.
   */
  setupGame(players, positions) {
    if (
      !positions ||
      !positions[socket.id] ||
      !players ||
      players.length !== 2
    ) {
      console.warn("⚠️ Invalid game data for setupGame:", positions, players);
      return;
    }

    this.opponentId = players.find((id) => id !== socket.id);
    console.log(
      `GameScene Setup: My ID: ${socket.id}, Opponent ID: ${this.opponentId}`
    );

    const mySpawn = positions[socket.id];
    const enemySpawn = positions[this.opponentId];

    console.log(
      `GameScene Setup: Setting myBox position to (${mySpawn.x}, ${mySpawn.y})`
    );
    this.myBox.setPosition(mySpawn.x, mySpawn.y);

    console.log(
      `GameScene Setup: Setting enemyBox position to (${enemySpawn.x}, ${enemySpawn.y})`
    );
    this.enemyBox.setPosition(enemySpawn.x, enemySpawn.y);

    // Add physics body AFTER setting initial position. This is critical for movement.
    this.physics.add.existing(this.myBox);
    this.myBox.body.setCollideWorldBounds(true);
    this.myBox.body.setImmovable(false); // allow movement
    this.myBox.body.setAllowGravity(false); // disable gravity
    this.myBox.body.setSize(32, 32); // define body size manually
    this.myBox.body.setBounce(0); // prevent bounciness
    console.log("💡 myBox.body type:", this.myBox.body.constructor.name);

    // Set player-specific movement bounds (top or bottom half)
    if (mySpawn.y < 300) {
      // If my spawn Y is in the upper half (game height is 600, so half is 300)
      this.playerBounds = new Phaser.Geom.Rectangle(0, 0, 1024, 300); // My bounds are the top half
      console.log(
        `GameScene Setup: Player ${
          socket.id
        } is in the top half. Bounds: ${JSON.stringify(this.playerBounds)}`
      );
    } else {
      // If my spawn Y is in the lower half
      this.playerBounds = new Phaser.Geom.Rectangle(0, 300, 1024, 300); // My bounds are the bottom half
      console.log(
        `GameScene Setup: Player ${
          socket.id
        } is in the bottom half. Bounds: ${JSON.stringify(this.playerBounds)}`
      );
    }
    console.log("GameScene Setup: Initial game setup complete.");
  }

  /**
   * Phaser's update loop, runs every frame. Handles player movement and cooldowns.
   */
  update() {
    // Only allow movement if myBox and its physics body exist,
    // playerBounds are defined, and 'hook' ability isn't active
    if (
      !this.myBox?.body ||
      !this.playerBounds ||
      this.currentAbility === "hook"
    ) {
      return; // Prevent movement if prerequisites not met or during hook
    }

    const speed = 200; // Player movement speed
    let velocityX = 0;
    let velocityY = 0;

    // Handle horizontal movement input
    if (this.cursors.left.isDown || this.WASD.A.isDown) {
      velocityX = -speed;
      this.facing = "left";
    } else if (this.cursors.right.isDown || this.WASD.D.isDown) {
      velocityX = speed;
      this.facing = "right";
    }

    // Handle vertical movement input
    if (this.cursors.up.isDown || this.WASD.W.isDown) {
      velocityY = -speed;
      this.facing = "up";
    } else if (this.cursors.down.isDown || this.WASD.S.isDown) {
      velocityY = speed;
      this.facing = "down";
    }

    // Apply velocity if not in shift mode
    if (!this.shiftActive) {
      this.myBox.body.setVelocity(velocityX, velocityY);

      // After setting velocity, Phaser's physics engine will move the body.
      // We then clamp the *body's* position directly to enforce boundaries.
      // Remember myBox.body.x/y are top-left, while myBox.x/y are center.
      this.myBox.body.x = Phaser.Math.Clamp(
        this.myBox.body.x,
        this.playerBounds.x, // Left edge of bounds
        this.playerBounds.right - this.myBox.body.width // Right edge of bounds minus body width
      );
      this.myBox.body.y = Phaser.Math.Clamp(
        this.myBox.body.y,
        this.playerBounds.y, // Top edge of bounds
        this.playerBounds.bottom - this.myBox.body.height // Bottom edge of bounds minus body height
      );

      // Now, sync the visual rectangle's center to the physics body's center
      this.myBox.x = this.myBox.body.x + this.myBox.body.width / 2;
      this.myBox.y = this.myBox.body.y + this.myBox.body.height / 2;

      // Emit player movement to the server only if the player actually moved
      // (This condition should still be based on original velocity, not clamped result)
      if (velocityX !== 0 || velocityY !== 0) {
        socket.emit("playerMove", {
          id: socket.id,
          x: this.myBox.x, // Emit the updated, clamped visual position
          y: this.myBox.y,
        });
      }
    } else {
      this.myBox.body.setVelocity(0, 0);
    }

    // Update cooldown texts for abilities
    for (const key in this.cooldowns) {
      const remaining = this.cooldowns[key] - this.time.now;
      this.cooldownTexts[key].setText(
        remaining >= 0 ? Math.ceil(remaining / 1000).toString() : "" // Display seconds remaining
      );
    }
  }

  /**
   * Attempts to fire the Hook ability.
   */
  tryHook() {
    console.log("Attempting Hook...");
    if (this.currentAbility || this.cooldowns.hook > this.time.now) {
      console.log(
        `Hook on cooldown or another ability active. Cooldown: ${this.cooldowns.hook}, Current Time: ${this.time.now}`
      );
      return;
    }
    this.currentAbility = "hook"; // Set current ability
    console.log("currentAbility set to 'hook' in tryHook"); // DEBUG
    this.cooldowns.hook = this.time.now + 4000; // 4-second cooldown
    this.highlightSkill("hook");
    this.showCooldown("hook", 4000);
    console.log("Hook fired!");

    socket.emit("hookFired", { playerId: socket.id, direction: this.facing });

    // Visual representation of the hook
    const hookLength = 150;
    let dx = 0,
      dy = 0;
    switch (this.facing) {
      case "left":
        dx = -hookLength;
        break;
      case "right":
        dx = hookLength;
        break;
      case "up":
        dy = -hookLength;
        break;
      case "down":
        dy = hookLength;
        break;
    }

    const startX = this.myBox.x;
    const startY = this.myBox.y;
    const endX = startX + dx;
    const endY = startY + dy;

    const hookLine = this.add.graphics();
    hookLine.lineStyle(2, 0xffffff, 1); // White line
    hookLine.beginPath().moveTo(startX, startY).lineTo(endX, endY).strokePath();
    hookLine.setDepth(6); // Ensure hook line is visible, above players
    this.time.delayedCall(500, () => hookLine.destroy()); // Destroy line after 0.5s
    this.time.delayedCall(1000, () => {
      this.currentAbility = null; // Clear ability status
      console.log("currentAbility cleared (Hook ability ended)."); // DEBUG
    });
  }

  /**
   * Attempts to use the Blink ability.
   */
  tryBlink() {
    console.log("Attempting Blink...");
    if (!this.myBox || !this.playerBounds) {
      // Ensure game objects are ready
      console.warn("Cannot blink: myBox or playerBounds not initialized.");
      return;
    }
    if (this.currentAbility || this.cooldowns.blink > this.time.now) {
      console.log(
        `Blink on cooldown or another ability active. Cooldown: ${this.cooldowns.blink}, Current Time: ${this.time.now}`
      );
      return;
    }

    this.currentAbility = "blink";
    console.log("currentAbility set to 'blink' in tryBlink"); // DEBUG
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
    const newX = Phaser.Math.Clamp(
      this.myBox.x + dx,
      this.playerBounds.x + this.myBox.width / 2,
      this.playerBounds.right - this.myBox.width / 2
    );
    const newY = Phaser.Math.Clamp(
      this.myBox.y + dy,
      this.playerBounds.y + this.myBox.height / 2,
      this.playerBounds.bottom - this.myBox.height / 2
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
      console.log("currentAbility cleared (Blink ability ended)."); // DEBUG
    });
  }

  /**
   * Attempts to use the Shift ability (temporary invulnerability/movement disable).
   */
  tryShift() {
    console.log("Attempting Shift...");
    if (this.currentAbility || this.cooldowns.shift > this.time.now) {
      console.log(
        `Shift on cooldown or another ability active. Cooldown: ${this.cooldowns.shift}, Current Time: ${this.time.now}`
      );
      return;
    }
    this.currentAbility = "shift";
    console.log("currentAbility set to 'shift' in tryShift"); // DEBUG
    this.cooldowns.shift = this.time.now + 5000; // 5-second cooldown
    this.shiftActive = true; // Activate shift state
    this.highlightSkill("shift");
    this.showCooldown("shift", 5000);
    console.log("Shift activated!");

    this.myBox.fillColor = 0x999999; // Change player color during shift
    socket.emit("shiftFired", { playerId: socket.id }); // Notify server

    // Set a timer for shift duration (2 seconds active time)
    this.shiftTimer = this.time.delayedCall(2000, () => {
      this.shiftActive = false; // Deactivate shift state
      this.myBox.fillColor = this.originalColor; // Revert color
      socket.emit("shiftEnd", { playerId: socket.id }); // Notify server
      this.currentAbility = null; // Clear ability status
      console.log("currentAbility cleared (Shift duration ended)."); // DEBUG
    });
  }

  /**
   * Cancels the currently active ability (specifically for Shift).
   */
  cancelAction() {
    console.log("Cancelling action...");
    if (this.currentAbility === "shift") {
      if (this.shiftTimer) {
        this.shiftTimer.remove(false); // Stop the delayed call for shift end
        this.shiftTimer = null;
      }
      this.shiftActive = false;
      this.myBox.fillColor = this.originalColor;
      socket.emit("shiftEnd", { playerId: socket.id });
      this.currentAbility = null;
      console.log("currentAbility cleared (Shift cancelled manually)."); // DEBUG
    }

    // Stop player movement
    if (this.myBox?.body) {
      this.myBox.body.setVelocity(0, 0);
      console.log("Player movement stopped.");
    }
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
}
