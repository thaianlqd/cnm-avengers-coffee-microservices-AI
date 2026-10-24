# Shared Coffee artwork

`logo.svg` is the original black SVG supplied at repository root. `logo-white.svg`
contains the same paths with white fill for dark backgrounds.

Web apps serve copies from `public/images/brand/`. Mobile apps retain the SVGs
in `assets/branding/` and use PNG exports of those paths with React Native Image.
No image generation or redesign is involved.

To synchronize copies and regenerate native images, run `node scripts/sync-brand.cjs`
from repository root with the `sharp` package available to Node (or via NODE_PATH).
Legacy native filenames `logo-red.png` and `logo.png` are compatibility aliases
of the black source; new code can use `logo-black.png` and `logo-white.png`.
