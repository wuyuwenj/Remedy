#!/usr/bin/env node
// ============================================================
// Remedy — Icon Generator
// Generates PNG icons at 16x16, 48x48, and 128x128
// Run: node create-icons.js
// Requires: npm install canvas  (node-canvas)
// ============================================================

const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const sizes = [16, 48, 128];

for (const size of sizes) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Background — rounded rect
  const radius = Math.round(size * 0.2);
  roundRect(ctx, 0, 0, size, size, radius);
  ctx.fillStyle = '#6366f1';
  ctx.fill();

  // Subtle gradient overlay
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, 'rgba(129,140,248,0.4)');
  grad.addColorStop(1, 'rgba(79,70,229,0.4)');
  roundRect(ctx, 0, 0, size, size, radius);
  ctx.fillStyle = grad;
  ctx.fill();

  // Letter "R"
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fontSize = Math.round(size * 0.6);
  ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;
  ctx.fillText('R', size / 2, size / 2 + size * 0.03);

  // Save
  const buffer = canvas.toBuffer('image/png');
  const outPath = path.join(__dirname, `icon-${size}.png`);
  fs.writeFileSync(outPath, buffer);
  console.log(`Created ${outPath} (${buffer.length} bytes)`);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
