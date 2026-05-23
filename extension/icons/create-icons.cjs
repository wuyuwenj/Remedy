#!/usr/bin/env node
// Remedy — Icon Generator
// Run: node create-icons.js
// Requires: npm install canvas

const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const sizes = [16, 48, 128];

for (const size of sizes) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const s = size / 128; // scale factor

  // Background — rounded rect
  const radius = Math.round(size * 0.19);
  roundRect(ctx, 0, 0, size, size, radius);
  ctx.fillStyle = '#09090b';
  ctx.fill();

  // Gradient stroke for the R+checkmark
  const grad = ctx.createLinearGradient(0, size, size, 0);
  grad.addColorStop(0, '#0284c7');
  grad.addColorStop(0.5, '#6366f1');
  grad.addColorStop(1, '#059669');

  ctx.save();
  ctx.translate(20 * s, 14 * s);
  ctx.scale(1.8 * s, 1.8 * s);

  ctx.strokeStyle = grad;
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // R vertical + top
  ctx.beginPath();
  ctx.moveTo(14, 50);
  ctx.lineTo(14, 14);
  ctx.lineTo(26, 14);
  ctx.stroke();

  // R curve (approximate the arc)
  ctx.beginPath();
  ctx.moveTo(26, 14);
  ctx.arc(26, 26, 12, -Math.PI / 2, Math.PI / 2);
  ctx.stroke();

  // R middle bar
  ctx.beginPath();
  ctx.moveTo(14, 38);
  ctx.lineTo(26, 38);
  ctx.stroke();

  // Checkmark leg from R
  ctx.beginPath();
  ctx.moveTo(22, 38);
  ctx.lineTo(32, 48);
  ctx.lineTo(50, 16);
  ctx.stroke();

  // Green dot
  ctx.fillStyle = '#059669';
  ctx.beginPath();
  ctx.arc(50, 16, 4.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

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
