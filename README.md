# Tape Type

A browser-based brand utility for creating controlled cut-paper and tape headline treatments on production-size Instagram artboards: 1080×1350 posts and 1080×1920 video covers.

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

## Finished covers

The tool makes the whole cover, not only the headline:

- **Photo**: choose a photo, then drag it on the cover to reposition it (a press on the words moves the words; anywhere else moves the photo). The Photo group has Zoom (100–300%), Left – right and Up – down sliders, and Reset position. On phones a sideways swipe moves the photo and the sliders do the rest, because vertical swipes scroll the page.
- **Darken photo** lays 15% black over the photo so the words and marks read. It is on by default and can be switched off.
- **Logo**: Off, Left or Right. The Alternative Dublin logo sits in a top corner of the safe area, 210px wide, with DUBLIN lined up on that side.
- **Swipe arrow**: the painted arrow sits in the bottom right corner of the safe area, 110px wide (it was drawn at 137).
- **Colour**, for each mark: Auto, Yellow, Light or Dark. A chosen colour is used as it is. On Auto the mark is yellow wherever yellow reads: the tool checks the contrast between the mark and what is behind it (the photo as the cover shows it, darkening included). Where yellow doesn't read, the mark takes the colour that does, which on bright ground is Dark. Moving or zooming the photo can change the result. The panel says what Auto picked, and warns when the colour in use is hard to read:
  - *Nothing reads well here* (on Auto): the ground is part dark and part bright, so no colour reads on most of it, and the mark takes the one that reads on more of it. Moving the photo usually fixes it.
  - *Hard to read here*: the chosen colour doesn't read on this ground.

  For now the arrow takes the logo's colour whenever both are on the cover, and its own colour control is greyed out. It is still checked against what is behind it, and the panel says when the logo's colour is hard to read there. With the logo off, the arrow's colour can be chosen as before.

  A colour reads when its contrast with the ground is 50 or more on at least three quarters of the ground under the mark. Contrast is measured the way the draft of the next accessibility guidelines does (APCA), which agrees with the eye that light marks hold up on mid tones such as a blue sky; 45 is its figure for large, heavy lettering. On the Yellow background Auto is dark, and with a see-through background, where there is nothing to check, it is yellow.

The headline's lettering keeps clear of both marks. A headline beside a mark stays where it was put; one that would sit on a mark steps aside by the shortest way that stays inside the safe area, so a full-width headline starts under the logo at Top and stops above the arrow at Bottom. The marks are part of the PNG and full SVG exports, and left out of the cutout SVG.

The marks are outlines, read from the SVG files in `src/assets`. `node scripts/prepare-mark.mjs <exported.svg> src/assets/<name>.svg` crops a mark exported from a design tool to its artwork. Sizes, spacing and the contrast a mark needs (`READS_FROM`) are set in `src/furniture.ts`.

### What is being made

The switch above the canvas picks one of three: a post's **Cover**, its **Inside page**, or a **Video cover**. It is always in view, and each keeps its own words, picture and marks.

### Inside page

A post is a cover and, usually, one page inside it. The inside page is a picture, a label, a title, the story, then the details, on brand black:

- **Label**: a few words in capitals on light tape, over whatever comes first on the page ("Meet the artists"). Barlow Bold at 50px, its lettering starting on the margin like the lines under it. Leave it empty for none. It is cut like the cover's tape: the cut style and Randomise cut under it are the cover's own, so changing them here changes the cover too.
- **Title**: Barlow Bold, white. It takes the largest size from 69px down to 52px that fits in three lines.
- **Text**: the story, in Barlow Medium at 38px (28.5 in Canva, whose sizes are points), light grey, lines 1.32 apart.
- **Details**: dates, place, tickets. The same size in a lighter weight (Regular), under the story.
- **Picture**: None, Short (340px), Medium (430px), Tall (540px) or Fill. It starts as the cover's photo and can be given its own; drag it inside its banner, or use the sliders, as on a cover.
- **Position**: where the picture goes. **Top**: above the words. **Middle**: after the first thing on the page, which is the title, or the story when there is no title. **Bottom**: under the words, on the foot of the page, with the arrow over it.
- **Marks**: the arrow is on and the logo is off to start with. The logo is small here (128px) and both sit on the page's 56px margin. With the picture in the middle or at the bottom, the words start under the logo.

