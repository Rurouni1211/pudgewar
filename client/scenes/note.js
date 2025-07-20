// // client/scenes/LobbyScene.js

// import { socket } from "../game.js";

// export class LobbyScene extends Phaser.Scene {
//   constructor() {
//     super({ key: "LobbyScene" });
//     this.playersInRoom = [];
//     this.playerTextObjects = [];
//   }

//   create() {
//     socket.removeAllListeners();

//     this.add
//       .text(this.cameras.main.width / 2, 100, "Waiting for Opponent...", {
//         fontSize: "32px",
//         fill: "#fff",
//       })
//       .setOrigin(0.5);

//     this.roomCodeText = this.add
//       .text(this.cameras.main.width / 2, 150, "Room: Creating...", {
//         fontSize: "20px",
//         fill: "#aaa",
//       })
//       .setOrigin(0.5);
//     // this.playerListText = this.add
//     //   .text(this.cameras.main.width / 2, 250, "Players:\n", {
//     //     fontSize: "20px",
//     //     fill: "#fff",
//     //     align: "center",
//     //   })
//     //   .setOrigin(0.5);

//     this.errorText = this.add
//       .text(this.cameras.main.width / 2, 200, "", {
//         fontSize: "24px",
//         fill: "#ff0000",
//       })
//       .setOrigin(0.5);

//     // Table title
//     this.add
//       .text(this.cameras.main.width / 2, 250, "Players Joined:", {
//         fontSize: "20px",
//         fill: "#ffffff",
//       })
//       .setOrigin(0.5);

//     // Listen for updates to player list
//     socket.on("updatePlayerList", (playerList) => {
//       this.updatePlayerTable(playerList);
//     });

//     socket.on("roomCreated", (roomCode) => {
//       this.roomCodeText.setText(Room: ${roomCode} (Waiting for Player 2));
//       this.errorText.setText("");
//       console.log(
//         LobbyScene: Room ${roomCode} created. Waiting for opponent.
//       );
//     });
//     socket.on("updatePlayerList", (players) => {
//       const names = players
//         .map((p, i) => Player ${i + 1}: ${p.name})
//         .join("\n");
//       this.playerListText.setText("Players:\n" + names);
//     });

//     socket.on("roomError", (message) => {
//       console.error("LobbyScene: Room Error:", message);
//       this.errorText.setText(Error: ${message});
//       this.roomCodeText.setText("Room: Error");
//     });

//     socket.once("startGame", (data) => {
//       console.log("LobbyScene: Received startGame. Starting game...");
//       socket.removeAllListeners();
//       this.scene.start("GameScene", data);
//       this.scene.stop("LobbyScene");
//     });

//     this.roomAttempted = false;
//     const attemptRoomLogic = () => {
//       if (this.roomAttempted) return;
//       this.roomAttempted = true;

//       const testRoomCode = "demo";
//       const playerName = prompt("Enter your name:") || "Anonymous";

//       console.log(
//         LobbyScene: Attempting to join room '${testRoomCode}' as ${playerName}
//       );

//       socket.emit("createRoom", {
//         roomCode: testRoomCode,
//         name: playerName, // pass name here too
//       });

//       socket.emit("joinRoom", {
//         roomCode: testRoomCode,
//         name: playerName,
//       });
//     };

//     if (socket.connected) {
//       attemptRoomLogic();
//     } else {
//       socket.on("connect", () => {
//         console.log("LobbyScene: Socket connected!");
//         attemptRoomLogic();
//       });
//     }

//     console.log("LobbyScene: created. Waiting for startGame event...");
//   }

//   updatePlayerTable(playerList) {
//     this.playerTextObjects.forEach((text) => text.destroy());
//     this.playerTextObjects = [];

//     this.playersInRoom = playerList;

//     playerList.forEach((player, index) => {
//       const playerText = this.add
//         .text(
//           this.cameras.main.width / 2,
//           280 + index * 30,
//           Player ${index + 1}: ${player.name || player.id},
//           {
//             fontSize: "18px",
//             fill: "#ffffff",
//           }
//         )
//         .setOrigin(0.5);
//       this.playerTextObjects.push(playerText);
//     });
//   }
// }
// // client/scenes/GameScene.js

// import { socket } from "../game.js";

// export class GameScene extends Phaser.Scene {
//   constructor() {
//     super({ key: "GameScene" });
//     this.myBox = null;
//     this.enemyBox = null;
//     this.opponentId = null;
//     this.playerBounds = null;
//     this.isTopPlayer = false; // Flag to determine which half the player belongs to

//     this.cooldowns = { hook: 0, blink: 0, shift: 0 };
//     this.currentAbility = null;
//     this.facing = "up"; // Default facing direction
//     this.shiftActive = false;
//     this.originalColor = 0x00ff00;
//     this.shiftTimer = null;

