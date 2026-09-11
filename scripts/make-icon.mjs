/**
 * Draws the extension icon: a receipt with a torn bottom edge on a dark
 * rounded square. Deliberately not Loyverse's own mark or palette, since this
 * is an unofficial project.
 *
 * No image dependencies. Renders at 4x and box-downsamples for anti-aliasing.
 * png-io.mjs is shared with the screen-recorder project.
 */
import { writeFileSync } from "node:fs";
import { encodePNG } from "./png-io.mjs";

const SIZE = 512;
const SS = 4; // supersampling factor
const BIG = SIZE * SS;

const BG = [0x14, 0x16, 0x1a];
const PAPER = [0xff, 0xff, 0xff];
const RULE = [0x9a, 0xa2, 0xae];
const ACCENT = [0x2e, 0xc4, 0x8d];

/** Signed-distance test for a rounded rectangle, in 0..1 unit space. */
function inRoundedRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

// Receipt body, in unit space. The torn edge is a run of triangular teeth.
const RX0 = 0.3;
const RX1 = 0.7;
const RY0 = 0.19;
const BODY_Y1 = 0.72;
const TEETH = 5;
const TOOTH_W = (RX1 - RX0) / TEETH;
const TOOTH_H = 0.055;

/** Body with rounded top corners and a square bottom, so the teeth attach flush. */
function inBody(x, y) {
  if (x < RX0 || x > RX1 || y < RY0 || y > BODY_Y1) return false;
  const r = 0.028;
  if (y >= RY0 + r) return true;
  const cx = Math.min(Math.max(x, RX0 + r), RX1 - r);
  const dx = x - cx;
  const dy = y - (RY0 + r);
  return dx * dx + dy * dy <= r * r;
}

function inReceipt(x, y) {
  if (inBody(x, y)) return true;
  if (y < BODY_Y1 || y > BODY_Y1 + TOOTH_H) return false;
  if (x < RX0 || x > RX1) return false;
  // Each tooth is a downward triangle: full width at the top, a point at the bottom.
  const local = ((x - RX0) % TOOTH_W) / TOOTH_W;
  const depth = 1 - Math.abs(local - 0.5) * 2;
  return y - BODY_Y1 <= depth * TOOTH_H;
}

/** Three ruled lines, with the top one shortened like a header. */
const RULES = [
  { y: 0.325, x0: 0.355, x1: 0.6 },
  { y: 0.425, x0: 0.355, x1: 0.645 },
  { y: 0.525, x0: 0.355, x1: 0.56 },
];

function sample(x, y) {
  if (!inRoundedRect(x, y, 0.02, 0.02, 0.98, 0.98, 0.22)) return null;
  if (!inReceipt(x, y)) return BG;

  for (const r of RULES) {
    if (y >= r.y && y <= r.y + 0.028 && x >= r.x0 && x <= r.x1) return RULE;
  }
  // Accent: the total line, sitting below the rules.
  if (y >= 0.605 && y <= 0.645 && x >= 0.355 && x <= 0.49) return ACCENT;
  return PAPER;
}

const acc = new Float32Array(SIZE * SIZE * 4);

for (let by = 0; by < BIG; by++) {
  const y = (by + 0.5) / BIG;
  for (let bx = 0; bx < BIG; bx++) {
    const x = (bx + 0.5) / BIG;
    const c = sample(x, y);
    const i = (Math.floor(by / SS) * SIZE + Math.floor(bx / SS)) * 4;
    if (c) {
      acc[i] += c[0];
      acc[i + 1] += c[1];
      acc[i + 2] += c[2];
      acc[i + 3] += 255;
    }
  }
}

const px = Buffer.alloc(SIZE * SIZE * 4);
const per = SS * SS;
for (let i = 0; i < SIZE * SIZE; i++) {
  const a = acc[i * 4 + 3] / per;
  // Un-premultiply so edge pixels keep their colour as alpha falls off.
  const scale = a > 0 ? 1 / (acc[i * 4 + 3] / 255) : 0;
  px[i * 4] = Math.round(acc[i * 4] * scale);
  px[i * 4 + 1] = Math.round(acc[i * 4 + 1] * scale);
  px[i * 4 + 2] = Math.round(acc[i * 4 + 2] * scale);
  px[i * 4 + 3] = Math.round(a);
}

writeFileSync("assets/icon.png", encodePNG(px, SIZE));
console.log(`assets/icon.png written (${SIZE}x${SIZE})`);
