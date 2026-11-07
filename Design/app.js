const API_BASE = ""; // same origin: the Flask app serves this page and the API

const PIECE_SYMBOLS = {
    white: { pawn: "♙", rook: "♖", knight: "♘", bishop: "♗", queen: "♕", king: "♔" },
    black: { pawn: "♟", rook: "♜", knight: "♞", bishop: "♝", queen: "♛", king: "♚" },
};

const PROMOTION_LABELS = { queen: "Queen", rook: "Rook", bishop: "Bishop", knight: "Knight" };

const BACK_RANK_TYPES = ["rook", "knight", "bishop", "queen", "king", "bishop", "knight", "rook"];

// Static starting position, shown immediately so the board is never empty,
// even before (or without) a connection to the backend.
function buildStartingState() {
    const rows = Array.from({ length: 8 }, () => Array(8).fill(null));
    for (let column = 0; column < 8; column++) {
        rows[0][column] = { color: "black", type: BACK_RANK_TYPES[column], move_count: 0 };
        rows[1][column] = { color: "black", type: "pawn", move_count: 0 };
        rows[6][column] = { color: "white", type: "pawn", move_count: 0 };
        rows[7][column] = { color: "white", type: BACK_RANK_TYPES[column], move_count: 0 };
    }
    return { board: rows, turn: "white", started: false, time_remaining: { white: 600, black: 600 } };
}

const board = document.getElementById("chessboard");
const statusEl = document.getElementById("status");
const whiteClockEl = document.getElementById("white-clock");
const blackClockEl = document.getElementById("black-clock");
const accountBarEl = document.getElementById("account-bar");
const seatButtonsEl = document.getElementById("seat-buttons");
const seatHintEl = document.getElementById("seat-hint");
const gameActionsEl = document.getElementById("game-actions");

for (let row = 0; row < 8; row++) {
    for (let column = 0; column < 8; column++) {
        const square = document.createElement("div");
        square.classList.add("square");
        square.dataset.row = row;
        square.dataset.column = column;

        if ((row + column) % 2 === 0) {
            square.classList.add("light");
        } else {
            square.classList.add("dark");
        }

        square.addEventListener("click", () => onSquareClick(row, column));
        board.appendChild(square);
    }
}

const squares = document.querySelectorAll(".square");

function getSquare(row, column) {
    return squares[row * 8 + column];
}

let currentState = null; // last board state received from the server
let selected = null; // { row, column } of the currently selected piece
let legalMoves = []; // [[row, column], ...] destinations for the selection
let clockTickHandle = null;
let gameplayMode = false; // true once a live connection to the backend is confirmed
let mySession = { username: null, color: null, players: { white: null, black: null } };

async function apiGet(path) {
    const response = await fetch(`${API_BASE}${path}`);
    return response.json();
}

async function apiPost(path, body) {
    const response = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const data = await response.json();
    return { ok: response.ok, data };
}

function render(state) {
    currentState = state;

    for (let row = 0; row < 8; row++) {
        for (let column = 0; column < 8; column++) {
            const piece = state.board[row][column];
            const square = getSquare(row, column);
            square.textContent = piece ? PIECE_SYMBOLS[piece.color][piece.type] : "";
        }
    }

    highlightSelection();
    renderStatus();
    renderSeatHint();
    renderGameActions();
    syncClocks(state.time_remaining);
}

function highlightSelection() {
    squares.forEach((square) => {
        square.classList.remove("selected", "legal-move");
    });

    if (selected) {
        getSquare(selected.row, selected.column).classList.add("selected");
    }
    legalMoves.forEach(([row, column]) => {
        getSquare(row, column).classList.add("legal-move");
    });
}

function renderStatus(message, isError = false) {
    if (message) {
        statusEl.textContent = message;
        statusEl.classList.toggle("error", isError);
        return;
    }

    statusEl.classList.remove("error");
    if (currentState.resigned) {
        const loser = currentState.resigned === "white" ? "White" : "Black";
        const winner = currentState.resigned === "white" ? "Black" : "White";
        statusEl.textContent = `${loser} resigned. ${winner} wins!`;
        return;
    }
    const turnLabel = currentState.turn === "white" ? "White" : "Black";
    statusEl.textContent = `${turnLabel}'s turn`;
}

