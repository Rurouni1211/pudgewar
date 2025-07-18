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

// Constants for Hook logic
const HOOK_LEN = 300; // Max length of the hook
const HOOK_SPEED = 750; // Pixels per second hook extends
const HOOK_CHECK_INTERVAL = 25; // How often to check for collision during hook extension (milliseconds) - Smaller is more precise but more CPU.

/**
 * Checks if a point (px, py) is inside a rectangle.
 * @param {number} px
 * @param {number} py
 * @param {{left: number, right: number, top: number, bottom: number}} rect
 * @returns {boolean}
 */
function pointInRect(px, py, rect) {
  return (
    px >= rect.left && px <= rect.right && py >= rect.top && py <= rect.bottom
  );
}

/**
 * Checks if a line segment (x1,y1)-(x2,y2) intersects a rectangle.
 * This function is robust and handles cases where endpoints are inside the rectangle.
 * It's kept for potential future use or more complex hit detection,
 * but for the hook's tip, pointInRect is often sufficient.
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
 * @param {{left: number, right: number, top: number, bottom: number}} rect
 * @returns {boolean}
 */
function segmentIntersectsRect(x1, y1, x2, y2, rect) {
  // Quick reject if both points are completely on one outside side
  if (x1 < rect.left && x2 < rect.left && x1 < rect.left && x2 < rect.left)
    return false;
  if (x1 > rect.right && x2 > rect.right && x1 > rect.right && x2 > rect.right)
    return false;
  if (y1 < rect.top && y2 < rect.top && y1 < rect.top && y2 < rect.top)
    return false;
  if (
    y1 > rect.bottom &&
    y2 > rect.bottom &&
    y1 > rect.bottom &&
    y2 > rect.bottom
  )
    return false;

  // If start or end inside rect, it's a hit
  if (pointInRect(x1, y1, rect) || pointInRect(x2, y2, rect)) return true;

  // Check segment vs each rect edge
  return (
    segmentsIntersect(
      x1,
      y1,
      x2,
      y2,
      rect.left,
      rect.top,
      rect.right,
      rect.top
    ) || // top
    segmentsIntersect(
      x1,
      y1,
      x2,
      y2,
      rect.right,
      rect.top,
      rect.right,
      rect.bottom
    ) || // right
    segmentsIntersect(
      x1,
      y1,
      x2,
      y2,
      rect.right,
      rect.bottom,
      rect.left,
      rect.bottom
    ) || // bottom
    segmentsIntersect(
      x1,
      y1,
      x2,
      y2,
      rect.left,
      rect.bottom,
      rect.left,
      rect.top
    ) // left
  );
}

/**
 * Standard 2D segment intersection check.
 * @param {number} ax1
 * @param {number} ay1
 * @param {number} ax2
 * @param {number} ay2
 * @param {number} bx1
 * @param {number} by1
 * @param {number} bx2
 * @param {number} by2
 * @returns {boolean}
 */
