import * as THREE from 'three';

/** how the occlusion looks: reach in metres, strength (1 = normal) and the colour corners darken towards */
export interface OcclusionLook {
  distance: number;
  intensity: number;
  color: string;
}

/** layer the faces are put on for a moment while their normals and depths are drawn */
const OCCLUSION_LAYER = 6;
const SAMPLES = 24;

const fullscreenVertex = `varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

/** view-space normal (rgb) and distance in front of the camera (a) of every pixel – background stays 0 */
const geometryMaterial = () =>
  new THREE.ShaderMaterial({
    clipping: true,
    side: THREE.DoubleSide,
    vertexShader: `#include <clipping_planes_pars_vertex>
      varying vec3 vViewNormal; varying float vDistance;
      void main(){
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewNormal = normalMatrix * normal;
        vDistance = -mvPosition.z;
        gl_Position = projectionMatrix * mvPosition;
        #include <clipping_planes_vertex>
      }`,
    fragmentShader: `#include <clipping_planes_pars_fragment>
      varying vec3 vViewNormal; varying float vDistance;
      void main(){
        #include <clipping_planes_fragment>
        vec3 n = normalize(vViewNormal) * (gl_FrontFacing ? 1.0 : -1.0);
        gl_FragColor = vec4(n, vDistance);
      }`,
  });

/** shared by the occlusion and the blur: a pixel's view-space position from its distance */
const viewPositionChunk = `uniform sampler2D tGeometry; uniform mat4 invProj;
  vec3 viewPosition(vec2 uv, float distance){
    vec2 ndc = uv * 2.0 - 1.0;
    vec4 a = invProj * vec4(ndc, -1.0, 1.0); a /= a.w;
    vec4 b = invProj * vec4(ndc, 1.0, 1.0); b /= b.w;
    return mix(a.xyz, b.xyz, (-distance - a.z) / (b.z - a.z));
  }
  bool isBackground(vec4 g){ return dot(g.xyz, g.xyz) < 0.25; }`;

/**
 * Hemisphere samples on a spiral around each pixel (Alchemy/SAO-like): a sample counts when it lies above the
 * face within the reach – inner corners and contact points darken, flat faces do not.
 */
const occlusionMaterial = () =>
  new THREE.ShaderMaterial({
    uniforms: {
      tGeometry: { value: null },
      invProj: { value: new THREE.Matrix4() },
      proj: { value: new THREE.Matrix4() },
      aspect: { value: 1 },
      radius: { value: 0.5 },
      intensity: { value: 1 },
    },
    vertexShader: fullscreenVertex,
    fragmentShader: `${viewPositionChunk}
      uniform mat4 proj; uniform float aspect; uniform float radius; uniform float intensity; varying vec2 vUv;
      void main(){
        vec4 g = texture2D(tGeometry, vUv);
        if (isBackground(g)) { gl_FragColor = vec4(0.0); return; }
        vec3 p = viewPosition(vUv, g.a);
        vec3 n = g.xyz;
        // the reach in screen space (uv), capped so a face right before the eye stays cheap
        vec4 c0 = proj * vec4(p, 1.0); vec4 c1 = proj * vec4(p + vec3(radius, 0.0, 0.0), 1.0);
        float reach = min(abs(c1.x / c1.w - c0.x / c0.w) * 0.5, 0.2);
        // two decorrelated per-pixel noises turn and shift the spiral – the blur then hides the grain
        float noise = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
        float shift = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
        float r2 = radius * radius;
        float occlusion = 0.0;
        for (int i = 0; i < ${SAMPLES}; i++) {
          float f = (float(i) + shift) / ${SAMPLES}.0;
          float angle = (noise + f * 11.0) * 6.2831853;
          vec2 uv = vUv + vec2(cos(angle), sin(angle) * aspect) * f * reach;
          vec4 s = texture2D(tGeometry, uv);
          if (isBackground(s) || uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) { continue; }
          vec3 v = viewPosition(uv, s.a) - p;
          float vv = dot(v, v);
          float falloff = max(r2 - vv, 0.0) / r2;
          occlusion += falloff * max(dot(v, n) / sqrt(vv + 1e-6) - 0.1, 0.0);
        }
        gl_FragColor = vec4(clamp(occlusion * 4.0 / ${SAMPLES}.0 * intensity, 0.0, 1.0), 0.0, 0.0, 1.0);
      }`,
    depthTest: false,
    depthWrite: false,
  });

/** one direction of a blur that keeps to the face – it does not smear across depth jumps */
const blurMaterial = () =>
  new THREE.ShaderMaterial({
    uniforms: {
      tGeometry: { value: null },
      tOcclusion: { value: null },
      invProj: { value: new THREE.Matrix4() },
      texelStep: { value: new THREE.Vector2() },
    },
    vertexShader: fullscreenVertex,
    fragmentShader: `${viewPositionChunk}
      uniform sampler2D tOcclusion; uniform vec2 texelStep; varying vec2 vUv;
      void main(){
        vec4 g = texture2D(tGeometry, vUv);
        if (isBackground(g)) { gl_FragColor = vec4(0.0); return; }
        float sum = 0.0; float weights = 0.0;
        for (int i = -4; i <= 4; i++) {
          vec2 uv = vUv + texelStep * float(i);
          vec4 s = texture2D(tGeometry, uv);
          float near = isBackground(s) ? 0.0 : step(abs(s.a - g.a), 0.02 * g.a + 0.005);
          float w = exp(-float(i * i) / 18.0) * near;
          sum += texture2D(tOcclusion, uv).r * w;
          weights += w;
        }
        gl_FragColor = vec4(sum / max(weights, 1e-4), 0.0, 0.0, 1.0);
      }`,
    depthTest: false,
    depthWrite: false,
  });

/** multiplies the finished frame towards the occlusion colour */
const compositeMaterial = () =>
  new THREE.ShaderMaterial({
    uniforms: {
      tOcclusion: { value: null },
      color: { value: new THREE.Color() },
    },
    vertexShader: fullscreenVertex,
    fragmentShader: `uniform sampler2D tOcclusion; uniform vec3 color; varying vec2 vUv;
      void main(){ gl_FragColor = vec4(mix(vec3(1.0), color, texture2D(tOcclusion, vUv).r), 1.0); }`,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.DstColorFactor,
    blendDst: THREE.ZeroFactor,
    depthTest: false,
    depthWrite: false,
  });

/**
 * Screen-space ambient occlusion as a pass after the frame: the opaque faces are drawn once more as normals and
 * distances, darkening is sampled from those, blurred and multiplied over the frame on the canvas.
 */
export class AmbientOcclusion {
  private geometryTarget = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.FloatType,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: true,
  });
  private occlusionTarget = new THREE.WebGLRenderTarget(1, 1, {
    depthBuffer: false,
  });
  private blurTarget = new THREE.WebGLRenderTarget(1, 1, {
    depthBuffer: false,
  });
  private geometry = geometryMaterial();
  private occlusion = occlusionMaterial();
  private blur = blurMaterial();
  private composite = compositeMaterial();
  private quad = new THREE.Mesh(new THREE.BufferGeometry(), this.occlusion);
  private quadScene = new THREE.Scene();
  private quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private size = new THREE.Vector2();
  private savedClear = new THREE.Color();

  constructor() {
    this.quad.geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  /** draws over what the canvas shows now – `meshes` are the faces that cast occlusion */
  render(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    meshes: THREE.Object3D[],
    clipPlanes: THREE.Plane[],
    look: OcclusionLook,
  ) {
    // in CSS pixels – a high-DPI screen gets the occlusion upscaled, the edges stay sharp in the frame
    renderer.getDrawingBufferSize(this.size);
    const ratio = Math.max(1, renderer.getPixelRatio());
    const width = Math.max(1, Math.round(this.size.x / ratio));
    const height = Math.max(1, Math.round(this.size.y / ratio));
    if (this.geometryTarget.width !== width || this.geometryTarget.height !== height) {
      for (const target of [this.geometryTarget, this.occlusionTarget, this.blurTarget]) {
        target.setSize(width, height);
      }
    }
    const savedTarget = renderer.getRenderTarget();
    renderer.getClearColor(this.savedClear);
    const savedAlpha = renderer.getClearAlpha();
    const savedOverride = scene.overrideMaterial;
    const savedLayers = camera.layers.mask;
    const savedBackground = scene.background;
    for (const mesh of meshes) {
      mesh.layers.enable(OCCLUSION_LAYER);
    }
    try {
      this.geometry.clippingPlanes = clipPlanes;
      scene.overrideMaterial = this.geometry;
      scene.background = null;
      camera.layers.set(OCCLUSION_LAYER);
      renderer.setRenderTarget(this.geometryTarget);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(scene, camera);

      const projection = (camera as THREE.PerspectiveCamera).projectionMatrix;
      const inverse = (camera as THREE.PerspectiveCamera).projectionMatrixInverse;
      const occlusion = this.occlusion.uniforms;
      occlusion.tGeometry.value = this.geometryTarget.texture;
      occlusion.invProj.value.copy(inverse);
      occlusion.proj.value.copy(projection);
      occlusion.aspect.value = width / height;
      occlusion.radius.value = Math.max(look.distance, 0.001);
      occlusion.intensity.value = look.intensity;
      this.pass(renderer, this.occlusion, this.occlusionTarget);

      const blur = this.blur.uniforms;
      blur.tGeometry.value = this.geometryTarget.texture;
      blur.invProj.value.copy(inverse);
      blur.tOcclusion.value = this.occlusionTarget.texture;
      blur.texelStep.value.set(1.5 / width, 0);
      this.pass(renderer, this.blur, this.blurTarget);
      blur.tOcclusion.value = this.blurTarget.texture;
      blur.texelStep.value.set(0, 1.5 / height);
      this.pass(renderer, this.blur, this.occlusionTarget);

      this.composite.uniforms.tOcclusion.value = this.occlusionTarget.texture;
      // the colour multiplies the sRGB frame as picked – no conversion to linear
      this.composite.uniforms.color.value.setStyle(look.color, THREE.LinearSRGBColorSpace);
      this.quad.material = this.composite;
      renderer.setRenderTarget(savedTarget);
      renderer.render(this.quadScene, this.quadCamera);
    } finally {
      for (const mesh of meshes) {
        mesh.layers.disable(OCCLUSION_LAYER);
      }
      scene.overrideMaterial = savedOverride;
      scene.background = savedBackground;
      camera.layers.mask = savedLayers;
      renderer.setRenderTarget(savedTarget);
      renderer.setClearColor(this.savedClear, savedAlpha);
    }
  }

  private pass(renderer: THREE.WebGLRenderer, material: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget) {
    this.quad.material = material;
    renderer.setRenderTarget(target);
    renderer.render(this.quadScene, this.quadCamera);
  }

  dispose() {
    for (const target of [this.geometryTarget, this.occlusionTarget, this.blurTarget]) {
      target.dispose();
    }
    for (const material of [this.geometry, this.occlusion, this.blur, this.composite]) {
      material.dispose();
    }
    this.quad.geometry.dispose();
  }
}
