/* Display-only player avatars. Load AFTER app.js. No gameplay globals used. */
(() => {
    "use strict";
    if (window.chessPlayerIconsLoaded) return;
    window.chessPlayerIconsLoaded = true;

    const CHOICES = ["king", "queen", "rook", "bishop", "knight", "pawn"];
    const SYMBOLS = {
        white: { king: "♔", queen: "♕", rook: "♖", bishop: "♗", knight: "♘", pawn: "♙" },
        black: { king: "♚", queen: "♛", rook: "♜", bishop: "♝", knight: "♞", pawn: "♟" }
    };
    const POLL_MS = 3000;
    const API = "/api/player-icons";
    const title = text => text.charAt(0).toUpperCase() + text.slice(1);
    let state = null;
    let saving = false;
    let reading = false;
    let generation = 0;
    let pollHandle = null;
    let controls;
    const seats = {};

    function element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function mountSeat(color) {
        const clock = document.getElementById(`${color}-clock`);
        if (!clock || !clock.parentNode) return;
        const wrapper = element("section", "pi-seat");
        wrapper.dataset.playerColor = color;
        wrapper.setAttribute("aria-label", `${title(color)} player`);
        const identity = element("div", "pi-identity");
        const avatar = element("span", "pi-avatar pi-neutral");
        avatar.setAttribute("role", "img");
        avatar.setAttribute("aria-label", `${title(color)} player icon loading`);
        const description = element("div", "pi-description");
        const label = element("span", "pi-side-label", `${title(color)} player`);
        const name = element("span", "pi-player-name", "Loading player…");
        const detail = element("span", "pi-player-detail", "");
        description.append(label, name, detail);
        identity.append(avatar, description);
        // Keep the icon OUTSIDE the clock: the timer replaces its own children.
        clock.before(wrapper);
        wrapper.append(identity, clock);
        seats[color] = { avatar, name, detail };
    }

    function mountPicker() {
        const panel = element("section", "pi-settings");
        panel.id = "player-icon-settings";
        panel.setAttribute("aria-labelledby", "pi-title");
        const heading = element("h2", "pi-heading", "Choose your player icon");
        heading.id = "pi-title";
        const hint = element("p", "pi-hint", "Your icon is just for display. It does not change your chess pieces.");
        const group = element("div", "pi-options");
        group.setAttribute("role", "group");
        group.setAttribute("aria-label", "Chess piece icons");
        const buttons = {};
        for (const piece of CHOICES) {
            const button = element("button", "pi-choice");
            button.type = "button";
            button.dataset.piece = piece;
            button.disabled = true;
            button.setAttribute("aria-pressed", "false");
            button.setAttribute("aria-label", `Use ${piece} as your player icon`);
            const glyph = element("span", "pi-choice-symbol", SYMBOLS.white[piece]);
            glyph.setAttribute("aria-hidden", "true");
            button.append(glyph, element("span", "pi-choice-name", title(piece)));
            button.addEventListener("click", () => saveIcon(piece));
            group.append(button);
            buttons[piece] = { button, glyph };
        }
        const message = element("p", "pi-message", "Loading icon preferences…");
        message.setAttribute("role", "status");
        message.setAttribute("aria-live", "polite");
        panel.append(heading, hint, group, message);
        const anchor = document.getElementById("seat-buttons") ||
            document.getElementById("account-bar") || document.getElementById("game-info");
        if (anchor) anchor.after(panel);
        else document.body.append(panel);
        controls = { panel, buttons, message };
    }

    function say(message, error = false) {
        controls.message.textContent = message;
        controls.message.classList.toggle("pi-error", error);
    }

    function draw() {
        for (const color of ["white", "black"]) {
            const nodes = seats[color];
            if (!nodes) continue;
            const person = state?.players?.[color];
            const kind = person?.kind || "empty";
            const human = kind === "human";
            const piece = CHOICES.includes(person?.icon) ? person.icon : "king";
            nodes.avatar.className = human ? `pi-avatar pi-${color}` : "pi-avatar pi-neutral";
            nodes.avatar.textContent = human ? SYMBOLS[color][piece] : "";
            nodes.avatar.setAttribute("aria-label", human
                ? `${title(color)} player icon: ${title(piece)}`
                : kind === "computer" ? "Computer: grey icon" : "Empty player seat: grey icon");
            nodes.name.textContent = human ? person.username :
                kind === "computer" ? "Computer" : "Waiting for player";
            nodes.detail.textContent = human && person.username === state?.username
                ? "You" : human ? `${title(piece)} icon` : kind === "computer" ? "Computer-controlled" : "Seat available";
        }
        const color = state?.color === "black" ? "black" : "white";
        for (const piece of CHOICES) {
            const { button, glyph } = controls.buttons[piece];
            const selected = Boolean(state?.username) && state.current_icon === piece;
            button.setAttribute("aria-pressed", String(selected));
            button.disabled = saving || !state?.username;
            glyph.textContent = SYMBOLS[color][piece];
        }
        controls.panel.setAttribute("aria-busy", String(saving));
    }

    async function requestJson(options = {}) {
        const abort = new AbortController();
        const timeout = setTimeout(() => abort.abort(), 8000);
        try {
            const response = await fetch(API, {
                credentials: "same-origin", cache: "no-store", ...options,
                signal: abort.signal
            });
            let data;
            try { data = await response.json(); }
            catch (_) { throw new Error("The icon service is unavailable. Check the Python setup."); }
            if (!response.ok) throw new Error(data.error || "Unable to update player icons.");
            if (!data || !data.players || !CHOICES.includes(data.current_icon)) {
                throw new Error("The icon service returned an unexpected response.");
            }
            return data;
        } finally {
            clearTimeout(timeout);
        }
    }

    async function refresh() {
        if (reading || saving || document.hidden) return;
        reading = true;
        const version = generation;
        try {
            const data = await requestJson();
            if (version !== generation || saving) return; // Ignore stale reads after a save.
            const previousUsername = state?.username;
            const recovering = controls.message.classList.contains("pi-error");
            state = data;
            draw();
            if (!state.username) say("Log in to choose your icon.");
            else if (previousUsername !== state.username || recovering) {
                say(`Your saved icon: ${title(state.current_icon)}. Click a piece to change it.`);
            }
        } catch (error) {
            if (version === generation && !saving) {
                say(state ? "Could not refresh icons. Keeping the last saved display; retrying."
                    : "Icons unavailable. Check that the new Python file is registered, then restart the server.", true);
            }
        } finally {
            reading = false;
        }
    }

    async function saveIcon(piece) {
        if (saving || !state?.username || !CHOICES.includes(piece)) return;
        if (state.current_icon === piece) {
            say(`${title(piece)} is already your saved icon.`);
            return;
        }
        saving = true;
        generation += 1;
        draw();
        say(`Saving ${title(piece)}…`);
        try {
            state = await requestJson({
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Player-Icon-CSRF": state.csrf_token },
                body: JSON.stringify({ icon: piece })
            });
            say(`Saved! Your player icon is now ${title(state.current_icon)}.`);
        } catch (error) {
            say(error.name === "AbortError" ? "The save timed out. Checking your saved icon on the next refresh."
                : error.message, true);
        } finally {
            saving = false;
            draw();
        }
    }

    function scheduleRefresh() {
        clearTimeout(pollHandle);
        pollHandle = setTimeout(async () => {
            await refresh();
            scheduleRefresh();
        }, POLL_MS);
    }

    function init() {
        if (!document.getElementById("white-clock") || !document.getElementById("black-clock")) {
            console.warn("Player icons need white-clock and black-clock elements.");
            return;
        }
        mountSeat("white");
        mountSeat("black");
        const info = document.getElementById("game-info");
        if (info) info.classList.add("pi-game-info");
        mountPicker();
        refresh().finally(scheduleRefresh);
        document.addEventListener("visibilitychange", () => {
            if (!document.hidden) refresh();
        });
        window.addEventListener("focus", () => refresh());
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
    else init();
})();
