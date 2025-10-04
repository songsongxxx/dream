// ===== Config =====
const INTRO_REDIRECT_URL = "/main";
const NATIVE_W = 1280;
const NATIVE_H = 720;

// ===== Elements =====
const wrap          = document.querySelector(".game-wrap");
const iframe        = document.getElementById("introGame");
const loader        = document.getElementById("loader");
const focusOverlay  = document.getElementById("focusOverlay");
const btnFullscreen = document.getElementById("btnFullscreen");

// Scale the native 1290x720 game to fit the .game-wrap box
function scaleIframeToFit() {
  if (!wrap || !iframe) return;
  const w = wrap.clientWidth;
  const h = wrap.clientHeight;
  const scale = Math.min(w / NATIVE_W, h / NATIVE_H);
  iframe.style.transform = `translate(-50%, -50%) scale(${scale})`;
}

document.addEventListener("DOMContentLoaded", () => {
  // Center/scale initially and when the box changes
  const ro = new ResizeObserver(scaleIframeToFit);
  if (wrap) ro.observe(wrap);
  window.addEventListener("resize", scaleIframeToFit);
  window.addEventListener("orientationchange", scaleIframeToFit);
  scaleIframeToFit();

  // Start ONLY after clicking: set the iframe src on click
  async function startGame() {
    // Hide the button, show the loader
    focusOverlay?.classList.add("hidden");
    loader?.classList.remove("hidden");

    // Set the real src now (this is when the game actually starts loading)
    const url = iframe.getAttribute("data-src");
    if (!url) return;
    // Wait for the load to complete before enabling interaction
    iframe.addEventListener("load", () => {
      loader?.classList.add("hidden");
      // allow interaction + focus the game
      iframe.style.pointerEvents = "auto";
      try { iframe.contentWindow?.focus?.(); } catch {}
      scaleIframeToFit();
    }, { once: true });
    iframe.setAttribute("src", url);
  }

  // Click / keyboard to start
  focusOverlay?.addEventListener("click", startGame);
  focusOverlay?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      startGame();
    }
  });

  // Listen for "intro finished" → redirect
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
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await wrap.requestFullscreen();
    } catch (err) { console.warn("Fullscreen not available:", err); }
  });
});


