import { reactive } from 'vue';

/** Polygon view: shows how objects are built – corner points, the triangles of every face and softened edges. */
export const meshView = reactive({ on: false, points: true, triangles: true, soft: true });
