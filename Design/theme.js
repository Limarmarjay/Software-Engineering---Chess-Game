// Light/dark toggle. Loaded in <head> so the saved theme applies before first paint.
(() => {
    "use strict";
    const KEY = "chess-theme";
    const root = document.documentElement;

    function saved() {
        try { return localStorage.getItem(KEY); } catch (_) { return null; }
    }

    // Monochrome line icons; they inherit the button's text color.
    const SVG_OPEN = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
        'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
    const ICONS = {
        sun: SVG_OPEN + '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4' +
            'M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
        moon: SVG_OPEN + '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>'
    };

    function apply(theme) {
        root.dataset.theme = theme;
        const button = document.getElementById("theme-toggle");
        if (button) {
            button.innerHTML = theme === "dark" ? ICONS.sun : ICONS.moon;
            button.setAttribute("aria-label", `Switch to ${theme === "dark" ? "light" : "dark"} mode`);
        }
    }

    const initial = saved() || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    apply(initial);

    document.addEventListener("DOMContentLoaded", () => {
        const button = document.createElement("button");
        button.id = "theme-toggle";
        button.type = "button";
        button.className = "theme-toggle";
        button.addEventListener("click", () => {
            const next = root.dataset.theme === "dark" ? "light" : "dark";
            try { localStorage.setItem(KEY, next); } catch (_) { /* storage blocked: still switch */ }
            apply(next);
        });
        const slot = document.getElementById("theme-slot");
        if (slot) { button.classList.add("in-nav"); slot.append(button); }
        else document.body.append(button);
        apply(root.dataset.theme);
    });
})();
