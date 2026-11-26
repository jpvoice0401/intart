# Performance and compatibility

All twelve examples remain available. Particle counts, collision iterations,
render pixel ratios, geometry, materials, shadows and effect parameters are retained.

## Changes

- Load each example and its CSS on demand. Snow does not load Three.js or the
  other examples. Rapid navigation cancels pending mounts before they can start
  a camera, renderer or animation loop.
- Run hand/face/segmentation inference in a module worker where supported. Only
  one bitmap is in flight; obsolete camera frames never accumulate in a queue.
  Worker failures fall back to the main thread, and each model retains GPU/CPU
  initialization fallback. Closing a scene terminates its worker.
- Reuse typed collision buffers, preserve neighbour order, skip unnecessary
  distance-field gradients and rebuild the field only when its silhouette changes.
- Skip empty condensation processing and blur each decoded camera frame once.
  WebKit without canvas filters uses a low-pass image fallback.
- Suspend camera capture tracks and camera-scene render loops while hidden;
  skip background rendering/physics in the other continuously rendered scenes.
- Generate lossless Brotli/gzip sidecars for code, styles, models, WASM, SVG and
  other compressible assets. Originals are retained. Production preview negotiates
  encodings, serves WASM with its proper MIME type and uses conditional caching.
- Transpile production syntax to Chrome/Edge 80, Firefox 78 and Safari 15 targets.
  This is a syntax target, not a guarantee that those browsers support every
  camera, graphics or MediaPipe capability. Development mode targets modern browsers.

## Measurements on the development computer

| Check | Before | After |
| --- | ---: | ---: |
| Initial Snow JavaScript, before camera models | 1,019.70 kB | about 59 kB across three chunks, including repeated snowman creation |
| 1,600-particle simulation, mean per fixed step | 4.79 ms | 1.03 ms |
| 1,600-particle simulation, 95th percentile | 6.96 ms | 1.61 ms |
| Compressible build assets, Brotli transfer | 42.90 MiB original | 16.45 MiB |

The physics benchmark uses deterministic input, 90 warm-up steps and 240 measured
steps. A separate comparison verified identical particle states against the prior
solver for 1,600 particles over 360 steps. These are Node measurements, not
device/browser frame-rate or temperature measurements.

Verification: 153 automated tests; 100 compressed sidecars decompressed byte for
byte; HTTP Brotli/gzip negotiation, WASM MIME, immutable asset caching and 304
responses checked against a real production preview server. Worker backpressure,
cancellation and fallback tests use a simulated worker. Real cameras, GPU worker
initialization, visual comparison and individual in-app browsers have not been
validated because browser automation is unavailable in this environment.

Snowmen now start from a dense pile of flakes pushed by any moving fingertip or
palm. Completed snowmen are painted once into a fixed-size transparent canvas.
There is no lifetime creation-count cap or growing list of live snowman geometry;
later creations roll to staggered positions while the completed layer remains.

The rolex scene reuses the hand-tracking worker. Its metal case, dial and
bracelet are cached Canvas images; only the watch hands, pose and reflections
are drawn dynamically. Tick/tock samples are generated once and scheduled on the
audio clock, with a bounded 2–30 Hz rate and explicit cancellation on teardown.
The opposite hand's camera pixels are restored above the watch using a palm and
finger mask derived from existing hand landmarks, without another inference model.
Persistent hand IDs keep the wearing wrist and manipulating fingertips separate
when MediaPipe changes detection order. These masks approximate the silhouette;
real-camera edge alignment and overlap have not been visually verified.
A fingertip entering the wrist area now creates a raised control needle, rendered
above both the watch and foreground hand. Captured rotation continues outside the
small dial and through short tracking gaps; direct angle control drives the actual
watch hands, with perspective mapping and an edge-on fallback. Regression tests
cover center contact, large full circles, rapid reversals and visible layer order.

## Run and verify

```powershell
npm.cmd run build
npm.cmd run preview
```

Preview defaults to http://localhost:4174/. Use production preview when measuring
download/startup performance; the development server does not serve the precompressed
build. Another hosting provider must enable Brotli/gzip or serve these sidecars with
the corresponding Content-Encoding headers.

```powershell
npm.cmd test
npm.cmd run benchmark:snow
npm.cmd run verify:compression
```

Universal operation and zero heat cannot be guaranteed. Camera access depends on
HTTPS/localhost, user permission, iframe policy and the host in-app browser.
WaterTouch and the 3D scenes require compatible WebGL hardware/drivers. Older or
restricted browsers may need to open the page in Safari/Chrome. The existing
permission/error messages remain available; the application does not bypass host
browser restrictions.
