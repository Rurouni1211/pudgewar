const express = require("express");
const http = require("http");
const app = express();
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = require("socket.io")(server, {
  cors: {
    origin: "https://pudge-war.netlify.app", // ✅ allow Netlify frontend
    methods: ["GET", "POST"],
  },
});

const PORT = process.env.PORT || 3000; // Use environment variable for port

app.use(express.static("client"));

let players = {}; // Stores player data: { socketId: { score, lastPosition: {x,y}, bounds: {left, right, top, bottom}, isRespawning: boolean, name: string }, ... }
let rooms = {};

// Game Constants (should match client-side for consistent logic)
const GAME_WIDTH = 1024;
const GAME_HEIGHT = 600;

const PLAYER_SIZE = 32; // Assuming player box is 32x32

// If QUADRANT_WIDTH and QUADRANT_HEIGHT were used elsewhere, keep them.
// Otherwise, they are not strictly needed for the half-screen split logic now.
// I'll re-add them just in case they were removed by mistake and used elsewhere.
const QUADRANT_WIDTH = GAME_WIDTH / 2;
const QUADRANT_HEIGHT = GAME_HEIGHT / 2;

// Constants for Hook logic
const HOOK_LEN = 350; // Max length of the hook
const HOOK_SPEED = 750; // Pixels per second hook extends
const HOOK_CHECK_INTERVAL = 25; // How often to check for collision during hook extension (milliseconds) - Smaller is more precise but more CPU.

// Respawn Delay (Server-Side)
const RESPAWN_DELAY_MS = 2000; // 2 seconds

