/*=============================================================================*\
 * CTB HideMenuStatusWindow
 * Terms of Use:
 *  Free for commercial or non-commercial use
 *
/*=============================================================================*/
var CTB = CTB || {}; CTB.HideMenuStatusWindow  = CTB.HideMenuStatusWindow || {};
var Imported = Imported || {}; Imported["CTB.HideMenuStatusWindow"] = 1.00;
//=============================================================================//

/*:
 * @target MV
 * @plugindesc [RPG Maker MV] [Tier 1] [Version 1.00] [CT_Bolt - Hide Menu Status Window MV]
 * @author CT_Bolt 
 *
 * @help

 *
 */
//=============================================================================
//=============================================================================

(function ($_$) {	
	function getPluginParameters() {var a = document.currentScript || (function() { var b = document.getElementsByTagName('script'); return b[b.length - 1]; })(); return PluginManager.parameters(a.src.substring((a.src.lastIndexOf('/') + 1), a.src.indexOf('.js')));} $_$.params = getPluginParameters();
	
	$_$['Scene_Menu.prototype.createStatusWindow'] = Scene_Menu.prototype.createStatusWindow;
	Scene_Menu.prototype.createStatusWindow = function() {
		$_$['Scene_Menu.prototype.createStatusWindow'].apply(this, arguments);
		this._statusWindow.hide();
	};
	
})(CTB.HideMenuStatusWindow, this);