//     this.activeHookLine = null;
//     this.hookTween = null;
//     this.respawnCountdownText = null; // New: For displaying countdown

//     this.myScore = 0;
//     this.opponentScore = 0;
//     this.myScoreText = null;
//     this.opponentScoreText = null;
//   }

//   preload() {
//     console.log("GameScene: Preloading assets...");
//     this.load.image("hookIcon", "assets/hook.png");
//     this.load.image("blinkIcon", "assets/blink.png");
//     this.load.image("shiftIcon", "assets/shift.png");
//     this.load.image("bg", "assets/background.png");
//     this.load.spritesheet("butcher", "assets/butchers.png", {
//       frameWidth: 24,
//       frameHeight: 32,
//     });

//     console.log("GameScene: Assets preloaded.");
//   }

//   create(initialGameData) {
//     console.log("GameScene: create method started.");
//     this.add
//       .image(0, 0, "bg")
//       .setOrigin(0, 0)
//       .setDisplaySize(this.game.config.width, this.game.config.height)
//       .setDepth(-100);

//     socket.removeAllListeners();
//     this.anims.create({
//       key: "butcher_idle",
//       frames: [{ key: "butcher", frame: 0 }],
//       frameRate: 1,
//       repeat: -1,
//     });

//     this.anims.create({
//       key: "butcher_walk_down",
//       frames: this.anims.generateFrameNumbers("butcher", { start: 0, end: 3 }),
//       frameRate: 6,
//       repeat: -1,
//     });

//     this.anims.create({
//       key: "butcher_walk_left",
//       frames: this.anims.generateFrameNumbers("butcher", { start: 4, end: 7 }),
//       frameRate: 6,
//       repeat: -1,
//     });

//     this.anims.create({
//       key: "butcher_walk_right",
//       frames: this.anims.generateFrameNumbers("butcher", { start: 4, end: 7 }), // reuse left frames or mirror via flipX
//       frameRate: 6,
//       repeat: -1,
//     });

//     this.anims.create({
//       key: "butcher_walk_up",
//       frames: this.anims.generateFrameNumbers("butcher", { start: 8, end: 11 }),
//       frameRate: 6,
//       repeat: -1,
//     });
//     this.myBox = this.add.sprite(0, 0, "butcher").setDepth(5);

//     this.myBox.setScale(2, 2); // width × height scale

//     this.myBox.play("butcher_idle"); // Start with idle animation

//     this.enemyBox = this.add.sprite(0, 0, "butcher").setDepth(5);

//     this.enemyBox.setScale(2, 2);

//     this.enemyBox.play("butcher_idle");

//     // Add physics body AFTER setting initial position. This is critical for movement.
//     this.physics.add.existing(this.myBox);
//     this.myBox.body.setCollideWorldBounds(true);
//     this.myBox.body.setImmovable(false);
//     this.myBox.body.setAllowGravity(false);
//     this.myBox.body.setSize(32, 32);
//     this.myBox.body.setBounce(0);
//     console.log("💡 myBox.body type:", this.myBox.body.constructor.name);

//     // Setup keyboard input
//     this.cursors = this.input.keyboard.createCursorKeys();
//     this.WASD = this.input.keyboard.addKeys("W,A,S,D");
//     this.input.keyboard.on("keydown-Q", this.tryHook, this);
//     this.input.keyboard.on("keydown-R", this.tryBlink, this);
//     this.input.keyboard.on("keydown-E", this.tryShift, this);
//     this.input.keyboard.on("keydown-S", this.cancelAction, this); // 'S' for Cancel Action

//     // --- NEW MOUSE MOVEMENT LOGIC (Click-to-Move) ---
//     this.input.on("pointerdown", (pointer) => {
//       // Only respond to left-click for movement and if no ability is active
//       if (!this.currentAbility && pointer.leftButtonDown()) {
//         this.targetPosition = new Phaser.Math.Vector2(pointer.x, pointer.y);
//         // Immediately stop keyboard movement if a new mouse target is set
//         this.myBox.body.setVelocity(0, 0);
//         // Emit position to server immediately to register the start of a move
//         socket.emit("playerMove", {
//           id: socket.id,
//           x: this.myBox.x,
//           y: this.myBox.y,
//         });
//       }
//     });

//     // Setup ability icons and their cooldown overlays/texts (unchanged)
//     this.skillIcons = {
//       hook: this.add.image(50, 550, "hookIcon").setScale(0.5).setDepth(10),
//       blink: this.add.image(120, 550, "blinkIcon").setScale(0.5).setDepth(10),
//       shift: this.add.image(190, 550, "shiftIcon").setScale(0.5).setDepth(10),
//     };

