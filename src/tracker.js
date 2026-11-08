// Webcam + MediaPipe Face Landmarker -> head position in millimetres,
// expressed in the *camera's* frame: +x to the user's right, +y up,
// +z away from the camera toward the user.
//
// Johnny Lee used two IR LEDs of known separation seen by the Wiimote's
// camera. We use two irises of known diameter (human iris ≈ 11.7 mm, very
// low variance across adults) seen by the webcam. Same geometry:
//   distance = focal_length_px * real_size_mm / apparent_size_px

import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

const IRIS_DIAMETER_MM = 11.7;
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

// Landmark indices (478-point mesh with iris refinement).
// Iris: centre, then 4 points on the iris boundary (right, top, left, bottom).
const IRIS_L = [468, 469, 470, 471, 472];
const IRIS_R = [473, 474, 475, 476, 477];

export class HeadTracker {
  /**
   * @param {object} opts
   * @param {number} opts.hfovDeg  horizontal field of view of the webcam (degrees)
   */
  constructor({ hfovDeg = 60 } = {}) {
    this.hfovDeg = hfovDeg;
    this.focalScale = 1.0; // multiplier from calibration
    this.video = document.createElement('video');
    this.video.playsInline = true;
    this.video.muted = true;
    this.landmarker = null;
    this.lastTs = -1;
    this.last = null; // {x,y,z, irisPx, eyeL:[u,v], eyeR:[u,v], landmarks}
    this.fps = 0;
    this._fpsT = performance.now();
    this._fpsN = 0;
  }

  async start() {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      audio: false,
    });
    this.video.srcObject = stream;
    await this.video.play();

    const vision = await FilesetResolver.forVisionTasks(
      `${import.meta.env.BASE_URL}mediapipe/wasm`,
    );
    this.landmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
    });
  }

  get frameSize() {
    return [this.video.videoWidth, this.video.videoHeight];
  }

  /** Focal length in pixels for the current frame width and assumed HFOV. */
  get focalPx() {
    const [W] = this.frameSize;
    return (this.focalScale * (W / 2)) / Math.tan((this.hfovDeg * Math.PI) / 360);
  }

  /**
   * Calibrate scale so the current measured distance equals knownDistanceMm.
   * (Equivalent to fitting the webcam's true focal length.)
   */
  calibrateDistance(knownDistanceMm) {
    if (!this.last) return false;
    this.focalScale *= knownDistanceMm / this.last.z;
    return true;
  }

  /** Run detection on the newest video frame. Returns the head estimate or null. */
  update() {
    const v = this.video;
    if (!this.landmarker || v.readyState < 2) return this.last;
    const ts = v.currentTime * 1000;
    if (ts === this.lastTs) return this.last; // no new frame yet
    this.lastTs = ts;

    const res = this.landmarker.detectForVideo(v, performance.now());
    const lm = res.faceLandmarks && res.faceLandmarks[0];
    this._tickFps();
    if (!lm) return (this.last = null);

    const [W, H] = this.frameSize;
    const px = (i) => [lm[i].x * W, lm[i].y * H];
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

    // Apparent iris diameter: average of horizontal + vertical extents, both eyes.
    const diam = (idx) => (dist(px(idx[1]), px(idx[3])) + dist(px(idx[2]), px(idx[4]))) / 2;
    const irisPx = (diam(IRIS_L) + diam(IRIS_R)) / 2;

    const cL = px(IRIS_L[0]);
    const cR = px(IRIS_R[0]);
    const mid = [(cL[0] + cR[0]) / 2, (cL[1] + cR[1]) / 2];

    const f = this.focalPx;
    const z = (f * IRIS_DIAMETER_MM) / irisPx;
    // Pinhole back-projection. The raw (un-mirrored) frame shows the user's
    // right on the image's left, so negate x. Image y grows downward, negate y.
    const x = -((mid[0] - W / 2) / f) * z;
    const y = -((mid[1] - H / 2) / f) * z;

    this.last = { x, y, z, irisPx, eyeL: cL, eyeR: cR, landmarks: lm };
    return this.last;
  }

  _tickFps() {
    this._fpsN++;
    const now = performance.now();
    if (now - this._fpsT > 1000) {
      this.fps = (this._fpsN * 1000) / (now - this._fpsT);
      this._fpsN = 0;
      this._fpsT = now;
    }
  }
}
