/*:
 * @target MZ
 * @plugindesc Disable Game Over screen and redirect page instead.
 * @author You
 *
 * @param RedirectURL
 * @text Redirect URL
 * @desc Where the page should go when the game ends (Game Over).
 * @default /
 *
 * @help
 * This plugin prevents the Game Over screen from showing.
 * Instead, it redirects the entire page (or the parent page if embedded).
 *
 * Example:
 *   RedirectURL = https://your-site.com/main
 */

(() => {
  const parameters = PluginManager.parameters("NoGameOverRedirect");
  const redirectUrl = parameters["RedirectURL"] || "/";

  Scene_Gameover.prototype.start = function() {
    Scene_Base.prototype.start.call(this);
    try {
      // Notify parent page if inside iframe
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: "rmmz-gameover", url: redirectUrl }, "*");
      }
    } catch (e) {
      console.warn("NoGameOverRedirect postMessage failed:", e);
    }

    try {
      // Redirect this frame or top page
      if (window.top && window.top !== window) {
        window.top.location.href = redirectUrl;
      } else {
        window.location.href = redirectUrl;
      }
    } catch (e) {
      console.error("NoGameOverRedirect navigation failed:", e);
    }
  };
})();
