// game.js
import { GameScene } from "./scenes/GameScene.js";
import { LobbyScene } from "./scenes/LobbyScene.js"; // Import your new lobby scene
import { io } from "https://cdn.socket.io/4.7.2/socket.io.esm.min.js";

const SERVER_URL = "https://pudgewar.onrender.com";
export const socket = io(SERVER_URL); // Ensure socket is initialized once and exported

const config = {
  type: Phaser.AUTO,
  width: 1024,
  height: 600,
  backgroundColor: "#87CEEB",
  physics: {
    default: "arcade",
    arcade: { gravity: { y: 0 }, debug: true },
  },
  scene: [LobbyScene, GameScene], // LobbyScene is now the first scene
};

const game = new Phaser.Game(config);

// Removed TEMP auto-join here! It's now handled by LobbyScene on connect.
// socket.emit("createRoom", "demo");
// socket.emit("joinRoom", "demo");
