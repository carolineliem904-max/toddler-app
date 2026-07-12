import type Phaser from 'phaser';

// Shared by both the geometric shape renderer and the object/destination icon
// renderer: a drawn item that can be repainted a new color in place (used for
// the finished-pair desaturate treatment) regardless of whether it's backed
// by a native Phaser Shape (Arc/Rectangle) or hand-drawn Graphics.
export interface ShapeHandle {
  gameObject: Phaser.GameObjects.GameObject;
  setFillStyle: (color: number) => void;
}
