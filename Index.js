// ===== Config =====
const INTRO_REDIRECT_URL = "/main"; // your main page

// ===== DOM =====
const iframe       = document.getElementById("introGame");
const loader       = document.getElementById("loader");
const focusOverlay = document.getElementById("focusOverlay");
const btnFullscreen= document.getElementById("btnFullscreen");

// Make sure DOM is ready (works with/without `defer`)
document.addEventListener("DOMContentLoaded", () => {

  // When game iframe finishes loading, show the focus overlay
  iframe.addEventListener("load", () => {
    loader?.classList.add("hidden");
    focusOverlay?.classList.remove("hidden");
  });

  function activateGameFocus() {
    if (!focusOverlay) return;
    // hide overlay
    focusOverlay.classList.add("hidden");
    // let the iframe receive input
    iframe.style.pointerEvents = "auto";
    // move keyboard focus inside the game
    try { iframe.contentWindow?.focus(); } catch {}
  }

  // Click on the overlay button
  focusOverlay?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    activateGameFocus();
  });

  // Press Enter/Space to activate
  focusOverlay?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      activateGameFocus();
    }
  });

  // Safety: if the user clicks anywhere on the page, also activate
  document.addEventListener("click", (e) => {
    // If overlay is visible, consume the first click and activate
    if (!focusOverlay?.classList.contains("hidden")) {
      e.preventDefault();
      activateGameFocus();
    }
  }, { capture: true });

  // Listen for "intro finished" from the game
  window.addEventListener("message", (e) => {
    const data = e?.data;
    if (!data || typeof data !== "object") return;
    if (data.type === "rmmz-intro-finished") {
      const target = data.url || INTRO_REDIRECT_URL || "/";
      window.location.href = target;
    }
  });

  // Fullscreen toggle
  btnFullscreen?.addEventListener("click", async () => {
    const wrap = document.querySelector(".game-wrap");
    if (!wrap) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await wrap.requestFullscreen();
    } catch (err) {
      console.warn("Fullscreen not available:", err);
    }
  });
});
