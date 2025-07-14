// server.js (Only a minor change for robustness)
const express = require("express");
const http = require("http");
const app = express();
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

const PORT = 3000;

app.use(express.static("client"));

let players = {};
let rooms = {};

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

      const spawnTop = {
        x: Math.floor(Math.random() * 800) + 100,
        y: Math.floor(Math.random() * 100) + 50,
      };
      const spawnBottom = {
        x: Math.floor(Math.random() * 800) + 100,
        y: Math.floor(Math.random() * 100) + 400,
      };

      players[id1].lastPosition = spawnTop;
      players[id2].lastPosition = spawnBottom;

      console.log(
        `Spawn positions: ${id1} at (${spawnTop.x}, ${spawnTop.y}), ${id2} at (${spawnBottom.x}, ${spawnBottom.y})`
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

    if (players[id]) {
      players[id].lastPosition = { x, y };
      socket.to(room).emit("playerMove", { id, x, y });
    } else {
      console.log(`❓ Player ${id} not found in players object.`);
    }
  });

  socket.on("hookFired", ({ playerId, direction }) => {
    const room = socket.roomCode;
    if (!room) {
      console.log(`🚫 Hook fired by ${playerId} without a room.`);
      return;
    }
    const opponentId = rooms[room]?.find((id) => id !== playerId);
    const pullTo = players[playerId]?.lastPosition;
    if (!opponentId || !pullTo) {
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
      pullTo,
    });

    const isOpponentBottom = rooms[room].indexOf(opponentId) === 1;
    const respawnY = isOpponentBottom
      ? Math.floor(Math.random() * 100) + 400
      : Math.floor(Math.random() * 100) + 50;
    const respawnX = Math.floor(Math.random() * 800) + 100;

    players[opponentId].lastPosition = { x: respawnX, y: respawnY };
    console.log(
      `♻️ Opponent ${opponentId} respawned at (${respawnX}, ${respawnY})`
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
    if (players[playerId]) {
      players[playerId].lastPosition = { x: newX, y: newY };
      console.log(`✨ Player ${playerId} blinked to (${newX}, ${newY})`);
    }
    io.to(room).emit("blinkEffect", { playerId, newX, newY });
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
    delete players[socket.id];
  });
});

server.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