function formatTime(seconds) {
    const total = Math.max(0, Math.ceil(seconds));
    const minutes = Math.floor(total / 60);
    const secs = total % 60;
    return `${minutes}:${String(secs).padStart(2, "0")}`;
}

const SVG_NS = "http://www.w3.org/2000/svg";
const RING_RADIUS = 44;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;
let clockTotal = 600; // largest time seen: the full ring. Grows if a longer game starts.

function svgEl(tag, attrs) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
    return node;
}

// A minimal analog clock (draining ring plus two hands) beside the digital time.
function buildClockFace(el) {
    const svg = svgEl("svg", { viewBox: "0 0 100 100", class: "analog-clock", "aria-hidden": "true" });
    svg.append(
        svgEl("circle", { cx: 50, cy: 50, r: RING_RADIUS, class: "clock-ring-track" }),
        svgEl("circle", {
            cx: 50, cy: 50, r: RING_RADIUS, class: "clock-ring",
            "stroke-dasharray": RING_LENGTH, transform: "rotate(-90 50 50)",
        }),
    );
    const minuteHand = svgEl("line", { x1: 50, y1: 50, x2: 50, y2: 24, class: "clock-minute" });
    const secondHand = svgEl("line", { x1: 50, y1: 50, x2: 50, y2: 16, class: "clock-second" });
    svg.append(minuteHand, secondHand);

    const digital = document.createElement("span");
    digital.className = "clock-digital";
    el.replaceChildren(svg, digital);
    el._face = { ring: svg.querySelector(".clock-ring"), minuteHand, secondHand, digital };
}

function updateClockFace(el, seconds) {
    if (!el._face) buildClockFace(el);
    clockTotal = Math.max(clockTotal, seconds);
    const { ring, minuteHand, secondHand, digital } = el._face;
    digital.textContent = formatTime(seconds);
    ring.setAttribute("stroke-dashoffset", RING_LENGTH * (1 - seconds / clockTotal));
    minuteHand.setAttribute("transform", `rotate(${(seconds % 3600) / 3600 * 360} 50 50)`);
    secondHand.setAttribute("transform", `rotate(${(seconds % 60) / 60 * 360} 50 50)`);
}

// The Python server owns the official time. This only animates the display.
function syncClocks(timeRemaining) {
    if (clockTickHandle !== null) clearInterval(clockTickHandle);

    const snapshot = {
        white: Number(timeRemaining.white),
        black: Number(timeRemaining.black)
    };
    const snapshotAt = performance.now();

    function drawClock() {
        const elapsed = (performance.now() - snapshotAt) / 1000;
        const running = gameplayMode && currentState.started && !currentState.resigned;
        const remaining = {
            white: Math.max(0, snapshot.white - (running && currentState.turn === "white" ? elapsed : 0)),
            black: Math.max(0, snapshot.black - (running && currentState.turn === "black" ? elapsed : 0))
        };

        for (const color of ["white", "black"]) {
            const el = color === "white" ? whiteClockEl : blackClockEl;
            updateClockFace(el, remaining[color]);
            el.classList.toggle("active", running && currentState.turn === color && remaining[color] > 0);
            el.classList.toggle("time-up", running && remaining[color] <= 0);
            el.classList.toggle("low-time", running && remaining[color] > 0 && remaining[color] <= 30);
        }

        if (running && remaining[currentState.turn] <= 0) {
            const winner = currentState.turn === "white" ? "Black" : "White";
            renderStatus(`${winner} wins on time!`);
        }
    }

    drawClock();
    // Redraw often for a smooth display; elapsed time is based on a monotonic clock.
    clockTickHandle = setInterval(drawClock, 200);
}

function clearSelection() {
    selected = null;
    legalMoves = [];
    highlightSelection();
}