A picture that **fills** takes the room the words leave, so the page is always full: at the top the words sit on the foot of the page, in the middle the first words stay at the top and the rest go to the foot, and at the bottom the picture runs from under the words to the foot. It is never less than 260px tall; past that the words are too long.

Everything under the title is one size, and what matters more or less is told apart by weight alone. In the text and the details:

- a blank line starts a new paragraph, and a new line is a new line;
- a line starting with a dash is a bullet;
- a line in `*stars*` is bold and white: a name, a lead sentence, a call to book.

Emoji typed into either box are drawn as the device draws them.

The panel counts the lines of text and details against the room the page has, and exports are blocked while they run over: cut them, use a shorter picture, or none. With a Medium picture and a three-line title there is room for about seven lines. A picture in the middle costs about two lines more than one at the top or the bottom, because it has a gap on both sides.

Sizes, margins and greys follow the article pages of the Alternative Dublin social templates; they are set at the top of `src/inside.ts`. The cutout SVG is for covers only.

### Video covers

A video cover is 9:16 (1080×1920), where a post's pages are 4:5 (1080×1350). Exports follow: a video cover's PNGs are 1080×1920, 2160×3840 and 3240×5760.

The profile grid shows tiles at 3:4, so it keeps only the middle of a video cover: the top and bottom 240px are cut off there. The preview draws both lines. The words are kept inside them (80px in), so a title always survives the grid. The logo and the arrow sit in the corners of the whole cover, outside the lines, so they show on the cover itself but not on the grid.

A video cover is one of three kinds, which set the text block:

| Kind | Words | Tag | Starts |
|---|---|---|---|
| Quick report | Yellow tape, black words | "Quick watch", dark tag | Bottom left |
| Presenter led | Dark tape, white words | "Quick guide", light tag | Top left |
| Feature video | Capitals on light tape | None | Middle left |

The tag's words can be changed or switched off, and the block can be dragged anywhere inside the lines. The kinds are set out in `src/formats.ts`.

### Locked choices

For now the text block keeps to the look of what is being made. A post's is black words on a light block of tape, left aligned; each kind of video has its own (above). The other choices are greyed out rather than removed, so people can see what is coming: style, tape colour, Block or Strips, alignment and the Series format. The line height is held at 0.94 of the type size, so the Line gap slider is greyed out too. The Narrow column is switched off, so covers start in the Medium one and can go Wide. The cut styles stay open, as do position, size, tape cling and rotation. Beyond the text block, one thing is held: the arrow takes the logo's colour. The photo, the logo and its colour are free.

The settings that are held, and single choices that are switched off, are listed in `src/locks.ts`; take one off its list to open it up. Settings saved before the locks went on, or under another look, are put into the one in use, keeping the words. Opening the tool with `?unlocked` at the end of the address lifts every lock.

## Cover styles

Two house styles, each a preset that can be adjusted afterwards (**Reset style** puts it back):

- **Headline**: Barlow Bold (700) in Title Case, left aligned, on one plain rectangle of tape, or on one strip per line stacked flush. Title case is applied automatically (short words such as "to", "the" and "of" stay lowercase and are moved to the end of a line rather than starting one, giving up a few pixels of size when that is what it takes); it only ever capitalises, so deliberate capitals like "iPhone" or "RTÉ" survive, and "3rd" or "1990s" stay as typed.
- **Feature**: Barlow Bold (700) in ALL CAPS on roomier strips with hand-torn ends, centred and slightly turned, with gaps between.

Every cover is set in the one weight, Barlow Bold, whatever its style or kind. (The published feature covers measured as Black: stem 0.27 of cap height, where Bold is 0.20. Both weights are set in `src/layout.ts`.)

Each style remembers how it was last set up during a session, so switching to Feature and back keeps your Headline choices.

Tape colours are the brand's: Light `#F0F0F0`, Dark `#101010` (white text), Yellow `#FFEF3A`, or None (white text straight on the photo). The Dark background is the same brand black.

