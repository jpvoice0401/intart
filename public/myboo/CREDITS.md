# myboo assets and audio credits

## Las Vegas forward-driving footage — Pexels License

Day: `vegas-drive.mp4` and `vegas-drive-poster.jpg` derive from **Jason James**,
“Driving on the Iconic Las Vegas Strip”, Pexels video 36500011:

https://www.pexels.com/video/driving-on-the-iconic-las-vegas-strip-36500011/

Night: `vegas-night.mp4` and `vegas-night-poster.jpg` derive from **Jason James**,
“Vibrant Night Traffic in Downtown Las Vegas”, Pexels video 36147776:

https://www.pexels.com/video/vibrant-night-traffic-in-downtown-las-vegas-36147776/

License: https://www.pexels.com/license/

Original download:
Day: https://videos.pexels.com/video-files/36500011/15477029_2560_1440_60fps.mp4

Night: https://videos.pexels.com/video-files/36147776/15329576_2560_1440_60fps.mp4

Changes: selected day seconds 3–43 and night seconds 1–16; resized to 1280×720/30fps;
encoded as H.264/yuv420p with fast-start metadata; removed audio. Posters are stills
from each clip's beginning. The browser loops the footage, crops it to the car's
windshield and changes playback speed according to the driving controls. Daylight
begins fading at driving second 30 and transitions to the separate night recording
by second 45; a dusk tint and short final crossfade are added.
The recording determines the route. Steering changes the displayed view rather
than selecting a new street. No endorsement by the author, Pexels or Lamborghini is implied.

## Lamborghini engine audio — CC BY 3.0

`engine-low.wav`, `engine-mid.wav` and `engine-high.wav` are recorded Lamborghini engine excerpts,
downloaded from `svj/on_2000.wav`, `svj/on_4000.wav` and `svj/on_6000.wav` in the sample pack at:

https://github.com/justinagaudelli-eng/supercar-engine-sound/tree/main/public/samples/svj

Upstream attribution and processing notes:
https://github.com/justinagaudelli-eng/supercar-engine-sound/blob/main/public/samples/CREDITS.md

Original recording authors / sources credited by the upstream SVJ pack:

- **Super Cars for you**, “Lamborghini Aventador - engine and exhaust sound (YouTube oMKxhIcSmZs)”:
  https://commons.wikimedia.org/wiki/File:Lamborghini_Aventador_-_engine_and_exhaust_sound_(YouTube_oMKxhIcSmZs).opus
- **Erwin Lindsen**, “Lamborghini Aventador SV - engine and exhaust sound (YouTube qll6WBfaXvM)”:
  https://commons.wikimedia.org/wiki/File:Lamborghini_Aventador_SV_-_engine_and_exhaust_sound_(YouTube_qll6WBfaXvM).opus
- **ePic eXhaust**, “Lamborghini Aventador SVJ - engine and exhaust sound (YouTube zqv9zLtHsUM)”:
  https://commons.wikimedia.org/wiki/File:Lamborghini_Aventador_SVJ_-_engine_and_exhaust_sound_(YouTube_zqv9zLtHsUM).opus

License: Creative Commons Attribution 3.0 Unported:
https://creativecommons.org/licenses/by/3.0/

Upstream changes: recordings excerpted, pitch-flattened to constant RPM, looped and level-matched.
myboo changes: renamed sample files; in-browser looping, gain crossfades and fading
to create a short engine start/rev effect at ignition and every 20 seconds of visible driving.
Playback rate is fixed at 1 to retain each sample's recorded RPM/timbre. This app's
previous pitch ramps have been removed. On 2026-11-19, all three files were re-downloaded
and byte-checked against upstream, with RPM metadata, SHA-256 and authorship/license
records saved to `engine-provenance.json`. Vehicle identity follows the recording
authors' descriptions, not an independent acoustic identification.
The startup effect is assembled from the engine recordings; it is not a separate original ignition recording.
No endorsement by the original authors or Lamborghini is implied.

## Images

`cockpit.png` and `key.png` were generated with the built-in image generation tool
using the user's supplied Lamborghini photographs as visual references. They are
new illustrative assets, not official Lamborghini photographs. The final prompt set
is recorded in `docs/MYBOO.md` in the project.

The steering wheel, dashboard instruments and fingertip effects are drawn by this
project in Canvas. A procedural Las Vegas scene is retained only as a loading/error fallback.

## MediaPipe gesture model

Local model: `public/mediapipe/gesture_recognizer.task`.
Official source:
https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task

Official guide:
https://developers.google.com/edge/mediapipe/solutions/vision/gesture_recognizer?tab=Web