//     this.cooldownOverlays = {
//       hook: this.add
//         .rectangle(50, 550, 64, 64, 0x000000, 0.6)
//         .setDepth(11)
//         .setVisible(false),
//       blink: this.add
//         .rectangle(120, 550, 64, 64, 0x000000, 0.6)
//         .setDepth(11)
//         .setVisible(false),
//       shift: this.add
//         .rectangle(190, 550, 64, 64, 0x000000, 0.6)
//         .setDepth(11)
//         .setVisible(false),
//     };
//     this.cooldownTexts = {
//       hook: this.add
//         .text(50, 550, "", {
//           font: "20px Arial",
//           fontStyle: "bold",
//           fill: "#ffffff",
//           stroke: "#000000",
//           strokeThickness: 3,
//         })
//         .setOrigin(0.5)
//         .setDepth(12),
//       blink: this.add
//         .text(120, 550, "", {
//           font: "20px Arial",
//           fontStyle: "bold",
//           fill: "#ffffff",
//           stroke: "#000000",
//           strokeThickness: 3,
//         })
//         .setOrigin(0.5)
//         .setDepth(12),
//       shift: this.add
//         .text(190, 550, "", {
//           font: "20px Arial",
//           fontStyle: "bold",
//           fill: "#ffffff",
//           stroke: "#000000",
//           strokeThickness: 3,
//         })
//         .setOrigin(0.5)
//         .setDepth(12),
//     };
//     this.myScoreText = this.add
//       .text(16, 16, "My Score: 0", {
//         font: "24px Arial",
//         fill: "#ffffff",
//         stroke: "#000000",
//         strokeThickness: 4,
//       })
//       .setDepth(100);
//     // Respawn countdown text setup
//     this.respawnCountdownText = this.add
//       .text(this.game.config.width / 2, this.game.config.height / 2, "", {
//         font: "48px Arial",
//         fontStyle: "bold",
//         fill: "#fff",
//         stroke: "#000",
//         strokeThickness: 6,
//       })
//       .setOrigin(0.5)
//       .setDepth(20)
//       .setVisible(false);

//     // This line draws a white line at y=300 for visual debugging or reference.
//     // It's not involved in collision/bounds.
//     this.add
//       .line(0, 300, 0, 0, 1024, 0, 0xffffff)
//       .setOrigin(0, 0)
//       .setLineWidth(2)
//       .setAlpha(0.2)
//       .setDepth(1);

//     if (
//       initialGameData &&
//       initialGameData.players &&
//       initialGameData.positions
//     ) {
//       console.log(
//         "GameScene: Applying initial game data from scene transition."
//       );
//       this.setupGame(initialGameData.players, initialGameData.positions);
//     } else {
//       console.warn(
//         "GameScene: No initial game data received. This scene might have been started incorrectly without a proper lobby."
//       );
//     }

//     // --- Socket Listeners ---
//     socket.on("playerMove", ({ id, x, y }) => {
//       if (id !== socket.id) {
//         const oldX = this.enemyBox.x;
//         const oldY = this.enemyBox.y;

//         // Always update the opponent's position for accuracy
//         this.enemyBox.setPosition(x, y);

//         const dx = x - oldX;
//         const dy = y - oldY;
//         const distanceTraveled = Phaser.Math.Distance.Between(x, y, oldX, oldY);

//         // Define a threshold for "significant" movement
//         // Only play walking animation if the opponent moved beyond this threshold
//         const movementThreshold = 5; // Increased from 2 to 5 (you can experiment with this)

//         if (distanceTraveled > movementThreshold) {
//           // Animate movement if a significant distance was covered
//           if (Math.abs(dx) > Math.abs(dy)) {
//             // Determine facing direction and apply flip for horizontal movement
//             this.enemyBox.setFlipX(dx < 0); // Flip for right movement (if walk_left is base)
//             this.enemyBox.play("butcher_walk_left", true); // Reuse left frames for horizontal
//           } else {
//             // Vertical movement
//             this.enemyBox.setFlipX(false); // Reset flip for vertical movement
//             this.enemyBox.play(
//               dy > 0 ? "butcher_walk_down" : "butcher_walk_up",
//               true
//             );
//           }
//         } else {
//           // If not moving significantly, ensure the idle animation is playing
//           if (this.enemyBox.anims.currentAnim?.key !== "butcher_idle") {
//             this.enemyBox.play("butcher_idle", true);
//           }
//         }
//       }
//     });

