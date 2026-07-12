import Phaser from 'phaser';

// Shared by the emoji RendererDef (renderers.ts) and SortScene's draggable
// items: Phaser Text objects rasterize their own internal canvas at
// resolution 1 by default, which reads visibly blurry once the whole scene
// is zoomed up for retina (see main.ts's Scale.NONE + zoom setup) — without
// setResolution(devicePixelRatio), emoji glyphs come out soft on retina
// screens even though the surrounding Graphics-drawn icons stay crisp.
export function createEmojiText(scene: Phaser.Scene, emoji: string, fontSizePx: number): Phaser.GameObjects.Text {
  const dpr = window.devicePixelRatio || 1;
  const text = scene.add.text(0, 0, emoji, { fontSize: `${Math.round(fontSizePx)}px` });
  text.setOrigin(0.5);
  text.setResolution(dpr);
  return text;
}