function segmentsIntersect(ax1, ay1, ax2, ay2, bx1, by1, bx2, by2) {
  const d = (ax2 - ax1) * (by2 - by1) - (ay2 - ay1) * (bx2 - bx1);
  if (d === 0) return false; // parallel or collinear (handle as no intersection for simplicity)
  const u = ((bx1 - ax1) * (by2 - by1) - (by1 - ay1) * (bx2 - bx1)) / d;
  const v = ((bx1 - ax1) * (ay2 - ay1) - (by1 - ay1) * (ax2 - ax1)) / d;
  return u >= 0 && u <= 1 && v >= 0 && v <= 1;
}

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
        x:
          Math.floor(Math.random() * (GAME_WIDTH - PLAYER_SIZE)) +
          PLAYER_SIZE / 2,
        y:
          Math.floor(Math.random() * (MID_LINE_Y - PLAYER_SIZE)) +
          PLAYER_SIZE / 2,
      };
      const spawnBottom = {
        x:
          Math.floor(Math.random() * (GAME_WIDTH - PLAYER_SIZE)) +
          PLAYER_SIZE / 2,
        y:
          Math.floor(Math.random() * (MID_LINE_Y - PLAYER_SIZE)) +
          MID_LINE_Y +
          PLAYER_SIZE / 2,
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

      players[id1].lastPosition = spawnTop;
      players[id2].lastPosition = spawnBottom;

      console.log(
        `Spawn positions: ${id1} at (${spawnTop.x}, ${spawnTop.y}), ${id2} at (${spawnBottom.x}, ${spawnBottom.y})`
      );
      console.log(`Player ${id1} bounds:`, players[id1].bounds);
      console.log(`Player ${id2} bounds:`, players[id2].bounds);

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
    if (!room) return;

    const player = players[id];
    if (player && player.bounds) {
      x = Math.max(
        player.bounds.x + PLAYER_SIZE / 2,
        Math.min(x, player.bounds.x + player.bounds.width - PLAYER_SIZE / 2)
      );
      y = Math.max(
        player.bounds.y + PLAYER_SIZE / 2,
        Math.min(y, player.bounds.y + player.bounds.height - PLAYER_SIZE / 2)
      );

      player.lastPosition = { x, y };
      socket.to(room).emit("playerMove", { id, x, y });
    } else {
      console.log(
        `❓ Player ${id} not found or missing bounds. Current players:`,
        Object.keys(players)
      );
    }
  });

  socket.on("hookFired", ({ playerId, direction, targetX, targetY }) => {
    const room = socket.roomCode;
    if (!room) return;

    const opponentId = rooms[room]?.find((id) => id !== playerId);
    const player = players[playerId];
    const opponent = players[opponentId];

    if (
      !player ||
      !opponent ||
      !player.lastPosition ||
      !opponent.lastPosition
    ) {
      console.log(`Hook fired with missing player/opponent data.`);
      io.to(playerId).emit("hookMiss"); // Immediately miss if data is missing
      return;
    }

    const startX = player.lastPosition.x;
    const startY = player.lastPosition.y;

    let hookAngle;
    // Determine hook angle: prioritize mouse aim if targetX/Y are provided, otherwise use direction
    if (typeof targetX === "number" && typeof targetY === "number") {
      hookAngle = Math.atan2(targetY - startY, targetX - startX);
    } else {
      switch (direction) {
        case "left":
          hookAngle = Math.PI;
          break;
        case "right":
          hookAngle = 0;
          break;
        case "up":
          hookAngle = -Math.PI / 2;
          break;
        case "down":
          hookAngle = Math.PI / 2;
          break;
        default:
          console.error("Invalid hook direction/target received.");
          io.to(playerId).emit("hookMiss"); // Immediately miss if invalid
          return;
      }
    }

    // Opponent's Axis-Aligned Bounding Box (AABB)
    const oppPos = opponent.lastPosition;
    const half = PLAYER_SIZE / 2;
    const oppRect = {
      left: oppPos.x - half,
      right: oppPos.x + half,
      top: oppPos.y - half,
      bottom: oppPos.y + half,
    };

    let currentHookLength = 0;
    let hitDetected = false;

    // Notify clients to start animating the hook
    io.to(room).emit("hookStarted", {
      playerId,
      startX,
      startY,
      hookAngle,
      hookLength: HOOK_LEN,
      hookSpeed: HOOK_SPEED,
    });

    // Server-side simulation of hook extension and collision detection
    const hookInterval = setInterval(() => {
      if (hitDetected) {
        clearInterval(hookInterval);
        return;
      }

      currentHookLength += (HOOK_SPEED * HOOK_CHECK_INTERVAL) / 1000;

      if (currentHookLength > HOOK_LEN) {
        clearInterval(hookInterval);
        console.log(`❌ Hook MISS by ${playerId} (max length reached)`);
        io.to(playerId).emit("hookMiss");
        return;
      }

      const hookTipX = startX + Math.cos(hookAngle) * currentHookLength;
      const hookTipY = startY + Math.sin(hookAngle) * currentHookLength;

      // Crucial: Collision check is only for the *tip* of the hook as it extends
      const hit = pointInRect(hookTipX, hookTipY, oppRect);

      if (hit) {
        hitDetected = true;
        clearInterval(hookInterval);

        io.to(room).emit("hookHit", {
          by: playerId,
          target: opponentId,
          pullTo: { x: player.lastPosition.x, y: player.lastPosition.y }, // Pull to caster's CURRENT position
        });

        // Respawn opponent
        const respawnX =
          Math.random() * (opponent.bounds.width - PLAYER_SIZE) +
          opponent.bounds.x +
          half;
        const respawnY =
          Math.random() * (opponent.bounds.height - PLAYER_SIZE) +
          opponent.bounds.y +
          half;

        opponent.lastPosition = { x: respawnX, y: respawnY };
        io.to(opponentId).emit("respawn", {
          x: respawnX,
          y: respawnY,
          target: opponentId,
        });

        console.log(`🎯 Hook HIT by ${playerId} on ${opponentId}`);
      }
    }, HOOK_CHECK_INTERVAL);
  });

  socket.on("blinkFired", ({ playerId, newX, newY }) => {
    const room = socket.roomCode;
    if (!room) {
      console.log(`🚫 Blink fired by ${playerId} without a room.`);
      return;
    }
    const player = players[playerId];
    if (player && player.bounds) {
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
