# Tape Type

A browser-based brand utility for creating controlled cut-paper and tape headline treatments on a production-size 1080×1350 Instagram artboard.

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

## Cover styles

Two house styles, each a preset that can be adjusted afterwards:

- **Headline** — Barlow Bold in Title Case, left aligned, as one connected block or one strip per line. Title case is applied automatically (short words such as "to", "the" and "of" stay lowercase); it only ever capitalises, so deliberate capitals like "iPhone" or "RTÉ" survive.
- **Feature** — Barlow Bold in ALL CAPS on roomier strips with hand-torn ends, centred by default.

Tape colours come from the published covers: Light `#F1F1F1`, Dark `#111111` (white text), Yellow `#FFE900`, or None (white text straight on the photo).

An optional **eyebrow** label (Breaking, News, Exclusive, The Big Read, or any text) sits on top of the first line in caps. It is yellow, or white when the headline tape is yellow.

## How the shapes work

- Regular covers use a continuous 72–90px size range. The starting size follows the character count, then the browser measures the real text and shrinks it until it fits at most six lines in the chosen column.
- Columns: Narrow 620px (the default for headlines, like most published covers), Medium 760px, Wide 920px (the default for features). Everything stays inside the 80px safe area.
- Lines are balanced: the fewest lines that fit, with words spread so line lengths come out even rather than stranding one word.
- Series covers are an explicit separate format at the reserved 172px scale and allow at most two lines.
- Every line uses Canvas `actualBoundingBox*` glyph measurements, so tape fits the actual ink rather than the text's advance box. Text is re-measured whenever a web font finishes loading.
- The seed evaluates longest/shortest lines, abrupt length changes, and the final line to choose a structurally useful intervention point.
- Bands join as one continuous square, angled, stepped, or tucked SVG silhouette.
- A deterministic seed chooses from an approved grammar: clipped corner, torn extension, shallow bite, short tab, or stepped protrusion. Torn strips wander slightly off vertical at each end and often carry one thin paper sliver at a corner.

## Controls

- Style (Headline / Feature), title case, automatic or manual line breaks
- Eyebrow on/off, text and quick labels
- Block or strips, tape colour, tape cling (82–116%; above 100% crops slightly into the glyph bounds), line gap, rotation variance 0–2°
- Cut style: Clean cut, Torn, Tape, Cling, Rough cut
- Alignment, Top / Middle / Bottom position, column width, regular or series format, automatic or manual size
- Drag-to-position artwork within the 1080×1350 artboard and visible 80px safe-area guide

The preview, SVG exports and PNG exports are all drawn from the same layer list, so they match. Backgrounds render before all text layers so tucked or overlapping strips remain legible.

The most recent controls are saved in `localStorage`. Uploaded photos stay in the browser and can be included in full-artboard SVG and PNG exports.

## Export

- Full 1080×1350 editable SVG with live text (the primary export)
- Tightly cropped cutout SVG
- Full-artboard SVG markup copied to the clipboard for Figma
- 1080×1350 PNG at 1×
- 2160×2700 PNG at 2×
- 3240×4050 PNG at 3×

SVG text remains editable and references Barlow by font family. Install Barlow on the destination machine for an exact match; use the 2× or 3× PNG fallback when a receiving app cannot preserve the SVG font.
