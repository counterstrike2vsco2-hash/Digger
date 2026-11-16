// Частицы (огонь, дым, искры, кровь, пыль) и следы на полу (пятна, копоть).
// Всё в пулах фиксированного размера: никакого мусора и аллокаций во время игры.
import * as THREE from 'three';

const VS = `
attribute float size; attribute vec4 col;
uniform float uScale; varying vec4 vCol;
void main() {
  vCol = col;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * uScale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const FS = `
varying vec4 vCol;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.15, d) * vCol.a;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vCol.rgb, a);
}`;

export class Particles {
  constructor(scene, max, additive) {
    this.max = max; this.n = 0; this.head = 0;
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4); this.size = new Float32Array(max);
    this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.grav = new Float32Array(max); this.drag = new Float32Array(max); this.grow = new Float32Array(max);
    this.kind = new Uint8Array(max); this.alpha0 = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('col', this.aCol); g.setAttribute('size', this.aSize);
    g.setDrawRange(0, max);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 400 } }, vertexShader: VS, fragmentShader: FS,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.onGround = null; // (x, z, kind) — частица упала на пол
  }
  /** kind: 0 — обычная, 1 — кровь (оставляет пятно), 2 — не падает на пол */
  spawn(x, y, z, vx, vy, vz, life, size, r, g, b, a = 1, grav = 0, drag = 0, grow = 0, kind = 0) {
    const i = this.head; this.head = (this.head + 1) % this.max;
    const i3 = i * 3, i4 = i * 4;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.col[i4] = r; this.col[i4 + 1] = g; this.col[i4 + 2] = b; this.col[i4 + 3] = a;
    this.alpha0[i] = a; this.size[i] = size; this.life[i] = life; this.maxLife[i] = life;
    this.grav[i] = grav; this.drag[i] = drag; this.grow[i] = grow; this.kind[i] = kind;
  }
  update(dt) {
    const { pos, vel, col, size, life, maxLife } = this;
    for (let i = 0; i < this.max; i++) {
      if (life[i] <= 0) { if (col[i * 4 + 3] !== 0) col[i * 4 + 3] = 0; continue; }
      life[i] -= dt;
      const i3 = i * 3;
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      vel[i3] *= dr; vel[i3 + 1] = vel[i3 + 1] * dr - this.grav[i] * dt; vel[i3 + 2] *= dr;
      pos[i3] += vel[i3] * dt; pos[i3 + 1] += vel[i3 + 1] * dt; pos[i3 + 2] += vel[i3 + 2] * dt;
      if (pos[i3 + 1] < 0.03 && this.kind[i] !== 2) {
        pos[i3 + 1] = 0.03;
        if (this.kind[i] === 1) { if (this.onGround) this.onGround(pos[i3], pos[i3 + 2], 1); life[i] = 0; }
        else { vel[i3] *= 0.5; vel[i3 + 2] *= 0.5; vel[i3 + 1] = -vel[i3 + 1] * 0.3; }
      }
      size[i] += this.grow[i] * dt;
      const t = life[i] / maxLife[i];
      col[i * 4 + 3] = this.alpha0[i] * Math.min(1, t * 2.5);
    }
    this.aPos.needsUpdate = true; this.aCol.needsUpdate = true; this.aSize.needsUpdate = true;
  }
  clear() { this.life.fill(0); this.col.fill(0); }
}

// пятна на полу: один InstancedMesh, кольцевой буфер
export class Decals {
  constructor(scene, max) {
    this.max = max; this.i = 0;
    const g = new THREE.CircleGeometry(1, 14); g.rotateX(-Math.PI / 2);
    this.mesh = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), max);
    this.mesh.count = 0;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.s = new THREE.Vector3(); this.p = new THREE.Vector3(); this.c = new THREE.Color();
    this.e = new THREE.Euler();
    scene.add(this.mesh);
  }
  add(x, y, z, r, color) {
    this.e.set(0, Math.random() * 6.28, 0); this.q.setFromEuler(this.e);
    this.p.set(x, y + 0.012 + (this.i % 7) * 0.0006, z);
    this.s.set(r * (0.8 + Math.random() * 0.5), 1, r * (0.8 + Math.random() * 0.5));
    this.m4.compose(this.p, this.q, this.s);
    this.mesh.setMatrixAt(this.i, this.m4);
    this.mesh.setColorAt(this.i, this.c.set(color));
    this.i = (this.i + 1) % this.max;
    this.mesh.count = Math.min(this.max, this.mesh.count + 1);
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  clear() { this.mesh.count = 0; this.i = 0; }
}

// мягкое круглое пятно-тень (для режима без теней)
let blobTex = null;
export function blobTexture() {
  if (blobTex) return blobTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  blobTex = new THREE.CanvasTexture(c);
  return blobTex;
}