//     socket.on(
//       "hookStarted",
//       ({ playerId, startX, startY, hookAngle, hookLength, hookSpeed }) => {
//         console.log(
//           🎣 Hook started by ${playerId} from (${startX}, ${startY})
//         );
//         if (this.activeHookLine) this.activeHookLine.destroy();
//         if (this.hookTween) this.hookTween.stop();
//         this.activeHookLine = this.add.graphics().setDepth(6);
//         this.activeHookLine.lineStyle(2, 0xffffff, 1);
//         const hookVisualState = { currentLength: 0 };
//         this.hookTween = this.tweens.add({
//           targets: hookVisualState,
//           currentLength: hookLength,
//           duration: (hookLength / hookSpeed) * 1000,
//           ease: "Linear",
//           onUpdate: () => {
//             this.activeHookLine.clear();
//             this.activeHookLine.lineStyle(2, 0xffffff, 1);
//             const currentEndX =
//               startX + Math.cos(hookAngle) * hookVisualState.currentLength;
//             const currentEndY =
//               startY + Math.sin(hookAngle) * hookVisualState.currentLength;
//             this.activeHookLine
//               .beginPath()
//               .moveTo(startX, startY)
//               .lineTo(currentEndX, currentEndY)
//               .strokePath();
//           },
//           onComplete: () => {
//             console.log(Hook animation completed for ${playerId}.);
//             if (this.activeHookLine) {
//               this.activeHookLine.destroy();
//               this.activeHookLine = null;
//             }
//             this.hookTween = null;
//           },
//         });
//       }
//     );
//     socket.on("scoreUpdated", ({ playerId, score }) => {
//       // Check if the update is for my score or the opponent's score
//       if (playerId === socket.id) {
//         this.myScore = score;
//         this.myScoreText.setText(My Score: ${this.myScore});
//         console.log(My score updated to: ${this.myScore});
//       } else if (this.opponentId && playerId === this.opponentId) {
//         this.opponentScore = score;
//         this.opponentScoreText.setText(Opponent Score: ${this.opponentScore});
//         console.log(Opponent score updated to: ${this.opponentScore});
//       }
//     });
//     socket.on("hookHit", ({ by, target, pullTo }) => {
//       console.log(
//         🎣 HookHit received: by ${by}, target ${target}, pullTo (${pullTo.x}, ${pullTo.y})
//       );
//       if (this.activeHookLine) {
//         this.activeHookLine.destroy();
//         this.activeHookLine = null;
//       }
//       if (this.hookTween) {
//         this.hookTween.stop();
//         this.hookTween = null;
//       }
//       if (by === socket.id) {
//         this.tweens.add({
//           targets: this.enemyBox,
//           x: pullTo.x,
//           y: pullTo.y - 40, // Adjust pullTo Y if needed for visual effect
//           duration: 300,
//         });
//         this.currentAbility = null;
//         console.log("currentAbility cleared (Hook hit by me).");
//       } else if (target === socket.id) {
//         // If I am the target, apply temporary visual effect after pull
//         this.tweens.add({
//           targets: this.myBox,
//           x: pullTo.x,
//           y: pullTo.y + 40, // Adjust pullTo Y if needed for visual effect
//           duration: 300,
//           onComplete: () => {
//             // Client-side visual and state management for being hooked
//             this.myBox.setVisible(false); // Hide player immediately after pull
//             this.currentAbility = "hooked"; // Set a temporary state to prevent movement/abilities
//             console.log("Player hidden and in 'hooked' state.");
//             this.respawnCountdownText.setVisible(true).setText("2"); // Show countdown
//             this.time.delayedCall(1000, () =>
//               this.respawnCountdownText.setText("1")
//             );
//             this.time.delayedCall(2000, () =>
//               this.respawnCountdownText.setText("")
//             ); // Clear after delay
//           },
//         });
//       }
//     });

//     socket.on("hookMiss", () => {
//       console.log("❌ HookMiss received.");
//       if (this.activeHookLine) {
//         this.activeHookLine.destroy();
//         this.activeHookLine = null;
//       }
//       if (this.hookTween) {
//         this.hookTween.stop();
//         this.hookTween = null;
//       }
//       this.currentAbility = null;
//       console.log("currentAbility cleared (Hook missed).");
//     });

//     socket.on("startRespawnCountdown", () => {
//       // This event is now redundant as we show countdown after hookHit,
//       // but keeping it here for clarity if you want to use it for other events.
//       console.log(
//         "Received startRespawnCountdown from server (client-side already handles this)."
//       );
//     });

//     socket.on("respawn", ({ x, y, target }) => {
//       console.log(♻️ Respawn received for ${target}: (${x}, ${y}));
//       if (socket.id === target) {
//         this.myBox.setPosition(x, y);
//         if (this.myBox.body) {
//           this.myBox.body.x = x - this.myBox.body.width / 2;
//           this.myBox.body.y = y - this.myBox.body.height / 2;
//         }
//         this.myBox.setVisible(true); // Ensure player is visible after respawn
//         this.currentAbility = null; // Ensure ability state is cleared after respawn
//         this.respawnCountdownText.setVisible(false); // Hide countdown text
//         console.log("Player respawned and visible.");
//       }
//     });
//     socket.on("startRespawnCountdown", ({ target }) => {
//       if (target === socket.id) {
//         this.myBox.setVisible(false); // Hide if you're the one getting respawned
//       }

