import Phaser from 'phaser';
import './style.css';
import { MenuScene } from './scenes/MenuScene';
import { MatchScene } from './scenes/MatchScene';
import { AudioManager } from './audio/AudioManager';

// Disable double-tap zoom, pinch zoom, pull-to-refresh, and the long-press
// context menu so toddler taps never trigger browser chrome instead of the game.
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());

// Browsers block AudioContext creation/resume before a genuine user gesture.
// A capture-phase document listener fires before any scene's own tap
// handler (which may itself want to play a sound on that same gesture), so
// unlock() always wins the race regardless of which element is tapped first.
document.addEventListener('pointerdown', () => AudioManager.unlock(), { capture: true, once: true });

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
  // MenuScene first = the auto-started entry point; MatchScene is only ever
  // started explicitly (from a menu card tap) with a theme via init data.
  scene: [MenuScene, MatchScene],
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
