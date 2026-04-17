import * as THREE from 'three';

/**
 * Offset a closed 2D polygon (in feet, x = canvas x, y = canvas y scaled to world Z).
 * Uses edge midpoints vs centroid to pick outward direction; miters corners.
 */
function offsetPolygon2D(
  pts: THREE.Vector2[],
  dist: number,
  centroid: THREE.Vector2
): THREE.Vector2[] {
  const n = pts.length;
  const out: THREE.Vector2[] = [];

  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n];
    const cur = pts[i];
    const next = pts[(i + 1) % n];

    const e1 = new THREE.Vector2().subVectors(cur, prev);
    const e2 = new THREE.Vector2().subVectors(next, cur);
    const len1 = e1.length();
    const len2 = e2.length();
    if (len1 < 1e-12 || len2 < 1e-12) {
      out.push(cur.clone());
      continue;
    }
    e1.divideScalar(len1);
    e2.divideScalar(len2);

    const mid1 = new THREE.Vector2().addVectors(prev, cur).multiplyScalar(0.5);
    const mid2 = new THREE.Vector2().addVectors(cur, next).multiplyScalar(0.5);
    let n0 = new THREE.Vector2(-e1.y, e1.x);
    if (n0.dot(mid1.clone().sub(centroid)) < 0) n0.negate();
    let n1 = new THREE.Vector2(-e2.y, e2.x);
    if (n1.dot(mid2.clone().sub(centroid)) < 0) n1.negate();

    const bis = new THREE.Vector2().addVectors(n0, n1);
    const bl = bis.length();
    if (bl < 1e-12) {
      out.push(cur.clone().addScaledVector(n0, dist));
      continue;
    }
    bis.divideScalar(bl);
    const cos = Math.max(0.06, bis.dot(n0));
    let miterLen = dist / cos;
    const cap = 48 * Math.abs(dist);
    if (Math.abs(miterLen) > cap) miterLen = Math.sign(miterLen) * cap;

    out.push(new THREE.Vector2().copy(cur).addScaledVector(bis, miterLen));
  }
  return out;
}

/**
 * Single continuous mesh for the site boundary: a vertical band (ring) with mitered corners.
 * Replaces separate per-edge boxes that gap at vertices.
 */
export function createBoundaryRingGeometry(
  canvasPts: { x: number; y: number }[],
  gridPxPerFoot: number,
  thicknessFt = 3 / 12,
  heightFt = 2.5
): THREE.BufferGeometry | null {
  if (!canvasPts || canvasPts.length < 3) return null;

  const s = 1 / gridPxPerFoot;
  /** Local shape (x·s, y·s) ft; after `rotateX(-π/2)` world Z = -shapeY = zFt = -y·s — same as walls. */
  const pts = canvasPts.map((p) => new THREE.Vector2(p.x * s, p.y * s));

  let cx = 0;
  let cy = 0;
  for (const p of pts) {
    cx += p.x;
    cy += p.y;
  }
  cx /= pts.length;
  cy /= pts.length;
  const centroid = new THREE.Vector2(cx, cy);

  const outer = offsetPolygon2D(pts, thicknessFt / 2, centroid);
  const inner = offsetPolygon2D(pts, -thicknessFt / 2, centroid);

  if (outer.length < 3 || inner.length < 3) return null;

  const shape = new THREE.Shape();
  shape.moveTo(outer[0].x, outer[0].y);
  for (let i = 1; i < outer.length; i++) {
    shape.lineTo(outer[i].x, outer[i].y);
  }
  shape.closePath();

  const holePath = new THREE.Path();
  holePath.moveTo(inner[0].x, inner[0].y);
  for (let i = 1; i < inner.length; i++) {
    holePath.lineTo(inner[i].x, inner[i].y);
  }
  holePath.closePath();
  shape.holes.push(holePath);

  try {
    const geom = new THREE.ExtrudeGeometry(shape, {
      depth: heightFt,
      bevelEnabled: false,
      curveSegments: 1,
    });
    geom.rotateX(-Math.PI / 2);
    return geom;
  } catch {
    return null;
  }
}