An optional **eyebrow** label (Breaking, News, Exclusive, The Big Read, or any text such as a date range) sits on the first line in capitals at about 40px, like the published tags. It is yellow, or white on yellow tape or a yellow background. A long label shrinks to fit the safe area, and export is blocked if it still can't.

## How the shapes work

- Regular covers use a continuous 72–90px size range. Headlines start from the character count, features start at 90px; both shrink until they fit at most six lines in the chosen column, and give up a few more pixels if that saves a whole line.
- Columns: Narrow 620px (like most published covers; switched off for now), Medium 760px (where covers start), Wide 920px.
- Lines are balanced: the fewest lines that fit, with words spread so line lengths come out even rather than stranding one word.
- Series covers are an explicit separate format at the reserved 172px scale and allow at most two lines.
- Tape fits the letters' ink, not their advance boxes. The ink is measured the same way in every browser: canvas gives the advance width, and the first and last letters' side bearings come from Barlow itself (`src/barlowBearings.ts`, generated by `node scripts/extract-bearings.mjs`). Browsers disagree on canvas ink boxes (Safari reports advance boxes), which used to give the same headline a looser tape and different line breaks in Safari. Text is re-measured whenever a web font finishes loading, and exports wait while fonts load.
- Headline tape starts close to the first letter and runs on about a quarter of an em past the end of the line, as on the published covers.
- The cut styles other than Plain use a deterministic seed to choose from an approved grammar: clipped corner, torn extension, shallow bite, short tab, or stepped protrusion. Torn strips wander slightly off vertical at each end and often carry one thin paper sliver at a corner. Every random choice is drawn in a fixed order (per strip), so changing rotation or alignment doesn't re-cut a design you picked.
- Joins between lines of a block bend only into the empty side of each step, so they never cut into ascenders or descenders, even with a negative line gap. No cut is kept if it would uncover any part of a letter that the tape covered before it.

## Controls

- Style (Headline / Feature) with Reset style, title case, automatic or manual line breaks
- Eyebrow on/off, text and quick labels
- Block or strips, tape colour, tape cling (82–116%; above 100% crops slightly into the glyph bounds), line gap, rotation variance 0–2° for strips
- Cut style: Plain, Torn, Clean cut, Tape, Cling, Rough cut (Randomise is off for Plain and for no tape, where there is no cut to vary)
- Alignment, Top / Middle / Bottom position, column width, regular or series format, automatic or manual size
- Drag (or arrow keys, Shift for bigger steps) to position the artwork. All lettering stays inside the 80px safe area; the tape and eyebrow tag may reach into the margin. On phones, vertical swipes scroll the page and height is set with Top / Middle / Bottom.
- Photo position, zoom and darkening; logo side and colour; swipe arrow and its colour (see Finished covers)

The preview, SVG exports and PNG exports are all drawn from the same layer list, so they match. Backgrounds render before all text layers so tucked or overlapping strips remain legible. On desktop the preview stays in view while the controls scroll.

The most recent controls are saved in `localStorage`, and stored values are checked on load. Uploaded photos stay in the browser. The whole photo is kept (as sRGB JPEG, at up to the 3× export size and no more than 16 megapixels) so it can be repositioned; the preview and PNG exports draw from it, and SVG exports embed only the part the cover shows.

## Export

- Full editable SVG with live text (the primary export): 1080×1350 for a post, 1080×1920 for a video cover
- Tightly cropped cutout SVG
- Full-artboard SVG markup copied to the clipboard for Figma
- PNG at 1×, 2× and 3×: 1080×1350, 2160×2700 and 3240×4050 for a post

Exports are blocked, with the reason and a suggested fix shown, while a headline is empty, doesn't fit, or its lettering (eyebrow and rotation included) is bigger than the safe area.

SVG text stays editable and embeds the Barlow subsets it uses (latin, latin-ext, Vietnamese), so it renders correctly in browsers and viewers without Barlow installed. Design tools that ignore embedded fonts (Figma, Illustrator) use their own Barlow instead; if a font file can't be fetched the app says so, and the PNG is always exact.
