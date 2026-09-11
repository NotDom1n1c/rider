/* RIDER — bootstrap */
window.addEventListener('DOMContentLoaded', function () {
  const R = window.RIDER;
  R.Store.load();
  const canvas = document.getElementById('game-canvas');
  R.Game.init(canvas);
  R.UI.init();                 // sets Game.onEnd = UI.onGameEnd (only fires in real play)
  R.Game.start('menu', {});    // attract-mode background scene behind the menu
  R.Game.setHold(false);       // background bike just cruises & auto-levels; it can never crash
});