//       // Show countdown on screen regardless of whether it's you or the opponent
//       this.respawnCountdownText.setVisible(true).setText("2");

//       this.time.delayedCall(1000, () => {
//         this.respawnCountdownText.setText("1");
//       });

//       this.time.delayedCall(2000, () => {
//         this.respawnCountdownText.setVisible(false);
//       });
//     });

//     socket.on("blinkEffect", ({ playerId, newX, newY }) => {
//       console.log(
//         ✨ BlinkEffect received for ${playerId}: (${newX}, ${newY})
//       );
//       if (playerId !== socket.id) this.enemyBox.setPosition(newX, newY);
//     });
//     socket.on("shiftEffect", ({ playerId }) => {
//       console.log(👻 ShiftEffect received for ${playerId});
//       if (playerId !== socket.id) this.enemyBox.fillColor = 0x999999;
//     });
//     socket.on("shiftEndEffect", ({ playerId }) => {
//       console.log(✅ ShiftEndEffect received for ${playerId});
//       if (playerId !== socket.id) this.enemyBox.fillColor = 0xff0000;
//     });
//     socket.on("opponentDisconnected", (message) => {
//       console.warn(💔 Opponent disconnected: ${message});
//       alert(message);
//       this.scene.start("LobbyScene");
//     });

//     this.highlightSkill(null);
//     console.log("GameScene: create method finished.");
//   }

//   setupGame(players, positions) {
//     if (
//       !positions ||
//       !positions[socket.id] ||
//       !players ||
//       players.length !== 2
//     ) {
//       console.warn("⚠️ Invalid game data for setupGame:", positions, players);
//       return;
//     }

//     this.opponentId = players.find((id) => id !== socket.id);
//     console.log(
//       GameScene Setup: My ID: ${socket.id}, Opponent ID: ${this.opponentId}
//     );

//     const mySpawn = positions[socket.id];
//     const enemySpawn = positions[this.opponentId];

//     console.log(
//       GameScene Setup: Setting myBox position to (${mySpawn.x}, ${mySpawn.y})
//     );
//     this.myBox.setPosition(mySpawn.x, mySpawn.y);

//     console.log(
//       GameScene Setup: Setting enemyBox position to (${enemySpawn.x}, ${enemySpawn.y})
//     );
//     this.enemyBox.setPosition(enemySpawn.x, enemySpawn.y);

//     // --- CRITICAL CONSTANTS: ADJUST THESE BASED ON YOUR BACKGROUND IMAGE ---
//     // These values define the *visual* top and bottom edges of the impassable river.
//     const riverVisualTop = 240; // The Y-coordinate where the river visually begins (top player's boundary)
//     const riverVisualBottom = 380; // The Y-coordinate where the river visually ends (bottom player's boundary)
//     // --- END CRITICAL CONSTANTS ---

//     const gameHeight = this.game.config.height; // Should be 600
//     const gameWidth = this.game.config.width; // Should be 1024
//     const playerSize = this.myBox.body.width; // 32

//     // Determine if this client is the top player based on spawn position
//     // Assuming players spawn on either side of the actual mid-point (GAME_HEIGHT / 2)
//     this.isTopPlayer = mySpawn.y < gameHeight / 2;

//     if (this.isTopPlayer) {
//       // Bounds for the top player: from (0,0) to (gameWidth, riverVisualTop)
//       // The height of the rectangle represents the maximum Y-coordinate for the *bottom edge* of the player.
//       // So, the top-left corner of the player can go from 0 up to (riverVisualTop - playerSize).
//       this.playerBounds = new Phaser.Geom.Rectangle(
//         0,
//         0,
//         gameWidth,
//         riverVisualTop
//       );
//       console.log(
//         GameScene Setup: Player ${
//           socket.id
//         } is the TOP player. Bounds: ${JSON.stringify(this.playerBounds)}
//       );
//     } else {
//       // Bounds for the bottom player: from (0, riverVisualBottom) to (gameWidth, gameHeight)
//       this.playerBounds = new Phaser.Geom.Rectangle(
//         0,
//         riverVisualBottom, // Top Y for the bottom player's bounds
//         gameWidth,
//         gameHeight - riverVisualBottom // Height of the playable area for the bottom player
//       );
//       console.log(
//         GameScene Setup: Player ${
//           socket.id
//         } is the BOTTOM player. Bounds: ${JSON.stringify(this.playerBounds)}
//       );
//     }
//     console.log("GameScene Setup: Initial game setup complete.");
//   }

