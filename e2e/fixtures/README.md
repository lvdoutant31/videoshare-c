# Playback fixture

`seek-quality.mp4` is a generated 12-second test pattern and sine tone, with no user content.

Regenerate using FFmpeg:

```sh
ffmpeg -f lavfi -i testsrc=size=320x180:rate=15 -f lavfi -i sine=frequency=440 -t 12 -c:v libx264 -pix_fmt yuv420p -c:a aac -movflags +faststart seek-quality.mp4
```
