import Phaser from 'phaser';

/** Blends a color toward mid-grey by `amount` (0-1). Used for the finished-pair treatment. */
export function desaturate(color: number, amount = 0.6): number {
  const c = Phaser.Display.Color.IntegerToColor(color);
  const grey = (c.red + c.green + c.blue) / 3;
  const r = Phaser.Math.Linear(c.red, grey, amount);
  const g = Phaser.Math.Linear(c.green, grey, amount);
  const b = Phaser.Math.Linear(c.blue, grey, amount);
  return Phaser.Display.Color.GetColor(r, g, b);
}

/** Blends a color toward black by `amount` (0-1). Used to keep strokes/lines legible on the light background. */
export function darken(color: number, amount = 0.25): number {
  const c = Phaser.Display.Color.IntegerToColor(color);
  const r = Phaser.Math.Linear(c.red, 0, amount);
  const g = Phaser.Math.Linear(c.green, 0, amount);
  const b = Phaser.Math.Linear(c.blue, 0, amount);
  return Phaser.Display.Color.GetColor(r, g, b);
}
