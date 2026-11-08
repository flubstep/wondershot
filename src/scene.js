// The scene from the video: a wireframe room receding "into" the display,
// plus concentric-ring targets hanging at different depths, a few of them
// floating out in front of the screen. Units are millimetres, origin at the
// centre of the physical display, +z toward the viewer.

import * as THREE from 'three';

function makeTargetTexture(size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const cx = size / 2;
  const rings = [
    [1.0, '#d81b2a'],
    [0.9, '#ffffff'],
    [0.7, '#2a1030'],
    [0.62, '#ffffff'],
    [0.42, '#2a1030'],
    [0.34, '#ffffff'],
    [0.16, '#d81b2a'],
  ];
  for (const [r, color] of rings) {
    g.beginPath();
    g.arc(cx, cx, r * (cx - 2), 0, Math.PI * 2);
    g.fillStyle = color;
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function gridLines(points, w, h, d, step) {
  const nx = Math.round(w / step);
  const ny = Math.round(h / step);
  const nz = Math.round(d / step);
  const sx = w / nx, sy = h / ny, sz = d / nz;
  const seg = (a, b) => points.push(...a, ...b);
  const X = w / 2, Y = h / 2;
  // Lines running along z on the four side walls.
  for (let i = 0; i <= nx; i++) {
    const x = -X + i * sx;
    seg([x, -Y, 0], [x, -Y, -d]); // floor
    seg([x, Y, 0], [x, Y, -d]); // ceiling
  }
  for (let j = 0; j <= ny; j++) {
    const y = -Y + j * sy;
    seg([-X, y, 0], [-X, y, -d]); // left wall
    seg([X, y, 0], [X, y, -d]); // right wall
  }
  // Rectangular hoops at each depth step, plus the back wall grid.
  for (let k = 0; k <= nz; k++) {
    const z = -k * sz;
    seg([-X, -Y, z], [X, -Y, z]);
    seg([-X, Y, z], [X, Y, z]);
    seg([-X, -Y, z], [-X, Y, z]);
    seg([X, -Y, z], [X, Y, z]);
  }
  for (let i = 0; i <= nx; i++) seg([-X + i * sx, -Y, -d], [-X + i * sx, Y, -d]);
  for (let j = 0; j <= ny; j++) seg([-X, -Y + j * sy, -d], [X, -Y + j * sy, -d]);
}

export class Room {
  constructor() {
    this.group = new THREE.Group();
    this.targets = [];
    this.texture = makeTargetTexture();
    this.dims = null;
  }

  /** (Re)build for a display rectangle in mm. */
  build(rect) {
    this.group.clear();
    this.targets = [];
    const w = rect.r - rect.l;
    const h = rect.t - rect.b;
    const cx = (rect.l + rect.r) / 2;
    const cy = (rect.b + rect.t) / 2;
    const d = w * 1.6;
    this.dims = { w, h, d, cx, cy };

    const pts = [];
    gridLines(pts, w, h, d, Math.min(w, h) / 7);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const grid = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({ color: 0xbfc8ff, transparent: true, opacity: 0.75 }),
    );
    grid.position.set(cx, cy, 0);
    this.group.add(grid);

    // Targets: [x, y, z] as fractions of (w, h, d); z>0 is in front of screen.
    const layout = [
      [0.0, 0.0, -0.45, 0.22],
      [-0.28, -0.1, -0.7, 0.16],
      [0.3, 0.1, -0.35, 0.2],
      [-0.1, 0.3, -0.8, 0.13],
      [0.12, 0.22, -1.0, 0.1],
      [-0.33, 0.28, -0.95, 0.1],
      [0.22, -0.3, -0.9, 0.11],
      [-0.2, -0.33, -0.3, 0.17],
      [0.05, -0.2, 0.18, 0.12], // pops out of the screen
      [-0.3, 0.05, 0.3, 0.1], // pops out of the screen
    ];
    const poleMat = new THREE.LineBasicMaterial({ color: 0x9aa4e0, transparent: true, opacity: 0.6 });
    for (const [fx, fy, fz, fs] of layout) {
      const x = cx + fx * w;
      const y = cy + fy * h;
      const z = fz * d;
      const size = fs * h;
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(size, size),
        new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }),
      );
      mesh.position.set(x, y, z);
      this.group.add(mesh);
      this.targets.push(mesh);
      // Tether down to the floor, like the strings in the original demo.
      const pole = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, y - size / 2, z),
        new THREE.Vector3(x, cy - h / 2, z),
      ]);
      this.group.add(new THREE.Line(pole, poleMat));
    }
  }

  /** Billboard the targets toward the eye. */
  update(eye) {
    const e = new THREE.Vector3(...eye);
    for (const t of this.targets) t.lookAt(e);
  }
}
