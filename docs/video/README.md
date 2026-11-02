# Feature tour video

- `my-shop-app-tour.mp4`: 2-minute tour (1280x720, H.264 + AAC), with subtitles burned in and also as a soft
  subtitle track.
- `my-shop-app-tour.srt`: the same subtitles as a separate file (for players, or for translating to Hindi).
- `poster.jpg`: the first frame, used as the preview in the main README.

## How it was made
- **Pictures:** the real screenshots in `docs/screenshots/`, which the browser walkthroughs in `e2e/` produce.
- **Music:** original background music synthesised for this video, so there are no licence or attribution
  concerns.
- **Narration:** none (no AI voice).
- **Tools:** ffmpeg and a small Python script, both kept outside this repository so the app has no video
  dependencies.

## When to update
Update it when a feature shown in the video changes a lot. Small design changes don't need a new video.

To update it:
1. Re-run the `e2e/*.cjs` walkthroughs for fresh screenshots.
2. Rebuild the video with any slideshow tool: about 6 seconds per screenshot, with the captions from the `.srt`.