//   /**
//    * Phaser's update loop, runs every frame. Handles player movement and cooldowns.
//    */
//   update() {
//     // Only allow movement if myBox/playerBounds are ready, and player is not hooked
//     if (
//       !this.myBox?.body ||
//       !this.playerBounds ||
//       this.currentAbility === "hooked" // Prevent movement if "hooked"
//     ) {
//       // If we're hooked, we should stop any ongoing movement.
//       if (this.myBox?.body && this.myBox.body.speed > 0) {
//         this.myBox.body.setVelocity(0, 0);
//         socket.emit("playerMove", {
//           id: socket.id,
//           x: this.myBox.x,
//           y: this.myBox.y,
//         });
//       }
//       return;
//     }

//     const speed = 200;
//     let velocityX = 0;
//     let velocityY = 0;
//     let playerMovedThisFrame = false; // Flag to track if player's velocity was set this frame

//     // --- Mouse Movement (Click-to-Move) ---
//     // If a target position is set AND player is not in shift mode AND no ability is active
//     if (this.targetPosition && !this.shiftActive && !this.currentAbility) {
//       const distance = Phaser.Math.Distance.BetweenPoints(
//         this.myBox,
//         this.targetPosition
//       );

//       // Define a small threshold to consider the player "at" the target
//       const arrivalThreshold = 5;

//       if (distance > arrivalThreshold) {
//         // Player is not at the target, calculate velocity towards it
//         const angle = Phaser.Math.Angle.Between(
//           this.myBox.x,
//           this.myBox.y,
//           this.targetPosition.x,
//           this.targetPosition.y
//         );
//         velocityX = Math.cos(angle) * speed;
//         velocityY = Math.sin(angle) * speed;
//         playerMovedThisFrame = true;

//         // Update facing direction based on movement direction
//         if (Math.abs(velocityX) > Math.abs(velocityY)) {
//           this.facing = velocityX > 0 ? "right" : "left";
//         } else {
//           this.facing = velocityY > 0 ? "down" : "up";
//         }
//       } else {
//         // Player has reached the target, stop movement and clear target
//         this.targetPosition = null;
//         velocityX = 0;
//         velocityY = 0;
//         playerMovedThisFrame = true; // Still counts as a "movement" to stop
//       }
//     }
//     if (velocityX === 0 && velocityY === 0) {
//       this.myBox.play("butcher_idle", true);
//     } else if (Math.abs(velocityX) > Math.abs(velocityY)) {
//       // Horizontal movement
//       this.myBox.setFlipX(velocityX > 0); // ✅ flip when moving right
//       this.myBox.play("butcher_walk_left", true); // use only walk_left animation
//     } else {
//       // Vertical movement
//       this.myBox.setFlipX(false); // reset flip
//       this.myBox.play(
//         velocityY > 0 ? "butcher_walk_down" : "butcher_walk_up",
//         true
//       );
//     }

//     // Apply velocity if not in shift mode
//     if (!this.shiftActive) {
//       this.myBox.body.setVelocity(velocityX, velocityY);

//       // Clamp the physics body's position to enforce boundaries
//       // myBox.body.x/y is the TOP-LEFT corner of the body.
//       // playerBounds.x/y is the TOP-LEFT corner of the bounds rectangle.
//       // playerBounds.width/height is the width/height of the bounds rectangle.

//       this.myBox.body.x = Phaser.Math.Clamp(
//         this.myBox.body.x,
//         this.playerBounds.x, // Minimum X (left edge of bounds)
//         this.playerBounds.x + this.playerBounds.width - this.myBox.body.width // Maximum X (right edge of bounds - player width)
//       );
//       this.myBox.body.y = Phaser.Math.Clamp(
//         this.myBox.body.y,
//         this.playerBounds.y, // Minimum Y (top edge of bounds)
//         this.playerBounds.y + this.playerBounds.height - this.myBox.body.height // Maximum Y (bottom edge of bounds - player height)
//       );

//       // Sync the visual rectangle's center to the physics body's center
//       this.myBox.x = this.myBox.body.x + this.myBox.body.width / 2;
//       this.myBox.y = this.myBox.body.y + this.myBox.body.height / 2;

//       // Emit player movement to the server if they moved or stopped moving
//       if (
//         playerMovedThisFrame ||
//         (this.myBox.body.speed > 0 && velocityX === 0 && velocityY === 0)
//       ) {
//         socket.emit("playerMove", {
//           id: socket.id,
//           x: this.myBox.x,
//           y: this.myBox.y,
//         });
//       }
//     } else {
//       this.myBox.body.setVelocity(0, 0); // Player cannot move during shift
//     }

