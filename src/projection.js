// Off-axis ("window") projection. The screen is a fixed rectangle in the
// world; the eye moves. Instead of rotating a camera, we keep the view
// direction perpendicular to the screen and shear the frustum so its near
// plane edges pass exactly through the screen's physical edges as seen from
// the eye. This is the generalized perspective projection (Kooima 2008),
// specialised to a screen lying in the z=0 plane facing +z.
//
// World units: millimetres. Origin: centre of the physical display.
// +x right, +y up, +z toward the viewer. Things with z<0 are "inside" the
// screen; z>0 pop out in front of it.

import * as THREE from 'three';

export class WindowCamera {
  constructor() {
    this.camera = new THREE.PerspectiveCamera();
    this.camera.matrixAutoUpdate = false;
    this.near = 10; // mm
    this.far = 20000; // mm
    // Viewport rectangle in screen-plane mm (left,right,bottom,top).
    this.rect = { l: -150, r: 150, b: -100, t: 100 };
  }

  /** Set the physical rectangle this browser viewport covers, in mm. */
  setRect(l, r, b, t) {
    this.rect = { l, r, b, t };
  }

  /** @param {[number,number,number]} eye  eye position in mm, z>0 */
  update(eye) {
    const [ex, ey, ez] = eye;
    const { l, r, b, t } = this.rect;
    const n = this.near;
    const s = n / ez;
    const cam = this.camera;
    cam.projectionMatrix.makePerspective((l - ex) * s, (r - ex) * s, (t - ey) * s, (b - ey) * s, n, this.far);
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
    cam.position.set(ex, ey, ez);
    cam.quaternion.identity(); // looking down -z, up = +y
    cam.updateMatrix();
    cam.updateMatrixWorld(true);
  }
}
