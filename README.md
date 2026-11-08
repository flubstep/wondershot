# wondershot

Head-coupled perspective in the browser: the display becomes a window into a
3D room, and the view shifts as you move your head, so things inside the
screen look like they have real depth and things in front of it appear to
float in the air.

This recreates Johnny Chung Lee's 2007 Wii Remote head-tracking demo
(["Head Tracking for Desktop VR Displays using the Wii Remote"](https://www.youtube.com/watch?v=Jd3-eiid-Uw),
CMU HCII), but swaps the Wiimote + IR LED glasses for a plain webcam and a
face/iris landmark model that runs entirely in the browser.

## How it works

| | Johnny Lee (2007) | wondershot |
|---|---|---|
| Sensor | Wii Remote IR camera, pointed at the user | Webcam |
| Markers | Two IR LEDs on safety glasses, known separation | Two irises, known diameter (≈ 11.7 mm in adults) |
| Position | Midpoint of the two IR dots | Midpoint of the two iris centres |
| Distance | Apparent LED separation | Apparent iris diameter |
| Model | – | [MediaPipe Face Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker) (478 landmarks incl. iris), WASM/WebGPU, nothing leaves the device |

1. `src/tracker.js` – grabs webcam frames, runs the landmarker, and
   back-projects the eye midpoint through a pinhole camera model:
   `z = f_px · 11.7 mm / iris_px`, `x = (u − W/2) · z / f_px`, etc.
2. `src/projection.js` – builds an **off-axis projection** (Kooima's
   generalized perspective projection) whose frustum passes exactly through
   the physical edges of the display as seen from the eye. The camera never
   rotates; the frustum shears.
3. `src/scene.js` – the wireframe room and ring targets from the video, in
   millimetres, sized to your actual screen. Two targets sit *in front of*
   the screen plane.
4. `src/filter.js` – a One Euro filter so the image is steady when you're
   still but doesn't lag when you move.

## Run it

```sh
npm install        # also copies the MediaPipe wasm into public/
npm run dev        # http://localhost:5178
```

Allow the camera, then press **`f`** for fullscreen (otherwise the position of
the browser window on the screen is only estimated). Sit roughly an arm's
length away and move your head side to side and in and out.

Keys:

| key | |
|---|---|
| `f` | fullscreen |
| `t` | toggle head tracking (compare with a fixed camera) |
| `m` | mouse mode – move the mouse instead of your head, no camera needed |
| `c` | calibrate distance: sit at the distance in settings (default 600 mm) and press |
| `s` | settings panel |
| `d` | debug overlay + webcam preview |

## Getting the geometry right

Three numbers matter and the browser can't discover any of them, so they are
in the settings panel (`s`) and persisted in `localStorage`:

- **display width (mm)** – physical width of the whole display. 14" MacBook
  Pro ≈ 302, 16" ≈ 344, 27" monitor ≈ 597. Wrong values make the room the
  wrong size relative to your motion, so the parallax feels too strong/weak.
- **webcam HFOV** – determines the focal length used for distance. Rather than
  look it up, press `c` while sitting at the configured calibration distance.
- **webcam offset** – the lens is assumed centred above the picture; set how
  far above (mm). The camera's optical axis is assumed perpendicular to the
  screen, so a strongly tilted laptop lid introduces a vertical offset.

## Caveats / ideas

- Monocular, so it is a "cyclopean" eye at the midpoint of both irises. It
  works because the brain weighs motion parallax heavily; there's no stereo.
- Iris-diameter depth is noisy at distance (a 1 px error at 15 px is ~7 %).
  The filter hides most of it; a better approach would fuse iris size with
  inter-pupillary distance once calibrated for the specific person.
- Latency is camera + model (~15–30 ms on Apple Silicon) + display. Lee's
  Wiimote ran at 100 Hz; a webcam gives 30–60 Hz. Prediction (velocity
  extrapolation) would help.
- Gaze itself isn't used — only *where the eyes are*, not where they look,
  which is all head-coupled perspective needs.

## License

MIT
