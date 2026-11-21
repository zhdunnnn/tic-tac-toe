import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { fileURLToPath } from "node:url";
import path from "node:path";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
const publicDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");
const games = new Map();
const playerGames = new Map();
const port = process.env.PORT || 3000;

app.use(express.static(publicDirectory));

function createCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do {
    code = Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  } while (games.has(code));
  return code;
}

function gameState(game, socketId) {
  return {
    code: game.code,
    board: game.board,
    currentPlayer: game.currentPlayer,
    status: game.status,
    winner: game.winner,
    symbol: game.players.find((player) => player.socketId === socketId)?.symbol,
    playerCount: game.players.length,
  };
}

function sendGameState(game) {
  for (const player of game.players) {
    io.to(player.socketId).emit("game-state", gameState(game, player.socketId));
  }
}

function removeGame(game, departingSocketId) {
  for (const player of game.players) {
    playerGames.delete(player.socketId);
    if (player.socketId !== departingSocketId) {
      io.to(player.socketId).emit("opponent-left");
    }
  }
  games.delete(game.code);
}

function getWinner(board) {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];

  for (const [first, second, third] of lines) {
    if (board[first] && board[first] === board[second] && board[first] === board[third]) {
      return board[first];
    }
  }
  return null;
}

io.on("connection", (socket) => {
  socket.on("create-game", (acknowledge) => {
    const previousGame = games.get(playerGames.get(socket.id));
    if (previousGame) removeGame(previousGame, socket.id);

    const code = createCode();
    const game = {
      code,
      board: Array(9).fill(null),
      currentPlayer: "X",
      status: "waiting",
      winner: null,
      players: [{ socketId: socket.id, symbol: "X" }],
    };

    games.set(code, game);
    playerGames.set(socket.id, code);
    socket.join(code);
    acknowledge?.({ ok: true, state: gameState(game, socket.id) });
  });

  socket.on("join-game", (rawCode, acknowledge) => {
    const code = typeof rawCode === "string" ? rawCode.trim().toUpperCase() : "";
    const game = games.get(code);
    if (!game) {
      acknowledge?.({ ok: false, error: "No game was found with that code." });
      return;
    }
    if (game.status !== "waiting" || game.players.length !== 1) {
      acknowledge?.({ ok: false, error: "That game is already full." });
      return;
    }

    game.players.push({ socketId: socket.id, symbol: "O" });
    game.status = "playing";
    playerGames.set(socket.id, code);
    socket.join(code);
    sendGameState(game);
    acknowledge?.({ ok: true, state: gameState(game, socket.id) });
  });

  socket.on("make-move", (index, acknowledge) => {
    const code = playerGames.get(socket.id);
    const game = games.get(code);
    const player = game?.players.find((entry) => entry.socketId === socket.id);

    if (!game || !player || game.status !== "playing") {
      acknowledge?.({ ok: false, error: "This game is not currently active." });
      return;
    }
    if (!Number.isInteger(index) || index < 0 || index > 8 || game.board[index] !== null) {
      acknowledge?.({ ok: false, error: "That square is not available." });
      return;
    }
    if (player.symbol !== game.currentPlayer) {
      acknowledge?.({ ok: false, error: "It is not your turn." });
      return;
    }

    game.board[index] = player.symbol;
    const winner = getWinner(game.board);
    if (winner) {
      game.status = "finished";
      game.winner = winner;
    } else if (game.board.every(Boolean)) {
      game.status = "draw";
    } else {
      game.currentPlayer = game.currentPlayer === "X" ? "O" : "X";
    }
    sendGameState(game);
    acknowledge?.({ ok: true });
  });

  socket.on("play-again", (acknowledge) => {
    const game = games.get(playerGames.get(socket.id));
    if (!game || !game.players.some((player) => player.socketId === socket.id)) {
      acknowledge?.({ ok: false, error: "This game is no longer available." });
      return;
    }

    game.board = Array(9).fill(null);
    game.currentPlayer = "X";
    game.status = "playing";
    game.winner = null;
    sendGameState(game);
    acknowledge?.({ ok: true });
  });

  socket.on("leave-game", (acknowledge) => {
    const game = games.get(playerGames.get(socket.id));
    if (game) removeGame(game, socket.id);
    acknowledge?.({ ok: true });
  });

  socket.on("disconnect", () => {
    const code = playerGames.get(socket.id);
    const game = games.get(code);
    if (game) removeGame(game, socket.id);
    else playerGames.delete(socket.id);
  });
});

httpServer.listen(port, () => {
  console.log(`Tic-tac-toe server listening on http://localhost:${port}`);
});
