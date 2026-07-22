# Licence of this package

`@cutscene/editor` publishes a **built** editor: the `dist` directory, which
carries the render pipeline the Cutscene runner drives.

**Cutscene's own source code is MIT.** It lives at
<https://github.com/macayu17/Cutscene> and the MIT text is in `LICENSE` there.

**This package's `dist` additionally contains `@ffmpeg/core` 0.12.10**
(`ffmpeg-core.js`, `ffmpeg-core.wasm`), a WebAssembly build of FFmpeg including
x264, licensed under the **GNU General Public License, version 2 or later**.
Its full text ships in `dist/licenses/GPL-2.0.txt`, alongside
`dist/licenses/NOTICE.txt`, which names the corresponding sources.

Because that component is distributed here, **this package as a whole is
governed by the GPL, version 2 or later**. Cutscene's own source remains
available under MIT from the repository above, and a build of the editor
without H.264 export does not include the GPL component at all.

If you want the MIT-only parts, take `@cutscene/trace`, which contains no
bundled binaries.
