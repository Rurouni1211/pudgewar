// server.js
const express = require("express");
const http = require("http");
const app = express();
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

const PORT = 3000;

app.use(express.static("client"));

let players = {}; // Stores player data: { socketId: { score, lastPosition: {x,y}, bounds: {x, y, width, height} }, ... }
let rooms = {};

// Game Constants (should match client-side for consistent logic)
const GAME_WIDTH = 1024;
const GAME_HEIGHT = 600;
const MID_LINE_Y = GAME_HEIGHT / 2; // 300
const PLAYER_SIZE = 32; // Assuming player box is 32x32

io.on("connection", (socket) => {
  console.log(`🔌 User connected: ${socket.id}`);

  socket.on("createRoom", (roomCode) => {
    if (rooms[roomCode]) {
      console.log(
        `⚠️ Room ${roomCode} already exists. User ${socket.id} tried to create it.`
      );
      socket.emit("roomError", "Room with this code already exists.");
      return;
    }
    socket.join(roomCode);
    socket.roomCode = roomCode;
    rooms[roomCode] = [socket.id];
    players[socket.id] = { score: 0 };
    console.log(`➕ User ${socket.id} created and joined room: ${roomCode}`);
    socket.emit("roomCreated", roomCode);
  });

  socket.on("joinRoom", (roomCode) => {
    const room = rooms[roomCode];
    if (!room) {
      console.log(
        `⚠️ Room ${roomCode} does not exist. User ${socket.id} tried to join.`
      );
      socket.emit("roomError", "Room does not exist.");
      return;
    }
    if (room.length >= 2) {
      console.log(
        `⚠️ Room ${roomCode} is full. User ${socket.id} tried to join.`
      );
      socket.emit("roomError", "Room is full.");
      return;
    }
    if (room.includes(socket.id)) {
      console.log(`⚠️ User ${socket.id} already in room ${roomCode}.`);
      return;
    }

    socket.join(roomCode);
    socket.roomCode = roomCode;
    room.push(socket.id);
    players[socket.id] = { score: 0 };
    console.log(`➕ User ${socket.id} joined room: ${roomCode}`);

    if (room.length === 2) {
      const [id1, id2] = room;
      console.log(`🎮 Two players in room ${roomCode}. Starting game...`);

      // Assign Player 1 to the top half, Player 2 to the bottom half
      const spawnTop = {
        x:
          Math.floor(Math.random() * (GAME_WIDTH - PLAYER_SIZE)) +
          PLAYER_SIZE / 2, // Centered X, within bounds
        y:
          Math.floor(Math.random() * (MID_LINE_Y - PLAYER_SIZE)) +
          PLAYER_SIZE / 2, // Centered Y, within top half
      };
      const spawnBottom = {
        x:
          Math.floor(Math.random() * (GAME_WIDTH - PLAYER_SIZE)) +
          PLAYER_SIZE / 2, // Centered X, within bounds
        y:
          Math.floor(Math.random() * (MID_LINE_Y - PLAYER_SIZE)) +
          MID_LINE_Y +
          PLAYER_SIZE / 2, // Centered Y, within bottom half
      };
      players[id1].bounds = {
        x: 0,
        y: 0,
        width: GAME_WIDTH,
        height: MID_LINE_Y,
      }; // Top half
      players[id2].bounds = {
        x: 0,
        y: MID_LINE_Y,
        width: GAME_WIDTH,
        height: MID_LINE_Y,
      }; // Bottom half

      console.log(`SERVER DEBUG: Player ${id1} bounds:`, players[id1].bounds);
      console.log(`SERVER DEBUG: Player ${id2} bounds:`, players[id2].bounds);
      // Store bounds for each player on the server
      players[id1].lastPosition = spawnTop;
      players[id1].bounds = {
        x: 0,
        y: 0,
        width: GAME_WIDTH,
        height: MID_LINE_Y,
      }; // Top half
      players[id2].lastPosition = spawnBottom;
      players[id2].bounds = {
        x: 0,
        y: MID_LINE_Y,
        width: GAME_WIDTH,
        height: MID_LINE_Y,
      }; // Bottom half

      console.log(
        `Spawn positions and bounds: ${id1} at (${spawnTop.x}, ${
          spawnTop.y
        }) in [${players[id1].bounds.y}, ${
          players[id1].bounds.y + players[id1].bounds.height
        }], ${id2} at (${spawnBottom.x}, ${spawnBottom.y}) in [${
          players[id2].bounds.y
        }, ${players[id2].bounds.y + players[id2].bounds.height}]`
      );

      io.to(roomCode).emit("startGame", {
        players: [id1, id2],
        positions: {
          [id1]: spawnTop,
          [id2]: spawnBottom,
        },
      });
    }
  });

  socket.on("playerMove", ({ id, x, y }) => {
    const room = socket.roomCode;
    if (!room) {
      return;
    }

    const player = players[id];
    if (player && player.bounds) {
      // Ensure player data and bounds exist
      // Clamp the received position to the player's server-defined bounds
      // Remember x,y from client are center coordinates
      x = Math.max(
        player.bounds.x + PLAYER_SIZE / 2,
        Math.min(x, player.bounds.x + player.bounds.width - PLAYER_SIZE / 2)
      );
      y = Math.max(
        player.bounds.y + PLAYER_SIZE / 2,
        Math.min(y, player.bounds.y + player.bounds.height - PLAYER_SIZE / 2)
      );

      player.lastPosition = { x, y }; // Update server's authoritative position
      socket.to(room).emit("playerMove", { id, x, y }); // Emit the *clamped* position
    } else {
      console.log(
        `❓ Player ${id} not found or missing bounds. Current players:`,
        Object.keys(players)
      );
    }
    // Inside socket.on("playerMove")
    if (player) {
      // Changed from player && player.bounds for initial check
      console.log(
        `SERVER DEBUG: Received playerMove from ${id} at (${x}, ${y})`
      );
      console.log(
        `SERVER DEBUG: Player ${id} data (including bounds):`,
        player
      );
      if (!player.bounds) {
        console.error(`SERVER ERROR: Player ${id} has no bounds defined!`);
        return; // Exit if no bounds, this is a critical error
      }
      // ... rest of clamping logic ...
    }
  });

  socket.on("hookFired", ({ playerId, direction }) => {
    const room = socket.roomCode;
    if (!room) {
      console.log(`🚫 Hook fired by ${playerId} without a room.`);
      return;
    }
    const opponentId = rooms[room]?.find((id) => id !== playerId);
    const pullToPlayer = players[playerId]; // Get player's full data
    if (!opponentId || !pullToPlayer || !pullToPlayer.lastPosition) {
      console.log(
        `⚠️ Hook fired by ${playerId}, but opponent or pullTo position missing.`
      );
      return;
    }

    players[playerId].score = (players[playerId].score || 0) + 1;
    console.log(
      `🎣 Hook by ${playerId} on ${opponentId}. ${playerId} score: ${players[playerId].score}`
    );

    io.to(room).emit("hookHit", {
      by: playerId,
      target: opponentId,
      pullTo: pullToPlayer.lastPosition, // Use the server's last known position
    });

    const opponent = players[opponentId];
    if (!opponent || !opponent.bounds) {
      console.warn(
        `Opponent ${opponentId} or their bounds not found for respawn.`
      );
      return;
    }

    // Respawn within opponent's OWN boundaries
    const respawnX =
      Math.floor(Math.random() * (opponent.bounds.width - PLAYER_SIZE)) +
      opponent.bounds.x +
      PLAYER_SIZE / 2;
    const respawnY =
      Math.floor(Math.random() * (opponent.bounds.height - PLAYER_SIZE)) +
      opponent.bounds.y +
      PLAYER_SIZE / 2;

    opponent.lastPosition = { x: respawnX, y: respawnY };
    console.log(
      `♻️ Opponent ${opponentId} respawned at (${respawnX}, ${respawnY}) in their bounds [${
        opponent.bounds.y
      }, ${opponent.bounds.y + opponent.bounds.height}]`
    );

    io.to(opponentId).emit("respawn", {
      x: respawnX,
      y: respawnY,
      target: opponentId,
    });
  });

  socket.on("blinkFired", ({ playerId, newX, newY }) => {
    const room = socket.roomCode;
    if (!room) {
      console.log(`🚫 Blink fired by ${playerId} without a room.`);
      return;
    }
    const player = players[playerId];
    if (player && player.bounds) {
      // Clamp blink destination on server
      newX = Math.max(
        player.bounds.x + PLAYER_SIZE / 2,
        Math.min(newX, player.bounds.x + player.bounds.width - PLAYER_SIZE / 2)
      );
      newY = Math.max(
        player.bounds.y + PLAYER_SIZE / 2,
        Math.min(newY, player.bounds.y + player.bounds.height - PLAYER_SIZE / 2)
      );

      player.lastPosition = { x: newX, y: newY };
      console.log(
        `✨ Player ${playerId} blinked to (${newX}, ${newY}) (clamped)`
      );
      io.to(room).emit("blinkEffect", { playerId, newX, newY });
    } else {
      console.log(
        `❓ Player ${playerId} not found or missing bounds for blink.`
      );
    }
  });

  socket.on("shiftFired", ({ playerId }) => {
    const room = socket.roomCode;
    if (!room) {
      console.log(`🚫 Shift fired by ${playerId} without a room.`);
      return;
    }
    console.log(`👻 Player ${playerId} activated Shift.`);
    io.to(room).emit("shiftEffect", { playerId });
  });

  socket.on("shiftEnd", ({ playerId }) => {
    const room = socket.roomCode;
    if (!room) {
      console.log(`🚫 Shift ended by ${playerId} without a room.`);
      return;
    }
    console.log(`✅ Player ${playerId} ended Shift.`);
    io.to(room).emit("shiftEndEffect", { playerId });
  });

  socket.on("disconnect", () => {
    console.log(`🔌 User disconnected: ${socket.id}`);
    const room = socket.roomCode;
    if (room && rooms[room]) {
      rooms[room] = rooms[room].filter((id) => id !== socket.id);
      console.log(
        `➖ User ${socket.id} left room ${room}. Remaining: ${rooms[room].length}`
      );
      if (rooms[room].length === 0) {
        delete rooms[room];
        console.log(`🗑️ Room ${room} is empty and deleted.`);
      } else if (rooms[room].length === 1) {
        const remainingPlayerId = rooms[room][0];
        io.to(remainingPlayerId).emit(
          "opponentDisconnected",
          "Your opponent has disconnected. Game ended."
        );
        // IMPORTANT: Delete the room here too so that if the remaining player
        // goes back to the lobby, they can start a fresh game.
        delete rooms[room];
        console.log(
          `💔 Opponent disconnected in room ${room}. Notifying ${remainingPlayerId}. Room deleted.`
        );
      }
    }
    delete players[socket.id]; // Remove player data regardless of room status
  });
});

server.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
