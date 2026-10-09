// Historical context: see docs/CODEBASE_NOTES.md#jscanvas-js-1-5

const DRAG_THRESHOLD = 4; // px of movement before a pointerdown counts as a drag, not a click

// Assigns positions to entities that don't have canvasX/canvasY yet, laid
// out in a circle around the canvas center. Returns only the entities that
// needed a position — the caller persists just those via setEntityPosition.
export function computeDefaultLayout(entities, width, height) {
  const unplaced = entities.filter((e) => e.canvasX == null || e.canvasY == null);
  if (!unplaced.length) return [];
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.max(60, Math.min(width, height) / 2 - 80);
  return unplaced.map((entity, i) => {
    const angle = (2 * Math.PI * i) / unplaced.length - Math.PI / 2;
    return {
      id: entity.id,
      x: Math.round(cx + radius * Math.cos(angle)),
      y: Math.round(cy + radius * Math.sin(angle)),
    };
  });
}

// Historical context: see docs/CODEBASE_NOTES.md#jscanvas-js-28-36
export function attachNodeDrag(nodeEl, svgEl, { onMove, onDragEnd, onClick }) {
  let dragging = false;
  let moved = false;
  let startX = 0;
  let startY = 0;
  let offsetX = 0;
  let offsetY = 0;

  function toSvgPoint(clientX, clientY) {
    const rect = svgEl.getBoundingClientRect();
    const vb = svgEl.viewBox.baseVal;
    const scaleX = vb && rect.width ? vb.width / rect.width : 1;
    const scaleY = vb && rect.height ? vb.height / rect.height : 1;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  }

  function onPointerDown(e) {
    e.preventDefault();
    dragging = true;
    moved = false;
    const pt = toSvgPoint(e.clientX, e.clientY);
    startX = pt.x;
    startY = pt.y;
    offsetX = pt.x - parseFloat(nodeEl.dataset.x || 0);
    offsetY = pt.y - parseFloat(nodeEl.dataset.y || 0);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }

  function onPointerMove(e) {
    if (!dragging) return;
    const pt = toSvgPoint(e.clientX, e.clientY);
    if (!moved && Math.hypot(pt.x - startX, pt.y - startY) > DRAG_THRESHOLD) moved = true;
    if (!moved) return;
    onMove?.(pt.x - offsetX, pt.y - offsetY);
  }

  function onPointerUp(e) {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    if (!dragging) return;
    dragging = false;
    if (moved) {
      const pt = toSvgPoint(e.clientX, e.clientY);
      onDragEnd?.(pt.x - offsetX, pt.y - offsetY);
    } else {
      onClick?.();
    }
  }

  nodeEl.addEventListener('pointerdown', onPointerDown);

  return {
    destroy: () => nodeEl.removeEventListener('pointerdown', onPointerDown),
  };
}
