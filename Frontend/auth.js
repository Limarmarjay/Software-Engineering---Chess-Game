const loginTab = document.getElementById("tab-login");
const signupTab = document.getElementById("tab-signup");
const loginForm = document.getElementById("login-form");
const signupForm = document.getElementById("signup-form");
const errorEl = document.getElementById("auth-error");
const titleEl = document.getElementById("auth-title");
const subtitleEl = document.getElementById("auth-subtitle");
const footerTextEl = document.getElementById("footer-text");
const footerSwitchEl = document.getElementById("footer-switch");

// A small decorative position for the hero board: [row, column, glyph].
const HERO_PIECES = [
    [0, 2, "♝"], [0, 4, "♚"], [0, 7, "♜"], [1, 5, "♟"], [2, 3, "♞"],
    [4, 4, "♙"], [5, 2, "♘"], [6, 1, "♙"], [7, 3, "♕"], [7, 4, "♔"],
];

function buildHeroBoard() {
    const heroBoard = document.getElementById("hero-board");
    if (!heroBoard) return;
    const glyphs = new Map(HERO_PIECES.map(([row, column, glyph]) => [`${row},${column}`, glyph]));
    for (let row = 0; row < 8; row++) {
        for (let column = 0; column < 8; column++) {
            const square = document.createElement("div");
            square.className = `hero-sq ${(row + column) % 2 === 0 ? "light" : "dark"}`;
            square.textContent = glyphs.get(`${row},${column}`) || "";
            heroBoard.appendChild(square);
        }
    }
}

function showLogin() {
    loginTab.classList.add("active");
    signupTab.classList.remove("active");
    loginForm.hidden = false;
    signupForm.hidden = true;
    errorEl.textContent = "";
    titleEl.textContent = "Welcome back";
    subtitleEl.textContent = "Log in to pick a side and start playing.";
    footerTextEl.textContent = "New here?";
    footerSwitchEl.textContent = "Create an account";
    document.getElementById("login-username").focus();
}

function showSignup() {
    signupTab.classList.add("active");
    loginTab.classList.remove("active");
    signupForm.hidden = false;
    loginForm.hidden = true;
    errorEl.textContent = "";
    titleEl.textContent = "Create your account";
    subtitleEl.textContent = "It takes a few seconds. Your username is what your opponent sees.";
    footerTextEl.textContent = "Already have an account?";
    footerSwitchEl.textContent = "Log in";
    document.getElementById("signup-username").focus();
}

loginTab.addEventListener("click", showLogin);
signupTab.addEventListener("click", showSignup);
footerSwitchEl.addEventListener("click", () => (loginForm.hidden ? showLogin() : showSignup()));

document.querySelectorAll(".reveal-btn").forEach((button) => {
    button.addEventListener("click", () => {
        const input = document.getElementById(button.dataset.target);
        const reveal = input.type === "password";
        input.type = reveal ? "text" : "password";
        button.textContent = reveal ? "Hide" : "Show";
        button.setAttribute("aria-label", reveal ? "Hide password" : "Show password");
    });
});

async function submitAuth(form, path, username, password) {
    const submit = form.querySelector(".submit-btn");
    const label = submit.textContent;
    submit.disabled = true;
    submit.textContent = "Please wait…";
    errorEl.textContent = "";

    try {
        const response = await fetch(path, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
        });
        const data = await response.json();

        if (!response.ok) {
            errorEl.textContent = data.error || "Something went wrong.";
            return;
        }

        window.location.href = "/";
    } catch (err) {
        errorEl.textContent = "Can't reach the server. Is it running?";
    } finally {
        submit.disabled = false;
        submit.textContent = label;
    }
}

loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const username = document.getElementById("login-username").value;
    const password = document.getElementById("login-password").value;
    submitAuth(loginForm, "/api/login", username, password);
});

signupForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const username = document.getElementById("signup-username").value;
    const password = document.getElementById("signup-password").value;
    submitAuth(signupForm, "/api/signup", username, password);
});

buildHeroBoard();
document.getElementById("login-username").focus();