async function onSquareClick(row, column) {
    if (!currentState || !gameplayMode || currentState.resigned) return;

    const piece = currentState.board[row][column];

    if (!selected) {
        if (piece && piece.color === currentState.turn) {
            selected = { row, column };
            const { moves } = await apiGet(`/api/legal-moves?row=${row}&col=${column}`);
            legalMoves = moves;
            highlightSelection();
        }
        return;
    }

    const isLegalDestination = legalMoves.some(([r, c]) => r === row && c === column);

    if (isLegalDestination) {
        await attemptMove(selected.row, selected.column, row, column);
        clearSelection();
        return;
    }

    if (piece && piece.color === currentState.turn) {
        selected = { row, column };
        const { moves } = await apiGet(`/api/legal-moves?row=${row}&col=${column}`);
        legalMoves = moves;
        highlightSelection();
        return;
    }

    clearSelection();
}

function promptForPromotion() {
    const choices = Object.entries(PROMOTION_LABELS)
        .map(([key, label], index) => `${index + 1}. ${label}`)
        .join("\n");
    const keys = Object.keys(PROMOTION_LABELS);

    while (true) {
        const answer = window.prompt(`Pawn promotion! Choose a piece:\n${choices}`, "1");
        if (answer === null) return null; // user cancelled
        const index = parseInt(answer, 10) - 1;
        if (index >= 0 && index < keys.length) {
            return keys[index];
        }
    }
}

async function attemptMove(fromRow, fromColumn, toRow, toColumn, promotion) {
    const body = { from: [fromRow, fromColumn], to: [toRow, toColumn] };
    if (promotion) body.promotion = promotion;

    const { ok, data } = await apiPost("/api/move", body);

    if (!ok) {
        if (data.error && data.error.includes("must promote") && !promotion) {
            const choice = promptForPromotion();
            if (choice) {
                await attemptMove(fromRow, fromColumn, toRow, toColumn, choice);
            }
            return;
        }
        renderStatus(data.error, true);
        return;
    }

    render(data.state);
    if (data.check) {
        renderStatus(`${data.state.turn === "white" ? "White" : "Black"} is in check!`);
    }
}

function renderAccountBar() {
    accountBarEl.replaceChildren();
    if (mySession.username) {
        const chip = document.createElement("span");
        chip.className = "user-chip";
        const initial = document.createElement("span");
        initial.className = "user-initial";
        initial.textContent = mySession.username.charAt(0).toUpperCase();
        const name = document.createElement("span");
        name.className = "user-name";
        name.textContent = mySession.username;
        chip.append(initial, name);

        const logout = document.createElement("button");
        logout.id = "logout-btn";
        logout.textContent = "Log out";
        logout.addEventListener("click", async () => {
            await apiPost("/api/logout", {});
            window.location.href = "/login";
        });
        accountBarEl.append(chip, logout);
    } else {
        accountBarEl.innerHTML = `<a href="/login">Log in / Sign up</a> to play`;
    }
}

function renderSeatHint() {
    if (!mySession.username) {
        seatHintEl.textContent = "";
    } else if (currentState && currentState.resigned) {
        seatHintEl.textContent = "This game is over. Start a new game to play again.";
    } else if (mySession.color) {
        seatHintEl.textContent = currentState && currentState.started
            ? "Game on. Click a piece, then a highlighted square to move."
            : "You're seated. Waiting for an opponent to take the other side…";
    } else if (mySession.players.white && mySession.players.black) {
        seatHintEl.textContent = "Both sides are taken, so you're watching this game.";
    } else {
        seatHintEl.textContent = "Choose a side to join the game.";
    }
}

function isTimeUp() {
    if (!currentState || !currentState.started) return false;
    return currentState.time_remaining.white <= 0 || currentState.time_remaining.black <= 0;
}

