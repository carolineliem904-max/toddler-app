import Phaser from 'phaser';
import './style.css';
import { MatchScene } from './scenes/MatchScene';

// Disable double-tap zoom, pinch zoom, pull-to-refresh, and the long-press
// context menu so toddler taps never trigger browser chrome instead of the game.
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());

// Retina-safe scaling: Phaser.Scale.NONE + zoom. The canvas is sized to
// devicePixelRatio-multiplied device pixels and countered with
// zoom = 1/dpr, so it renders crisply on retina screens while its CSS
// display size still matches the viewport. As a result, all game/world
// coordinates in MatchScene are in device px, not CSS px (see MatchScene.px()).
const dpr = window.devicePixelRatio || 1;

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  backgroundColor: '#fff8ee',
  scale: {
    mode: Phaser.Scale.NONE,
    width: window.innerWidth * dpr,
    height: window.innerHeight * dpr,
    zoom: 1 / dpr,
  },
  scene: [MatchScene],
});

let resizeTimer: number | undefined;
function handleResize(): void {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    const currentDpr = window.devicePixelRatio || 1;
    game.scale.resize(window.innerWidth * currentDpr, window.innerHeight * currentDpr);
    game.scale.setZoom(1 / currentDpr);
  }, 200);
}

window.addEventListener('resize', handleResize);
window.addEventListener('orientationchange', handleResize);