// --- NEW GAME WINNING CONDITION ---
const WINNING_SCORE = 2; // Player needs to score 2 points to win

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

  socket.on("createRoom", ({ roomCode, name }) => {
    if (rooms[roomCode]) {
      socket.emit("roomError", "Room with this code already exists.");
      return;
    }

    socket.join(roomCode);
    socket.roomCode = roomCode;
    rooms[roomCode] = [socket.id];
    players[socket.id] = {
      score: 0,
      isRespawning: false,
      name: name || "Host",
    };

    socket.emit("roomCreated", roomCode);

    const playerList = rooms[roomCode].map((id) => ({
      id,
      name: players[id]?.name || id,
    }));
    io.to(roomCode).emit("updatePlayerList", playerList);
  });

  socket.on("joinRoom", ({ roomCode, name }) => {
    const room = rooms[roomCode];
    if (!room) {
      console.log(
        `⚠️ Room ${roomCode} does not exist. User ${socket.id} tried to join.`
      );
      socket.emit("roomError", "Room does not exist.");
      return;
    }
    // Allow up to 4 players
    if (room.length >= 4) {
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
    players[socket.id] = {
      score: 0,
      isRespawning: false,
      name: name || "Anonymous",
    };
    const playerList = rooms[roomCode].map((id) => ({
      id,
      name: players[id]?.name || id,
    }));
    io.to(roomCode).emit("updatePlayerList", playerList);
    console.log(`➕ User ${socket.id} joined room: ${roomCode}`);

    if (rooms[roomCode].length === 2) {
      console.log(`🎮 Two players in room ${roomCode}. Starting game...`);

      const playerIds = rooms[roomCode];
      const spawnPositions = {};

      // Setup bounds and spawn positions for 2 players
      players[playerIds[0]].bounds = {
        left: 0,
        top: 0,
        right: GAME_WIDTH,
        bottom: GAME_HEIGHT / 2 - PLAYER_SIZE,
      };
      spawnPositions[playerIds[0]] = {
        x:
          Math.floor(
            Math.random() *
              (players[playerIds[0]].bounds.right -
                players[playerIds[0]].bounds.left)
          ) +
          players[playerIds[0]].bounds.left +
          PLAYER_SIZE / 2,
        y:
          Math.floor(
            Math.random() *
              (players[playerIds[0]].bounds.bottom -
                players[playerIds[0]].bounds.top)
          ) +
          players[playerIds[0]].bounds.top +
          PLAYER_SIZE / 2,
      };

      players[playerIds[1]].bounds = {
        left: 0,
        top: GAME_HEIGHT / 2,
        right: GAME_WIDTH,
        bottom: GAME_HEIGHT - PLAYER_SIZE,
      };
      spawnPositions[playerIds[1]] = {
        x:
          Math.floor(
            Math.random() *
              (players[playerIds[1]].bounds.right -
                players[playerIds[1]].bounds.left)
          ) +
          players[playerIds[1]].bounds.left +
          PLAYER_SIZE / 2,
        y:
          Math.floor(
            Math.random() *
              (players[playerIds[1]].bounds.bottom -
                players[playerIds[1]].bounds.top)
          ) +
          players[playerIds[1]].bounds.top +
          PLAYER_SIZE / 2,
      };

      playerIds.forEach((id) => {
        players[id].lastPosition = spawnPositions[id];
        console.log(
          `Player ${id} spawn at (${spawnPositions[id].x}, ${spawnPositions[id].y})`
        );
      });

      io.to(roomCode).emit("startGame", {
        players: playerIds,
        positions: spawnPositions,
      });
    }
  });

  socket.on("playerMove", ({ id, x, y }) => {
    const room = socket.roomCode;
    if (!room) return;

    const player = players[id];
    if (player && player.bounds && !player.isRespawning) {
      // Incoming x,y are sprite centers. Convert to top-left for clamping against bounds.
      const clampedX = x - PLAYER_SIZE / 2;

      const clampedY = Math.max(
        player.bounds.top,
        Math.min(y - PLAYER_SIZE / 2, player.bounds.bottom)
      );

      // Convert back to center for storing and emitting
      player.lastPosition = {
        x: clampedX + PLAYER_SIZE / 2,
        y: clampedY + PLAYER_SIZE / 2,
      };

      // Emit to all others in the room
      socket.to(room).emit("playerMove", {
        id,
        x: player.lastPosition.x,
        y: player.lastPosition.y,
      });
    } else if (player && player.isRespawning) {
      console.log(`🚫 Player ${id} tried to move while respawning. Ignoring.`);
    } else {
      console.log(
        `❓ Player ${id} not found or missing bounds. Current players:`,
        Object.keys(players)
      );
    }
  });

  socket.on("hookFired", ({ playerId, targetX, targetY }) => {
    const room = socket.roomCode;
    if (!room) return;

    // Check if the game is already over in this room
    if (rooms[room] && rooms[room].gameOver) {
      console.log(`🚫 Game already over in room ${room}. Hook ignored.`);
      io.to(playerId).emit("hookMiss", playerId); // Inform the player their hook missed as the game is over
      return;
    }

    const player = players[playerId];
    if (!player || !player.lastPosition) {
      console.log("Hook fired with missing player data (caster).");
      io.to(playerId).emit("hookMiss", playerId);
      return;
    }

    const startX = player.lastPosition.x;
    const startY = player.lastPosition.y;

    const hookAngle = Math.atan2(targetY - startY, targetX - startX);

    // Find all *other* players in the room who are not respawning
    const potentialTargets = rooms[room].filter(
      (id) => id !== playerId && !players[id]?.isRespawning
    );

    let hookedId = null;

    io.to(room).emit("hookStarted", {
      playerId,
      startX,
      startY,
      hookAngle,
      hookLength: HOOK_LEN,
      hookSpeed: HOOK_SPEED,
    });

    let currentHookLength = 0;
    const hookInterval = setInterval(() => {
      // Re-check game over status inside interval to stop early if needed
      if (rooms[room] && rooms[room].gameOver) {
        clearInterval(hookInterval);
        console.log(`🚫 Game ended during hook in room ${room}. Hook aborted.`);
        io.to(playerId).emit("hookMiss", playerId);
        return;
      }

      currentHookLength += (HOOK_SPEED * HOOK_CHECK_INTERVAL) / 1000;

      if (currentHookLength > HOOK_LEN) {
        clearInterval(hookInterval);
        console.log(`❌ Hook MISS by ${playerId} (max length reached)`);
        io.to(playerId).emit("hookMiss", playerId);
        return;
      }

      const hookTipX = startX + Math.cos(hookAngle) * currentHookLength;
      const hookTipY = startY + Math.sin(hookAngle) * currentHookLength;

      for (const targetPlayerId of potentialTargets) {
        const targetPlayer = players[targetPlayerId];
        if (!targetPlayer || !targetPlayer.lastPosition) continue;

        const oppPos = targetPlayer.lastPosition; // This is the opponent's center
        const half = PLAYER_SIZE / 2;
        const oppRect = {
          left: oppPos.x - half,
          right: oppPos.x + half,
          top: oppPos.y - half,
          bottom: oppPos.y + half,
        };

        const hit = pointInRect(hookTipX, hookTipY, oppRect);

        if (hit) {
          hookedId = targetPlayerId;
          clearInterval(hookInterval);

          io.to(room).emit("hookHit", {
            by: playerId, // This is the hooker
            target: hookedId, // This is the hooked
            pullTo: { x: player.lastPosition.x, y: player.lastPosition.y }, // Pull to caster's CURRENT position
          });

          console.log(`🎯 Hook HIT by ${playerId} on ${hookedId}`);

          players[playerId].score += 1;
          console.log(
            `🎉 Player ${playerId} scored! New score: ${players[playerId].score}`
          );

          // Broadcast score update for the hooker
          io.to(room).emit("scoreUpdated", {
            playerId: playerId,
            score: players[playerId].score,
          });

          // --- WINNING LOGIC CHECK ---
          if (
            players[playerId].score >= WINNING_SCORE &&
            !rooms[room].gameOver // prevent duplicate triggers
          ) {
            rooms[room].gameOver = true;
            io.to(room).emit("gameOver", {
              winnerId: playerId,
              winnerName: players[playerId].name,
            });
            console.log(`🏆 Player ${playerId} won the game in room ${room}!`);

            setTimeout(() => {
              io.to(room).emit("gameReset");
              rooms[room].forEach((id) => {
                if (players[id]) delete players[id];
              });
              delete rooms[room];
              console.log(`♻️ Game state for room ${room} reset.`);
            }, 5000);
          }

          // Set opponent's status to respawning if game isn't over
          players[hookedId].isRespawning = true;
          io.to(hookedId).emit("startRespawnCountdown", { target: hookedId });

          setTimeout(() => {
            const hookedPlayerBounds = players[hookedId].bounds;
            // Respawn within their assigned bounds.
            // Calculate random top-left position, then convert to center.
            const respawnBodyX =
              Math.floor(
                Math.random() *
                  (hookedPlayerBounds.right - hookedPlayerBounds.left)
              ) + hookedPlayerBounds.left;
            const respawnBodyY =
              Math.floor(
                Math.random() *
                  (hookedPlayerBounds.bottom - hookedPlayerBounds.top)
              ) + hookedPlayerBounds.top;

            // Convert to center for lastPosition and emit
            players[hookedId].lastPosition = {
              x: respawnBodyX + PLAYER_SIZE / 2,
              y: respawnBodyY + PLAYER_SIZE / 2,
            };
            players[hookedId].isRespawning = false;

            io.to(room).emit("respawn", {
              x: players[hookedId].lastPosition.x,
              y: players[hookedId].lastPosition.y,
              target: hookedId,
            });

            console.log(
              `♻️ Player ${hookedId} respawned at (${players[hookedId].lastPosition.x}, ${players[hookedId].lastPosition.y})`
            );
          }, RESPAWN_DELAY_MS);
          break; // Exit loop after first hit
        }
      }
    }, HOOK_CHECK_INTERVAL);
  });

  socket.on("blinkFired", ({ playerId, newX, newY }) => {
    const room = socket.roomCode;
    if (!room) {
      console.log(`🚫 Blink fired by ${playerId} without a room.`);
      return;
    }
    // Prevent blink if game is over
    if (rooms[room] && rooms[room].gameOver) {
      console.log(`🚫 Game already over in room ${room}. Blink ignored.`);
      return;
    }

    const player = players[playerId];
    if (player && player.bounds && !player.isRespawning) {
      // Incoming newX, newY are sprite centers. Convert to top-left for clamping.
      const clampedBodyX = Math.max(
        player.bounds.left,
        Math.min(newX - PLAYER_SIZE / 2, player.bounds.right)
      );
      const clampedBodyY = Math.max(
        player.bounds.top,
        Math.min(newY - PLAYER_SIZE / 2, player.bounds.bottom)
      );

      // Convert back to center for storing and emitting
      player.lastPosition = {
        x: clampedBodyX + PLAYER_SIZE / 2,
        y: clampedBodyY + PLAYER_SIZE / 2,
      };
      console.log(
        `✨ Player ${playerId} blinked to (${player.lastPosition.x}, ${player.lastPosition.y}) (clamped)`
      );
      io.to(room).emit("blinkEffect", {
        playerId,
        newX: player.lastPosition.x,
        newY: player.lastPosition.y,
      });
    } else if (player && player.isRespawning) {
      console.log(
        `🚫 Player ${playerId} tried to blink while respawning. Ignoring.`
      );
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
    // Prevent shift if game is over
    if (rooms[room] && rooms[room].gameOver) {
      console.log(`🚫 Game already over in room ${room}. Shift ignored.`);
      return;
    }

    const player = players[playerId];
    if (player && !player.isRespawning) {
      console.log(`👻 Player ${playerId} activated Shift.`);
      io.to(room).emit("shiftEffect", { playerId });
    } else if (player && player.isRespawning) {
      console.log(
        `🚫 Player ${playerId} tried to shift while respawning. Ignoring.`
      );
    }
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
      // If the game is already over in this room, just remove the player
      if (rooms[room].gameOver) {
        rooms[room] = rooms[room].filter((id) => id !== socket.id);
        console.log(
          `➖ User ${socket.id} disconnected from finished room ${room}. Remaining: ${rooms[room].length}`
        );
        if (rooms[room].length === 0) {
          delete rooms[room];
          console.log(`🗑️ Room ${room} is empty and deleted.`);
        }
      } else {
        rooms[room] = rooms[room].filter((id) => id !== socket.id);
        console.log(
          `➖ User ${socket.id} left room ${room}. Remaining: ${rooms[room].length}`
        );

        if (rooms[room].length === 0) {
          delete rooms[room];
          console.log(`🗑️ Room ${room} is empty and deleted.`);
        } else {
          const playerList = rooms[room].map((id) => ({
            id,
            name: players[id]?.name || id,
          }));
          io.to(room).emit("updatePlayerList", playerList);

          // If a player disconnects and less than 4 players remain, end the game
          if (rooms[room].length < 2 && rooms[room].length > 0) {
            rooms[room].gameOver = true; // Set game over flag
            io.to(room).emit(
              "opponentDisconnected",
              `An opponent has disconnected. Game ended for room ${room}.`
            );
            rooms[room].forEach((id) => {
              delete players[id];
            });
            delete rooms[room];
            console.log(`💔 Game ended in room ${room} due to disconnect.`);
          }
        }
      }
    }
    delete players[socket.id];
  });
});

server.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
