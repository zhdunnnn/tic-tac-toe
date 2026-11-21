const socket = io();
const views = ["menu", "join-view", "waiting-view", "game-view"];
const connectionStatus = document.querySelector("#connection-status");
const errorMessage = document.querySelector("#error-message");
const boardElement = document.querySelector("#board");
function showView(viewId) {
  for (const id of views) {
    document.querySelector(`#${id}`).classList.toggle("hidden", id !== viewId);
  }
  errorMessage.textContent = "";
}

function showError(message) {
  errorMessage.textContent = message;
}

function handleResult(result, onSuccess) {
  if (!result?.ok) {
    showError(result?.error || "Something went wrong. Please try again.");
    return;
  }
  onSuccess?.(result.state);
}

function renderGame(state) {
  showView("game-view");
  document.querySelector("#active-game-code").textContent = state.code;
  boardElement.replaceChildren();

  for (let index = 0; index < state.board.length; index += 1) {
    const cell = document.createElement("button");
    cell.className = "cell";
    cell.type = "button";
    cell.setAttribute("role", "gridcell");
    cell.setAttribute("aria-label", state.board[index] || `Empty square ${index + 1}`);
    cell.textContent = state.board[index] || "";
    cell.disabled = state.status !== "playing" || state.currentPlayer !== state.symbol || Boolean(state.board[index]);
    cell.addEventListener("click", () => {
      socket.emit("make-move", index, (result) => {
        if (!result?.ok) showError(result?.error || "The move could not be made.");
      });
    });
    boardElement.append(cell);
  }

  const message = document.querySelector("#game-message");
  const playAgainButton = document.querySelector("#play-again-button");
  if (state.status === "finished") {
    message.textContent = state.winner === state.symbol ? "You win!" : "Your opponent wins.";
    playAgainButton.classList.remove("hidden");
  } else if (state.status === "draw") {
    message.textContent = "It's a draw!";
    playAgainButton.classList.remove("hidden");
  } else {
    message.textContent = state.currentPlayer === state.symbol ? "Your turn" : "Opponent's turn";
    playAgainButton.classList.add("hidden");
  }
}

socket.on("connect", () => {
  connectionStatus.textContent = "Connected";
});

socket.on("disconnect", () => {
  connectionStatus.textContent = "Disconnected — reconnecting...";
});

socket.on("game-state", renderGame);

socket.on("opponent-left", () => {
  showView("menu");
  showError("Your opponent left the game.");
});

document.querySelector("#create-button").addEventListener("click", () => {
  socket.emit("create-game", (result) => {
    handleResult(result, (state) => {
      document.querySelector("#game-code-display").textContent = state.code;
      showView("waiting-view");
    });
  });
});

document.querySelector("#show-join-button").addEventListener("click", () => {
  showView("join-view");
  document.querySelector("#game-code").focus();
});

document.querySelector("#back-button").addEventListener("click", () => showView("menu"));
document.querySelector("#waiting-menu-button").addEventListener("click", () => {
  socket.emit("leave-game", () => showView("menu"));
});

document.querySelector("#join-button").addEventListener("click", () => {
  const code = document.querySelector("#game-code").value;
  socket.emit("join-game", code, (result) => {
    handleResult(result, renderGame);
  });
});

document.querySelector("#game-code").addEventListener("keydown", (event) => {
  if (event.key === "Enter") document.querySelector("#join-button").click();
});

document.querySelector("#play-again-button").addEventListener("click", () => {
  socket.emit("play-again", (result) => {
    if (!result?.ok) showError(result?.error || "The game could not be restarted.");
  });
});

document.querySelector("#menu-button").addEventListener("click", () => {
  socket.emit("leave-game", () => showView("menu"));
});
