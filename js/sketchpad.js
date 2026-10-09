// Historical context: see docs/CODEBASE_NOTES.md#jssketchpad-js-1-8

const LOGICAL_SIZE = 1000;

function toLogical(evt, canvasEl) {
  const rect = canvasEl.getBoundingClientRect();
  const x = ((evt.clientX - rect.left) / rect.width) * LOGICAL_SIZE;
  const y = ((evt.clientY - rect.top) / rect.height) * LOGICAL_SIZE;
  return { x: clamp(x), y: clamp(y) };
}

function clamp(v) {
  return Math.max(0, Math.min(LOGICAL_SIZE, v));
}

// Historical context: see docs/CODEBASE_NOTES.md#jssketchpad-js-23-29
export function attachDrawing(canvasEl, { getColor, getWidth, onStrokeStart, onStrokeMove, onStrokeComplete }) {
  let drawing = false;
  let points = [];

  function pointerDown(evt) {
    drawing = true;
    points = [toLogical(evt, canvasEl)];
    onStrokeStart?.(points);
    canvasEl.setPointerCapture(evt.pointerId);
  }

  function pointerMove(evt) {
    if (!drawing) return;
    points.push(toLogical(evt, canvasEl));
    onStrokeMove?.(points);
  }

  function pointerUp() {
    if (!drawing) return;
    drawing = false;
    if (points.length > 1) onStrokeComplete?.({ color: getColor(), width: getWidth(), points });
    points = [];
  }

  canvasEl.addEventListener('pointerdown', pointerDown);
  canvasEl.addEventListener('pointermove', pointerMove);
  canvasEl.addEventListener('pointerup', pointerUp);
  canvasEl.addEventListener('pointerleave', pointerUp);

  return function detach() {
    canvasEl.removeEventListener('pointerdown', pointerDown);
    canvasEl.removeEventListener('pointermove', pointerMove);
    canvasEl.removeEventListener('pointerup', pointerUp);
    canvasEl.removeEventListener('pointerleave', pointerUp);
  };
}

function strokePath(ctx, points, canvasEl) {
  if (points.length < 2) return;
  const sx = canvasEl.width / LOGICAL_SIZE;
  const sy = canvasEl.height / LOGICAL_SIZE;
  ctx.beginPath();
  ctx.moveTo(points[0].x * sx, points[0].y * sy);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x * sx, points[i].y * sy);
  }
  ctx.stroke();
}

// Redraws everything from scratch — strokes are small in number for a
// single sketch (dozens, not thousands), so full-redraw-per-change is
// simpler and cheap enough, same tradeoff store.js makes elsewhere.
export function renderSketch(canvasEl, sketch, { gridColor, liveStroke } = {}) {
  const ctx = canvasEl.getContext('2d');
  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

  if (sketch.mode === 'map') {
    drawGrid(ctx, canvasEl, sketch.gridStyle, gridColor);
  }

  sketch.strokes.forEach((stroke) => {
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    strokePath(ctx, stroke.points, canvasEl);
  });

  if (liveStroke) {
    ctx.strokeStyle = liveStroke.color;
    ctx.lineWidth = liveStroke.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    strokePath(ctx, liveStroke.points, canvasEl);
  }
}

function drawGrid(ctx, canvasEl, style, color = 'rgba(0,0,0,0.12)') {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;

  if (style === 'hex') {
    drawHexGrid(ctx, canvasEl, color);
  } else {
    const step = canvasEl.width / 20;
    for (let x = 0; x <= canvasEl.width; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvasEl.height);
      ctx.stroke();
    }
    for (let y = 0; y <= canvasEl.height; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvasEl.width, y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawHexGrid(ctx, canvasEl, color) {
  const r = canvasEl.width / 24; // hex radius, ~24 across the canvas width
  const hexW = Math.sqrt(3) * r;
  const hexH = 2 * r;
  const vStep = hexH * 0.75;

  for (let row = 0, y = r; y < canvasEl.height + hexH; row++, y += vStep) {
    const xOffset = row % 2 === 0 ? 0 : hexW / 2;
    for (let x = xOffset; x < canvasEl.width + hexW; x += hexW) {
      drawHex(ctx, x, y, r);
    }
  }
}

function drawHex(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    const px = cx + r * Math.cos(angle);
    const py = cy + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.stroke();
}

// Keeps the canvas's internal pixel buffer matching its displayed size
// (accounting for devicePixelRatio) so strokes stay crisp — called on
// mount and on resize.
export function fitCanvasToElement(canvasEl) {
  const rect = canvasEl.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvasEl.width = Math.round(rect.width * ratio);
  canvasEl.height = Math.round(rect.height * ratio);
}
