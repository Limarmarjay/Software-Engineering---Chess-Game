const loginTab = document.getElementById("tab-login");
const signupTab = document.getElementById("tab-signup");
const loginForm = document.getElementById("login-form");
const signupForm = document.getElementById("signup-form");
const errorEl = document.getElementById("auth-error");

function showLogin() {
    loginTab.classList.add("active");
    signupTab.classList.remove("active");
    loginForm.hidden = false;
    signupForm.hidden = true;
    errorEl.textContent = "";
}

function showSignup() {
    signupTab.classList.add("active");
    loginTab.classList.remove("active");
    signupForm.hidden = false;
    loginForm.hidden = true;
    errorEl.textContent = "";
}

loginTab.addEventListener("click", showLogin);
signupTab.addEventListener("click", showSignup);

async function submitAuth(path, username, password) {
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
}

loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const username = document.getElementById("login-username").value;
    const password = document.getElementById("login-password").value;
    submitAuth("/api/login", username, password);
});

signupForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const username = document.getElementById("signup-username").value;
    const password = document.getElementById("signup-password").value;
    submitAuth("/api/signup", username, password);
});
