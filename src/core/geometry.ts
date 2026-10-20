import * as THREE from 'three';

export const EPS = 1e-6;
export const LEN_EPS = 1e-4; // 0.1 mm merge tolerance (model units = meters)

export type V3 = THREE.Vector3;
/** A plane given by one point on it and its normal. */
export interface PlaneRef {
  point: V3;
  normal: V3;
}
/** Two orthonormal in-plane axes. */
export interface PlaneAxes {
  basisU: V3;
  basisV: V3;
}
export const vec3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** Newell normal of a polygon (not normalized if degenerate). */
export const polygonNormal = (pts: V3[]): V3 => {
  const normal = vec3();
  for (let i = 0; i < pts.length; i++) {
    const current = pts[i],
      next = pts[(i + 1) % pts.length];
    normal.x += (current.y - next.y) * (current.z + next.z);
    normal.y += (current.z - next.z) * (current.x + next.x);
    normal.z += (current.x - next.x) * (current.y + next.y);
  }
  const magnitude = normal.length();
  if (magnitude < 1e-12) {
    return vec3();
  }
  return normal.multiplyScalar(1 / magnitude);
};

export const polygonArea = (pts: V3[]): number => {
  const normal = vec3();
  for (let i = 0; i < pts.length; i++) {
    const current = pts[i],
      next = pts[(i + 1) % pts.length];
    normal.add(current.clone().cross(next));
  }
  return normal.length() / 2;
};

/** Orthonormal basis (u, v) on plane with normal n. */
export const planeBasis = (normal: V3): PlaneAxes => {
  const ref = Math.abs(normal.z) < 0.9 ? vec3(0, 0, 1) : vec3(1, 0, 0);
  const basisU = ref.clone().cross(normal).normalize();
  const basisV = normal.clone().cross(basisU).normalize();
  return { basisU: basisU, basisV: basisV };
};

export const to2D = (pts: V3[], origin: V3, basisU: V3, basisV: V3): THREE.Vector2[] => {
  return pts.map((point) => {
    const offset = point.clone().sub(origin);
    return new THREE.Vector2(offset.dot(basisU), offset.dot(basisV));
  });
};

export const signedArea2D = (pts: THREE.Vector2[]): number => {
  let doubleArea = 0;
  for (let i = 0; i < pts.length; i++) {
    const current = pts[i],
      next = pts[(i + 1) % pts.length];
    doubleArea += current.x * next.y - next.x * current.y;
  }
  return doubleArea / 2;
};

export const pointInPolygon2D = (point: THREE.Vector2, poly: THREE.Vector2[]): boolean => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const current = poly[i],
      previous = poly[j];
    if (
      current.y > point.y !== previous.y > point.y &&
      point.x < ((previous.x - current.x) * (point.y - current.y)) / (previous.y - current.y) + current.x
    ) {
      inside = !inside;
    }
  }
  return inside;
};

export const distPointSegment2D = (point: THREE.Vector2, start: THREE.Vector2, end: THREE.Vector2): number => {
  const segment = end.clone().sub(start);
  const lengthSq = segment.lengthSq();
  if (lengthSq < 1e-12) {
    return point.distanceTo(start);
  }
  const param = Math.max(0, Math.min(1, point.clone().sub(start).dot(segment) / lengthSq));
  return point.distanceTo(start.clone().add(segment.multiplyScalar(param)));
};

/** Closest point on segment ab to p; returns t in [0,1]. */
export const closestOnSegment = (point: V3, start: V3, end: V3): { point: V3; param: number } => {
  const segment = end.clone().sub(start);
  const lengthSq = segment.lengthSq();
  if (lengthSq < 1e-14) {
    return { point: start.clone(), param: 0 };
  }
  const param = Math.max(0, Math.min(1, point.clone().sub(start).dot(segment) / lengthSq));
  return { point: start.clone().add(segment.multiplyScalar(param)), param: param };
};

/** Closest points between two segments (p1-q1, p2-q2). */
export const segmentSegmentClosest = (startA: V3, endA: V3, startB: V3, endB: V3) => {
  const dirA = endA.clone().sub(startA),
    dirB = endB.clone().sub(startB),
    between = startA.clone().sub(startB);
  const lenSqA = dirA.dot(dirA),
    lenSqB = dirB.dot(dirB),
    dotB = dirB.dot(between);
  let paramA = 0,
    paramB = 0;
  if (lenSqA <= 1e-14 && lenSqB <= 1e-14) {
    return { s: paramA, t: paramB, c1: startA.clone(), c2: startB.clone() };
  }
  if (lenSqA <= 1e-14) {
    paramB = Math.max(0, Math.min(1, dotB / lenSqB));
  } else {
    const dotA = dirA.dot(between);
    if (lenSqB <= 1e-14) {
      paramA = Math.max(0, Math.min(1, -dotA / lenSqA));
    } else {
      const dotAB = dirA.dot(dirB),
        denom = lenSqA * lenSqB - dotAB * dotAB;
      paramA = denom !== 0 ? Math.max(0, Math.min(1, (dotAB * dotB - dotA * lenSqB) / denom)) : 0;
      paramB = (dotAB * paramA + dotB) / lenSqB;
      if (paramB < 0) {
        paramB = 0;
        paramA = Math.max(0, Math.min(1, -dotA / lenSqA));
      } else if (paramB > 1) {
        paramB = 1;
        paramA = Math.max(0, Math.min(1, (dotAB - dotA) / lenSqA));
      }
    }
  }
  return { s: paramA, t: paramB, c1: startA.clone().add(dirA.multiplyScalar(paramA)), c2: startB.clone().add(dirB.multiplyScalar(paramB)) };
};