//     // Update cooldown texts for abilities (unchanged)
//     for (const key in this.cooldowns) {
//       const remaining = this.cooldowns[key] - this.time.now;
//       this.cooldownTexts[key].setText(
//         remaining >= 0 ? Math.ceil(remaining / 1000).toString() : ""
//       );
//     }
//   }

//   /**
//    * Attempts to fire the Hook ability.
//    */
//   tryHook() {
//     console.log("Attempting Hook...");
//     // Prevent hook if currently "hooked"
//     if (
//       this.currentAbility === "hooked" ||
//       this.currentAbility ||
//       this.cooldowns.hook > this.time.now
//     ) {
//       console.log(
//         Hook on cooldown or another ability active. Cooldown: ${this.cooldowns.hook}, Current Ability: ${this.currentAbility}, Current Time: ${this.time.now}
//       );
//       return;
//     }

//     this.currentAbility = "hook";
//     console.log("currentAbility set to 'hook' in tryHook");
//     this.cooldowns.hook = this.time.now + 4000;
//     this.highlightSkill("hook");
//     this.showCooldown("hook", 4000);

//     // Get the current mouse pointer's world coordinates
//     const worldPointer = this.input.activePointer.positionToCamera(
//       this.cameras.main
//     );
//     const targetX = worldPointer.x;
//     const targetY = worldPointer.y;

//     console.log("Hook fired (event sent to server)! Coords:", {
//       from: { x: this.myBox.x, y: this.myBox.y },
//       to: { targetX, targetY },
//     });

//     // Send the player's current position and the target coordinates to the server.
//     // The server will then calculate the angle and handle the hook logic.
//     socket.emit("hookFired", {
//       playerId: socket.id,
//       startX: this.myBox.x,
//       startY: this.myBox.y,
//       targetX,
//       targetY,
//     });
//   }

//   /**
//    * Attempts to use the Blink ability.
//    */
//   tryBlink() {
//     console.log("Attempting Blink...");
//     if (!this.myBox || !this.playerBounds) {
//       console.warn("Cannot blink: myBox or playerBounds not initialized.");
//       return;
//     }
//     // Prevent blink if currently "hooked"
//     if (
//       this.currentAbility === "hooked" ||
//       this.currentAbility ||
//       this.cooldowns.blink > this.time.now
//     ) {
//       console.log(
//         Blink on cooldown or another ability active. Cooldown: ${this.cooldowns.blink}, Current Ability: ${this.currentAbility}, Current Time: ${this.time.now}
//       );
//       return;
//     }

//     this.currentAbility = "blink";
//     console.log("currentAbility set to 'blink' in tryBlink");
//     this.cooldowns.blink = this.time.now + 4000; // 4-second cooldown
//     this.highlightSkill("blink");
//     this.showCooldown("blink", 4000);
//     console.log("Blink fired!");

//     // Calculate new position after blinking
//     const distance = 100;
//     let dx = 0,
//       dy = 0;
//     switch (this.facing) {
//       case "left":
//         dx = -distance;
//         break;
//       case "right":
//         dx = distance;
//         break;
//       case "up":
//         dy = -distance;
//         break;
//       case "down":
//         dy = distance;
//         break;
//     }

//     // Clamp new position within player's bounds
//     // Similar clamping logic as in update() to ensure player lands within bounds
//     const newX = Phaser.Math.Clamp(
//       this.myBox.x + dx,
//       this.playerBounds.x + this.myBox.width / 2, // Min X (center)
//       this.playerBounds.x + this.playerBounds.width - this.myBox.width / 2 // Max X (center)
//     );
//     const newY = Phaser.Math.Clamp(
//       this.myBox.y + dy,
//       this.playerBounds.y + this.myBox.height / 2, // Min Y (center)
//       this.playerBounds.y + this.playerBounds.height - this.myBox.height / 2 // Max Y (center)
//     );

//     this.myBox.setPosition(newX, newY); // Update visual position
//     if (this.myBox.body) {
//       // Update physics body position
//       this.myBox.body.x = newX - this.myBox.body.width / 2;
//       this.myBox.body.y = newY - this.myBox.body.height / 2;
//     }
//     socket.emit("blinkFired", { playerId: socket.id, newX, newY }); // Notify server
//     this.time.delayedCall(200, () => {
//       this.currentAbility = null;
//       console.log("currentAbility cleared (Blink ability ended).");
//     });
//   }