// Resign while a game is live and you're seated; offer a rematch once it's over.
function renderGameActions() {
    gameActionsEl.replaceChildren();
    if (!mySession.username || !currentState) return;

    const gameOver = Boolean(currentState.resigned) || isTimeUp();
    const button = document.createElement("button");

    if (gameOver) {
        button.className = "action-btn action-primary";
        button.textContent = "New game";
        button.addEventListener("click", async () => {
            const { ok, data } = await apiPost("/api/new-game", {});
            if (!ok) return renderStatus(data.error || "Couldn't start a new game.", true);
            clearSelection();
            render(data);
            await fetchSession();
        });
    } else if (mySession.color && currentState.started) {
        button.className = "action-btn action-danger";
        button.textContent = "Resign";
        button.addEventListener("click", async () => {
            if (!window.confirm("Resign this game? Your opponent will win.")) return;
            const { ok, data } = await apiPost("/api/resign", {});
            if (!ok) return renderStatus(data.error || "Couldn't resign.", true);
            clearSelection();
            render(data);
        });
    } else {
        return;
    }
    gameActionsEl.appendChild(button);
}

function seatCardLabels(color) {
    const holder = mySession.players[color];
    if (holder === mySession.username) return { title: `You're ${color}`, sub: "Your side", state: "mine" };
    if (holder) return { title: `${color} is taken`, sub: `Played by ${holder}`, state: "taken" };
    return { title: `Play as ${color}`, sub: "Open, click to join", state: "open" };
}

function renderSeatButtons() {
    seatButtonsEl.replaceChildren();
    renderSeatHint();
    renderGameActions();
    if (!mySession.username) return;

    ["white", "black"].forEach((color) => {
        const { title, sub, state } = seatCardLabels(color);
        const button = document.createElement("button");
        button.className = `seat-card seat-${state}`;

        const disc = document.createElement("span");
        disc.className = `seat-disc disc-${color}`;
        const text = document.createElement("span");
        text.className = "seat-text";
        const strong = document.createElement("strong");
        strong.textContent = title;
        const small = document.createElement("small");
        small.textContent = sub;
        text.append(strong, small);
        button.append(disc, text);

        if (state === "open") {
            button.addEventListener("click", async () => {
                const { ok, data } = await apiPost("/api/join", { color });
                if (ok) {
                    mySession.color = color;
                    mySession.players = data.players;
                    renderSeatButtons();
                    // Refresh from the server so `started` (and the clock) reflects
                    // whether both seats are now filled.
                    const state = await apiGet("/api/board");
                    render(state);
                } else {
                    renderStatus(data.error, true);
                }
            });
        } else {
            button.disabled = true;
        }
        seatButtonsEl.appendChild(button);
    });
}

async function fetchSession() {
    if (!gameplayMode) return;
    try {
        mySession = await apiGet("/api/session");
    } catch (err) {
        mySession = { username: null, color: null, players: { white: null, black: null } };
    }
    renderAccountBar();
    renderSeatButtons();
    if (currentState) syncClocks(currentState.time_remaining);
}

async function init() {
    // Show the standard starting position right away, before we know whether
    // the backend is reachable, so the board is never blank.
    render(buildStartingState());

    try {
        const state = await apiGet("/api/board");
        gameplayMode = true;
        render(state);
        await fetchSession();
    } catch (err) {
        gameplayMode = false;
    }
}

init();

// Refresh from the authoritative server so both browsers see moves and timeouts.
let boardRefreshInProgress = false;
setInterval(async () => {
    if (!gameplayMode || boardRefreshInProgress || document.hidden) return;
    boardRefreshInProgress = true;
    try {
        const session = await apiGet("/api/session");
        if (JSON.stringify(session) !== JSON.stringify(mySession)) {
            mySession = session;
            renderAccountBar();
            renderSeatButtons();
        }
        const state = await apiGet("/api/board");
        // Preserve an in-progress selection if the board and turn are unchanged.
        const changed = !currentState || state.turn !== currentState.turn ||
            JSON.stringify(state.board) !== JSON.stringify(currentState.board);
        if (changed) clearSelection();
        render(state);
    } catch (error) {
        // Keep the last known clock display if the server is temporarily unreachable.
    } finally {
        boardRefreshInProgress = false;
    }
}, 2000);
