// client/scenes/LobbyScene.js

import { socket } from "../game.js";

export class LobbyScene extends Phaser.Scene {
  constructor() {
    super({ key: "LobbyScene" });
    this.playersInRoom = [];
    this.playerTextObjects = []; // Stores the actual Phaser text objects for player names/status
  }

  create() {
    socket.removeAllListeners(); // Clear any old listeners from previous scenes

    this.add
      .text(this.cameras.main.width / 2, 100, "Pudge War Lobby", {
        fontSize: "36px",
        fill: "#fff",
        fontStyle: "bold",
        stroke: "#000",
        strokeThickness: 6,
      })
      .setOrigin(0.5);

    this.add
      .text(this.cameras.main.width / 2, 150, "Waiting for Opponent...", {
        fontSize: "24px",
        fill: "#aaa",
      })
      .setOrigin(0.5);

    this.roomCodeText = this.add
      .text(
        this.cameras.main.width / 2,
        200,
        "Room: Attempting to connect...",
        {
          fontSize: "20px",
          fill: "#ddd",
        }
      )
      .setOrigin(0.5);

    this.playerListTitle = this.add
      .text(this.cameras.main.width / 2, 300, "Players in Room:", {
        fontSize: "22px",
        fill: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    this.errorText = this.add
      .text(this.cameras.main.width / 2, 250, "", {
        fontSize: "20px", // Slightly smaller error text
        fill: "#ff4444", // More visible red
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    // --- Socket Listeners for Lobby ---
    socket.on("roomCreated", (roomCode) => {
      this.roomCodeText.setText(
        `Room Code: ${roomCode} (Share this with opponent!)`
      );
      this.errorText.setText(""); // Clear any previous errors
      console.log(
        `LobbyScene: Room ${roomCode} created. Waiting for opponent.`
      );
    });

    socket.on("updatePlayerList", (playerList) => {
      console.log("LobbyScene: Received updatePlayerList:", playerList);
      this.updatePlayerTable(playerList);
      // Update the main "Waiting for Opponent..." message
      if (playerList.length === 1) {
        this.add
          .text(this.cameras.main.width / 2, 150, "Waiting for Opponent...", {
            fontSize: "24px",
            fill: "#aaa",
          })
          .setOrigin(0.5);
      } else if (playerList.length === 2) {
        this.add
          .text(
            this.cameras.main.width / 2,
            150,
            "Opponent Found! Starting Game...",
            {
              fontSize: "24px",
              fill: "#00ff00",
              fontStyle: "bold",
            }
          )
          .setOrigin(0.5);
      }
    });

    socket.on("roomError", (message) => {
      console.error("LobbyScene: Room Error:", message);
      this.errorText.setText(`Error: ${message}`);
      // If a room error occurs during initial creation/join, reset state or guide user
      this.roomCodeText.setText(
        "Room: Failed. Try refreshing or a different code."
      );
    });

    socket.once("startGame", (data) => {
      console.log("LobbyScene: Received startGame. Starting game...");
      socket.removeAllListeners(); // Clear all lobby listeners before transitioning
      this.scene.start("GameScene", data);
      this.scene.stop("LobbyScene");
    });

    // --- Initial Room Attempt Logic ---
    this.roomAttempted = false;
    const attemptRoomLogic = () => {
      if (this.roomAttempted) return;
      this.roomAttempted = true;

      const defaultRoomCode = "default_pudge_war_room"; // A fixed room code for simplicity
      const playerName =
        prompt("Enter your name (max 10 chars):") || "Anonymous";
      const trimmedName = playerName.substring(0, 10); // Trim name

      console.log(
        `LobbyScene: Attempting to create room '${defaultRoomCode}' as ${trimmedName}`
      );
      socket.emit("createRoom", {
        roomCode: defaultRoomCode,
        name: trimmedName,
      });

      // Set up a ONE-TIME listener for roomError specific to the create attempt
      // This is crucial: if creation fails (meaning room already exists and is waiting for player 2),
      // then we should try to join it instead.
      socket.once("roomError", (message) => {
        if (message.includes("already exists")) {
          console.log(
            `LobbyScene: Room creation failed ('${defaultRoomCode}' exists), attempting to join...`
          );
          socket.emit("joinRoom", {
            roomCode: defaultRoomCode,
            name: trimmedName,
          });
        } else {
          this.errorText.setText(`Error: ${message}`);
          console.error("LobbyScene: Unhandled room error:", message);
        }
      });
    };

    // If socket is already connected (e.g., after a refresh), attempt room logic immediately.
    // Otherwise, wait for 'connect' event.
    if (socket.connected) {
      attemptRoomLogic();
    } else {
      socket.on("connect", () => {
        console.log("LobbyScene: Socket connected!");
        attemptRoomLogic();
      });
    }

    console.log("LobbyScene: created. Waiting for game start event...");
  }

  /**
   * Updates the displayed list of players in the lobby.
   * @param {Array<Object>} playerList - An array of player objects ({id: string, name: string}).
   */
  updatePlayerTable(playerList) {
    // Destroy existing player text objects
    this.playerTextObjects.forEach((text) => text.destroy());
    this.playerTextObjects = [];

    this.playersInRoom = playerList; // Store the current player list

    // Position for the first player entry, relative to the "Players in Room:" title
    const startY = this.playerListTitle.y + this.playerListTitle.height + 15;
    playerList.forEach((player, index) => {
      const playerText = this.add
        .text(
          this.cameras.main.width / 2,
          startY + index * 30, // Adjust Y position for each player
          `Player ${index + 1}: ${player.name || player.id}`,
          {
            fontSize: "18px",
            fill: "#ffffff",
            stroke: "#000",
            strokeThickness: 2,
          }
        )
        .setOrigin(0.5);
      this.playerTextObjects.push(playerText);
    });
  }
}