/** Closest points between two infinite lines; null if parallel. */
export const lineLineClosest = (pointA: V3, dirA: V3, pointB: V3, dirB: V3) => {
  const between = pointA.clone().sub(pointB);
  const lenSqA = dirA.dot(dirA),
    dotAB = dirA.dot(dirB),
    dotA = dirA.dot(between),
    lenSqB = dirB.dot(dirB),
    dotB = dirB.dot(between);
  const denom = lenSqA * lenSqB - dotAB * dotAB;
  if (Math.abs(denom) < 1e-12) {
    return null;
  }
  const paramA = (dotAB * dotB - dotA * lenSqB) / denom,
    paramB = (lenSqA * dotB - dotAB * dotA) / denom;
  return {
    s: paramA,
    t: paramB,
    c1: pointA.clone().add(dirA.clone().multiplyScalar(paramA)),
    c2: pointB.clone().add(dirB.clone().multiplyScalar(paramB)),
  };
};

export const intersectRayPlane = (origin: V3, dir: V3, planePoint: V3, planeNormal: V3): V3 | null => {
  const denom = dir.dot(planeNormal);
  if (Math.abs(denom) < 1e-9) {
    return null;
  }
  const param = planePoint.clone().sub(origin).dot(planeNormal) / denom;
  if (param < 0) {
    return null;
  }
  return origin.clone().add(dir.clone().multiplyScalar(param));
};

/** Triangulate a planar polygon with holes. Returns flat index triples into [outer..., hole0..., hole1...]. */
export const triangulate = (outer: V3[], holes: V3[][], normal?: V3): number[] => {
  const planeNormal = normal ?? polygonNormal(outer);
  if (planeNormal.lengthSq() < 0.5) {
    return [];
  }
  const { basisU, basisV } = planeBasis(planeNormal);
  const anchor = outer[0];
  const contour = to2D(outer, anchor, basisU, basisV);
  const holes2D = holes.map((hole) => to2D(hole, anchor, basisU, basisV));
  // ShapeUtils expects outer CCW? It handles orientation internally (removes duplicates, fixes winding)
  const tris = THREE.ShapeUtils.triangulateShape(contour, holes2D);
  const out: number[] = [];
  for (const triangle of tris) {
    out.push(triangle[0], triangle[1], triangle[2]);
  }
  // ensure winding matches normal
  const all = [...outer, ...holes.flat()];
  if (out.length >= 3) {
    // check first non-degenerate triangle orientation
    for (let i = 0; i < out.length; i += 3) {
      const cornerA = all[out[i]],
        cornerB = all[out[i + 1]],
        cornerC = all[out[i + 2]];
      const triNormal = cornerB.clone().sub(cornerA).cross(cornerC.clone().sub(cornerA));
      if (triNormal.lengthSq() < 1e-16) {
        continue;
      }
      if (triNormal.dot(planeNormal) < 0) {
        for (let j = 0; j < out.length; j += 3) {
          const tmp = out[j + 1];
          out[j + 1] = out[j + 2];
          out[j + 2] = tmp;
        }
      }
      break;
    }
  }
  return out;
};

/** Offset a closed planar polygon by distance d (positive = inwards for CCW wrt normal). */
export const offsetPolygon = (pts: V3[], normal: V3, distance: number): V3[] => {
  const count = pts.length;
  const out: V3[] = [];
  for (let i = 0; i < count; i++) {
    const prev = pts[(i - 1 + count) % count],
      cur = pts[i],
      next = pts[(i + 1) % count];
    const edgeIn = cur.clone().sub(prev).normalize(),
      edgeOut = next.clone().sub(cur).normalize();
    const in1 = normal.clone().cross(edgeIn).normalize(); // inward for CCW
    const in2 = normal.clone().cross(edgeOut).normalize();
    const shiftedPrev = prev.clone().add(in1.clone().multiplyScalar(distance));
    const shiftedCur = cur.clone().add(in2.clone().multiplyScalar(distance));
    const hit = lineLineClosest(shiftedPrev, edgeIn, shiftedCur, edgeOut);
    if (!hit) {
      out.push(cur.clone().add(in1.multiplyScalar(distance)));
    } else {
      out.push(hit.c1);
    }
  }
  return out;
};

export const isCollinear = (first: V3, second: V3, third: V3, tol = 1e-6): boolean => {
  return (
    second.clone().sub(first).cross(third.clone().sub(first)).length() <
    tol * Math.max(1, second.distanceTo(first) * third.distanceTo(first))
  );
};

export const pointOnSegmentInterior = (probe: V3, start: V3, end: V3, tol = LEN_EPS): boolean => {
  const { point, param } = closestOnSegment(probe, start, end);
  if (param <= 1e-9 || param >= 1 - 1e-9) {
    return false;
  }
  return point.distanceTo(probe) < tol && probe.distanceTo(start) > tol && probe.distanceTo(end) > tol;
};

export const bbox = (points: V3[]): THREE.Box3 => {
  const box = new THREE.Box3();
  for (const point of points) {
    box.expandByPoint(point);
  }
  return box;
};
