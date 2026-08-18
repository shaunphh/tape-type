# Tape Type

A small browser-based tool for creating controlled cut-paper and tape shapes that hug headline text. Geometry is generated from the measured width of every line, then altered with one or two deterministic acute cuts, points, bites, or tails.

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

- Text is measured in the browser using the selected Barlow typeface.
- The focused type choices are Barlow, Barlow Semi Condensed, and Barlow Condensed.
- Each line produces a tightly padded band based on its actual text width.
- The seed evaluates longest/shortest lines, abrupt length changes, and the final line to choose a structurally useful intervention point.
- Bands join as one continuous square, angled, stepped, or tucked SVG silhouette.
- A deterministic seed chooses from an approved grammar: clipped corner, torn extension, shallow bite, short tab, or stepped protrusion.
- Seeds also vary which line extends or tucks and which side carries the overhang, so variations change the composition rather than surface decoration.
- Padding, hug strength, line height, cut depth, edge energy, and baseline join behavior are chosen automatically from the font and cut style.

## Focused controls

- All caps and automatic/manual wrapping
- Connected silhouette or one editable tape strip per line
- Tape cling and line gap
- Restrained per-line rotation variance from 0–2°
- Barlow, Barlow Semi Condensed, and Barlow Condensed
- Weight slider from 400–800, alignment, headline width, cut style, colour presets, and independent text colour

Separate-strip exports keep each background path and its text grouped with the same rotation. Backgrounds render before all text layers so tucked or overlapping strips remain legible.

The cut grammar includes clipped corners, angled whole-edge ends, shallow bites, stepped notches, torn extensions, short tabs, and protrusions. Each style selects from a restrained subset rather than adding arbitrary jagged points.
- Randomisation never invents arbitrary noisy points.

The most recent controls are saved in `localStorage`. Uploaded photos are preview-only and stay in the browser.

## Export

- Full editable SVG with live text
- Shape-only SVG
- SVG markup copied to the clipboard for Figma
- High-resolution transparent PNG

SVG text remains editable and references Barlow/Barlow Condensed by font family. Install the fonts on the destination machine for an exact match.
