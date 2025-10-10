/*:
 * @target MZ
 * @plugindesc Skip the title screen and start directly on the map (safe boot).
 * @help No parameters.
 */
(() => {
  // Replace the "start normal game" step (which normally goes to Scene_Title)
  Scene_Boot.prototype.startNormalGame = function() {
    this.checkPlayerLocation();       // validates starting map & coords
    DataManager.setupNewGame();       // new game data
    SceneManager.goto(Scene_Map);     // straight to map
    this.updateDocumentTitle();
  };
})();