//   /**
//    * Attempts to use the Shift ability (temporary invulnerability/movement disable).
//    */
//   tryShift() {
//     console.log("Attempting Shift...");
//     // Prevent shift if currently "hooked"
//     if (
//       this.currentAbility === "hooked" ||
//       this.currentAbility ||
//       this.cooldowns.shift > this.time.now
//     ) {
//       console.log(
//         Shift on cooldown or another ability active. Cooldown: ${this.cooldowns.shift}, Current Ability: ${this.currentAbility}, Current Time: ${this.time.now}
//       );
//       return;
//     }
//     this.currentAbility = "shift";
//     console.log("currentAbility set to 'shift' in tryShift");
//     this.cooldowns.shift = this.time.now + 5000; // 5-second cooldown
//     this.highlightSkill("shift");
//     this.showCooldown("shift", 5000);
//     console.log("Shift activated!");

//     this.myBox.fillColor = 0x999999; // Change player color during shift
//     socket.emit("shiftFired", { playerId: socket.id }); // Notify server

//     // Set a timer for shift duration (2 seconds active time)
//     this.shiftTimer = this.time.delayedCall(2000, () => {
//       this.shiftActive = false; // Deactivate shift state
//       this.myBox.fillColor = this.originalColor; // Revert color
//       socket.emit("shiftEnd", { playerId: socket.id }); // Notify server
//       this.currentAbility = null; // Clear ability status
//       console.log("currentAbility cleared (Shift duration ended).");
//     });
//   }

//   /**
//    * Cancels the currently active action or ability (specifically for Shift and Hook).
//    */
//   cancelAction() {
//     console.log("Cancelling action...");
//     // If in "hooked" state, allow cancellation of the visual effect/state
//     if (this.currentAbility === "hooked") {
//       // We don't have a direct 'respawnTimer' in client anymore since server handles delay
//       // but we can still clear the visual countdown and make player visible if they pressed 'S'
//       this.respawnCountdownText.setVisible(false);
//       this.myBox.setVisible(true); // Ensure player is visible
//       this.currentAbility = null;
//       console.log("currentAbility cleared (Hooked state cancelled manually).");
//     }

//     if (this.currentAbility === "shift") {
//       if (this.shiftTimer) {
//         this.shiftTimer.remove(false); // Stop the delayed call for shift end
//         this.shiftTimer = null;
//       }
//       this.shiftActive = false;
//       this.myBox.fillColor = this.originalColor;
//       socket.emit("shiftEnd", { playerId: socket.id });
//       this.currentAbility = null;
//       console.log("currentAbility cleared (Shift cancelled manually).");
//     }
//     // Also cancel the hook visualization if active (e.g., if the user presses 'S' while hook is extending)
//     if (this.currentAbility === "hook") {
//       if (this.activeHookLine) {
//         this.activeHookLine.destroy();
//         this.activeHookLine = null;
//       }
//       if (this.hookTween) {
//         this.hookTween.stop();
//         this.hookTween = null;
//       }
//       this.currentAbility = null;
//       console.log("currentAbility cleared (Hook cancelled manually).");
//     }

//     // Stop player movement
//     if (this.myBox?.body) {
//       this.myBox.body.setVelocity(0, 0);
//       console.log("Player movement stopped.");
//       socket.emit("playerMove", {
//         id: socket.id,
//         x: this.myBox.x,
//         y: this.myBox.y,
//       }); // Send final position to server
//     }
//     this.targetPosition = null; // Also clear mouse movement target
//   }

//   /**
//    * UI: Highlights a skill icon based on its active state or cooldown status.
//    * @param {string|null} activeSkill - The key of the currently active skill, or null if none.
//    */
//   highlightSkill(activeSkill) {
//     for (const key in this.skillIcons) {
//       this.skillIcons[key].setAlpha(
//         key === activeSkill || this.cooldowns[key] <= this.time.now ? 1 : 0.3 // Full alpha if active/off cooldown, dimmed if on cooldown
//       );
//     }
//   }

//   /**
//    * UI: Shows a cooldown overlay and updates the cooldown text for a skill icon.
//    * @param {string} skillName - The key of the skill (e.g., 'hook', 'blink', 'shift').
//    * @param {number} duration - The total cooldown duration in milliseconds.
//    */
//   showCooldown(skillName, duration) {
//     console.log(Showing cooldown for ${skillName} (${duration / 1000}s));
//     const overlay = this.cooldownOverlays[skillName];
//     const icon = this.skillIcons[skillName];

//     overlay.setVisible(true);
//     icon.setAlpha(1); // Ensure icon is fully visible when on cooldown

//     // Hide cooldown overlay after duration
//     this.time.delayedCall(duration, () => {
//       overlay.setVisible(false);
//       this.cooldowns[skillName] = 0; // Reset cooldown
//       if (!this.currentAbility) {
//         // Only re-highlight if no other ability is active
//         this.highlightSkill(null);
//       }
//       console.log(${skillName} cooldown ended.);
//     });
//   }
// }