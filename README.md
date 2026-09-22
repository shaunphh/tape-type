# Tape Type

A browser-based brand utility for creating controlled cut-paper and tape treatments on a production-size 1080×1350 Instagram artboard.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite.

## Production build

```bash
npm run test
npm run build
npm run preview
```

The production output is written to `dist/`. The app has no backend, accounts, database, or runtime API dependency.

## Deploy to GitHub Pages

The repository includes a GitHub Actions workflow that tests, builds, and publishes the app whenever `main` is updated. In the repository's **Settings → Pages**, set **Source** to **GitHub Actions**.

The Pages build uses `/tape-type/` as its Vite base path, matching the repository name. The expected public URL is:

```text
https://<github-username>.github.io/tape-type/
```

To verify the exact production build locally:

```bash
npm run build:pages
```

If the repository is renamed, update the Pages base path in `vite.config.ts`.

## Alternative hosting

The regular `npm run build` output can also be deployed to Vercel or another static host. It uses `/` as its base path and writes the site to `dist/`.

## How the shapes work

- Regular cover headlines use the approved continuous 72–90px flex zone. The initial size follows headline character count, then the browser measures and wraps the actual text within a 920px area.
- Barlow Bold at weight 700 is locked for cover artwork. All-caps input is flagged for sentence-case editing.
- Headlines can use at most four lines. If a headline still exceeds four lines at 72px, the UI asks for an edit rather than shrinking off-scale.
- Series covers are an explicit separate format at the reserved 172px scale and allow at most two lines.
- Every line uses Canvas `actualBoundingBox*` glyph measurements, producing substantially tighter tape bounds than advance-width or generic line-box calculations.
- The seed evaluates longest/shortest lines, abrupt length changes, and the final line to choose a structurally useful intervention point.
- Bands join as one continuous square, angled, stepped, or tucked SVG silhouette.
- A deterministic seed chooses from an approved grammar: clipped corner, torn extension, shallow bite, short tab, or stepped protrusion.
- Seeds also vary which line extends or tucks and which side carries the overhang, so variations change the composition rather than surface decoration.
- Padding, hug strength, line height, cut depth, edge energy, and baseline join behavior are chosen automatically from the font and cut style.

## Focused controls

- Regular or recurring-series cover format
- Automatic brand sizing or a manual integer size constrained to 72–90px
- Automatic wrapping or deliberate manual line breaks
- Connected silhouette or one editable tape strip per line
- Tape cling and line gap
- Tape cling runs from a close fit through 100% contact to a restrained 116% over-cling that crops slightly into the glyph bounds. The default is a near-touching 108%.
- Restrained per-line rotation variance from 0–2°
- Alignment, cut style, colour presets, and independent text colour
- Drag-to-position artwork within the 1080×1350 artboard and visible 80px safe-area guide

Separate-strip exports keep each background path and its text grouped with the same rotation. Backgrounds render before all text layers so tucked or overlapping strips remain legible.

The cut grammar includes clipped corners, angled whole-edge ends, shallow bites, stepped notches, torn extensions, short tabs, and protrusions. Each style selects from a restrained subset rather than adding arbitrary jagged points.
- Randomisation never invents arbitrary noisy points.

The most recent controls are saved in `localStorage`. Uploaded photos stay in the browser and can be included in full-artboard SVG and PNG exports.

## Export

- Full 1080×1350 editable SVG with live text (the primary export)
- Tightly cropped cutout SVG
- Full-artboard SVG markup copied to the clipboard for Figma
- 1080×1350 PNG at 1×
- 2160×2700 PNG at 2×
- 3240×4050 PNG at 3×

SVG text remains editable and references Barlow by font family. Install Barlow on the destination machine for an exact match; use the 2× or 3× PNG fallback when a receiving app cannot preserve the SVG font.
