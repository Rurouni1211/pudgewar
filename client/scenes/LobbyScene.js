// client/scenes/LobbyScene.js - REVISED CREATE METHOD

import { socket } from "../game.js";

export class LobbyScene extends Phaser.Scene {
  constructor() {
    super({ key: "LobbyScene" });
  }

  create() {
    // Clear ALL socket listeners to ensure no old ones are lingering
    socket.removeAllListeners(); // This is a powerful, but sometimes necessary, cleanup

    this.add
      .text(this.cameras.main.width / 2, 100, "Waiting for Opponent...", {
        fontSize: "32px",
        fill: "#fff",
      })
      .setOrigin(0.5);

    this.roomCodeText = this.add
      .text(this.cameras.main.width / 2, 150, "Room: Creating...", {
        fontSize: "20px",
        fill: "#aaa",
      })
      .setOrigin(0.5);

    this.errorText = this.add
      .text(this.cameras.main.width / 2, 200, "", {
        fontSize: "24px",
        fill: "#ff0000",
      })
      .setOrigin(0.5);

    // Listen for server confirmation of room creation
    socket.on("roomCreated", (roomCode) => {
      this.roomCodeText.setText(`Room: ${roomCode} (Waiting for Player 2)`);
      this.errorText.setText("");
      console.log(
        `LobbyScene: Room ${roomCode} created. Waiting for opponent.`
      );
    });

    // Listen for server-side room errors
    socket.on("roomError", (message) => {
      console.error("LobbyScene: Room Error:", message);
      this.errorText.setText(`Error: ${message}`);
      this.roomCodeText.setText("Room: Error");
    });

    // IMPORTANT: Listen for the 'startGame' event from the server
    socket.once("startGame", (data) => {
      console.log(
        "LobbyScene: Received startGame. Transitioning to GameScene with data:",
        data
      );

      // Before transitioning, clear ALL socket listeners that might have been
      // registered in this LobbyScene instance to prevent them from firing
      // accidentally in the GameScene context.
      socket.removeAllListeners();

      this.scene.start("GameScene", data);
      this.scene.stop("LobbyScene");
    });

    // Use a flag to prevent multiple room creation/join attempts on reconnect
    // This logic needs to be robust for network fluctuations.
    this.roomAttempted = false;
    const attemptRoomLogic = () => {
      if (this.roomAttempted) {
        console.log(
          "LobbyScene: Room attempt already in progress or completed for this scene instance."
        );
        return;
      }
      this.roomAttempted = true; // Mark as attempted

      console.log("LobbyScene: Attempting to create/join room 'demo'.");
      const testRoomCode = "demo";
      socket.emit("createRoom", testRoomCode);
      socket.emit("joinRoom", testRoomCode);
    };

    // If the socket is already connected when the scene is created, attempt room logic immediately.
    if (socket.connected) {
      console.log(
        "LobbyScene: Socket already connected, attempting room logic immediately."
      );
      attemptRoomLogic();
    } else {
      // Otherwise, wait for the 'connect' event.
      socket.on("connect", () => {
        console.log("LobbyScene: Socket connected!");
        attemptRoomLogic();
      });
    }

    console.log("LobbyScene: created. Waiting for startGame event...");
  }
}
