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
- **A photo stays where it was chosen.** The cover, the video cover and each kind of inside page has its own photo, with its own position, so choosing one for a page changes no other. A quiet **Change photo** sits in the corner of the picture on the canvas; it is not part of the artwork.
- **Darken photo** lays 15% black over the photo so the words and marks read. It is on by default and can be switched off.
- **Logo**: Off, Left or Right. The Alternative Dublin logo sits in a top corner of the safe area, 210px wide, with DUBLIN lined up on that side.
- **Swipe arrow**: the painted arrow sits in the bottom right corner of the safe area, 100px wide (it was drawn at 137), on covers and inside pages alike.
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

A post is a cover and, usually, a page or two inside it. An inside page is a picture, a title or a label, the story, then a highlight, on brand black.

It comes in two kinds, chosen under **Kind of page**. A **Title page** opens with a title: a story, with the date and place under it. A **Label page** opens with a label over a list: names, a line-up, what's on. A page has one or the other, not both: the field it has no use for stays on show, switched off (`?unlocked` opens it). Each kind keeps its own words, switches, picture height and place, and arrow, so switching between them loses nothing. Each starts with an example that shows how its words are typed: the Title page (**Event**) with a tall picture at the top and the date and place at the foot, the Label page (**Meet the artists**) with a tall picture at the bottom and its closing line a size up.

Under the two kinds, **Template** lists the pages that kind can start from: the example first, then the templates saved for it (see below). Choosing one fills the page with its words and switches, its picture, and that picture's height, place and framing, and on a label page its label cut. A page still as its template has it takes another straight away; one that has been changed asks first, since it takes the words typed with it. The one the page started from is marked, with "Changed" once it has been. **Back to the template** puts the page back as its template has it, after asking. A photo of your own is set aside while a template's picture shows, not lost: **Use your photo**, on the picture and in the Photo panel, brings it back as it was framed, and choosing another photo replaces it.

What is typed and chosen is remembered in that browser, and only there: it never changes the templates. Photos are not remembered: after a reload a page shows its template's sample again.

- **Label**: a few words in capitals on light tape, over whatever comes first on the page ("Meet the artists"). Barlow ExtraBold at 38px, its lettering starting on the margin like the lines under it. Leave it empty for none. Its cut is its own: Label cut and Randomise cut, under the box, change the label and leave the cover's tape alone. It starts with the Clean cut, one quiet cut, like the labels on the Canva pages.
- **Title**: Barlow Bold, white. It takes the largest size from 52px down to 45px that fits in three lines.
- **Text**: the story, in Barlow Regular at 38px (28.5 in Canva, whose sizes are points), lines 1.3 apart at 38px and 1.2 at 42px, in the grey (`#C2C2C2`).
- **Highlight**: a closing line, or the date, place and tickets, under the story. It is the story's weight, and starts in the title's white. (The code calls it `details`.)
- **Colour and size**: each of the two boxes has the same two switches under it. Colour sets it in the grey or in white; size sets it at 38px or a size up, 42px.
- **Highlight sits**: under the text, or at the foot of the words' room, with whatever space there is between the two. The foot is the bottom margin, or the top of a picture at the bottom. A picture that fills has taken that space already, so the switch is off with one.
- **Picture**: None, Short (340px), Medium (430px), Tall (540px, what both examples start with) or Fill. Drag it inside its banner, or use the sliders, as on a cover. Until a photo is chosen for it, a page shows its template's **sample picture**, so it reads as a page from the start: the template's own, or its kind's (`src/assets/samples/title-page.jpg` and `label-page.jpg`; swap the files to change them). It says it is the template's photo on the canvas, and exports as it is, so a template whose picture suits can be downloaded without changing it; choosing a photo of your own replaces it.
- **A height of its own**: drag the picture's edge that faces the words (the grip on it: under a picture at the top or in the middle, over one at the bottom). It goes from 260px up to the room the words leave, and no further, so dragging never pushes words off the page. On the way it catches Short, Medium and Tall, and dragged all the way it fills, so it goes on filling as the words change; in between, Picture shows "Its own height" and none of the buttons. With the grip in focus, the arrow keys move the edge 10px (with Shift, 50px), Home makes the picture the smallest and End makes it fill. The grip is on the canvas only, never in an export; templates keep the height.
- **Position**: where the picture goes. **Top**: above the words. **Middle**: after the first thing on the page, which is the title, or the story when there is no title. **Bottom**: under the words, on the foot of the page, with the arrow over it.
- **Marks**: the arrow is on to start with, in white; Logo & arrow switches it off, or sets its colour, for that kind of page. It keeps its corner whatever is typed, and takes no room from the words: they run down to the bottom margin either way. When words do run under it, the panel says so, and nothing is blocked. An inside page goes without the logo for now, so its words start at the top of the page: the choice is greyed out, and `?unlocked` opens it (the logo is small here, 128px, and the words then start under it).

A picture that **fills** takes the room the words leave, so the page is always full: at the top the words sit on the foot of the page, in the middle the first words stay at the top and the rest go to the foot, and at the bottom the picture runs from under the words to the foot. It is never less than 260px tall; past that the words are too long.

Under the title, what matters more or less is told apart by how bright it is, and by the marks put round words. In the text and the highlight:

- a blank line starts a new paragraph, and a new line is a new line;
- a line starting with a dash is a bullet;
- words in `**two stars**` are bold and white, and in `*one star*` semibold and white;
- words in `_underscores_` are italic, and in `__two underscores__` underlined, in the colour of the words round them;
- marks go round a whole line or part of one (`with **AE MAK** and *Zaska*`), hugging the words, and can sit inside each other (`**_bold and italic_**`). A mark that hugs nothing, or sits inside a word, a sum or a name (`5* hotel`, `2*3*4`, `some_file_name`), is left as typed.

Over each box, **B**, **S**, **I**, **U** and **•** put the marks in for the words picked in it, or take them off again; "How to format the words", under the boxes, lists them. An underline is drawn, not asked of the font, so the preview and every export have it in the same place.

Emoji typed into either box are drawn as the device draws them.

The panel counts the lines of text and highlight against the room the page has, and exports are blocked while they run over: cut them, use a shorter picture, or none. With a Medium picture and a three-line title there is room for about ten lines. A picture in the middle costs about two lines more than one at the top or the bottom, because it has a gap on both sides.

Sizes, margins and greys follow the article pages of the Alternative Dublin social templates; they are set at the top of `src/inside.ts`. The cutout SVG is for covers only.

#### Saving templates

The published tool is a static site: nothing typed into it leaves the browser it was typed in. Templates are part of the tool instead, as files in `src/templates/<kind>/`, and go out to everyone with it.

They are made in the tool itself, in one of two places:

- **The published tool, opened with `?unlocked`** (`https://shaunphh.github.io/tape-type/?unlocked`). Saving there commits the template straight to `main` on GitHub, which rebuilds and publishes the tool: everyone has it in a minute or so. It lists at once in the browser that saved it. It takes a **GitHub key**, asked for the first time: a fine-grained personal access token for `shaunphh/tape-type` only, with Contents set to "Read and write" (make one under GitHub's Settings → Developer settings → Fine-grained tokens; the tool links there). The key is kept in that browser only (**Forget the GitHub key** takes it away) and is only ever sent to GitHub. Each save or removal is one commit; if `main` moved on meanwhile, it is made again on top.
- **The dev server on your own machine** (`npm run dev`). Saving there writes the files into the project, for the next push to `main`.

Under the templates, **Save as template** saves the page in view: give it a name and a line on what it's for. It is saved as `src/templates/<kind>/<name>.json`, the name in small letters with dashes (`News story` is `news-story.json`), and shows in the list straight away. It keeps the page's words and switches, its picture's height, place and framing, and on a label page the label's cut and seed. With a photo on the page, **Keep your photo in it** (on to start with) saves the photo beside it, as `<name>.jpg`, no more than 1600px along its longer side: it becomes the template's picture, shown (and exported) until someone chooses their own. Switched off, or with no photo of your own, the template keeps the sample the page shows. Save as many as you like: each new name is a new template, added to the end of the list. Saving under a name that is taken saves over that template, keeping its place in the list, and the form says so first. When the page started from a saved template, **Update** (its name) under the button opens the form with that template's name and line in it, to save the page over it, and **Remove** takes it out of the list and deletes its files, after asking; the page keeps its words. The examples are written into `src/inside.ts` (`PAGE_KINDS`) and can't be saved over or removed.

Templates are listed oldest first after the example. A template file is read like anything remembered: a switch it lacks, or one that is wrong, is its kind's example's. The files can be edited by hand; `src/templates.test.ts` checks each still reads as it was written.

#### Trying other sizes and weights

Run on your own machine (`npm run dev`, or any `localhost` address), the inside page has one more panel: **Type · this machine only**. It sets the title's largest and smallest size, weight and line height; the text's size, weight and line height; the highlight's two sizes and its weight; the weights of words in two stars and in one; and the label's size and weight. Weights are Barlow's 400 to 900. The preview and the exports follow, and what was tried is remembered in that browser.

The published tool never shows the panel and never reads what it saved, so everyone else's pages stay in the tool's own sizes. **Copy values** puts the settings on the clipboard in words; to make them the tool's own, write them into `TITLE`, `BODY`, `DETAILS`, `STRONG` and `LABEL` at the top of `src/inside.ts`. **Back to the tool's** undoes the trial. A trial is also dropped once the tool's own values change, since it has then done its job.

The preview of an inside page is the same size as a cover's, so the two can be judged side by side.

### Video covers

A video cover is 9:16 (1080×1920), where a post's pages are 4:5 (1080×1350). Exports follow: a video cover's PNGs are 1080×1920, 2160×3840 and 3240×5760.

The profile grid shows tiles at 3:4, so it keeps only the middle of a video cover: the top and bottom 240px are cut off there. The preview draws both lines. The words are kept inside them (80px in), so a title always survives the grid. The logo and the arrow sit in the corners of the whole cover, outside the lines, so they show on the cover itself but not on the grid.

A video cover is one of three kinds, which set the text block:

| Kind | Words | Tag | Starts |
|---|---|---|---|
| Quick report | Yellow tape, black words | "Quick watch", dark tag | Bottom left |
| Presenter led | Dark tape, white words | "Quick guide", light tag | Top left |
| Feature video | Capitals on light tape | None | Middle left |

The tag's words can be changed or switched off, and the block can be dragged anywhere inside the lines. On a video cover the tag's colour is open too: **Eyebrow colour** sets it yellow, light or dark in place of the look's own, with lettering that reads on it. The tape's own colour is left out, since the tag would be lost on it, and a change of kind puts the tag back to that kind's own. On a post the choice is greyed out for now. The kinds are set out in `src/formats.ts`.

### Locked choices

For now the text block keeps to the look of what is being made. A post's is black words on a light block of tape, rough cut, left aligned, starting low on the cover: 90% of the way down the room its lettering has, where it suits most photos. Each kind of video has its own (above), and all three start in the Tape cut. The other choices are greyed out rather than removed, so people can see what is coming: style, tape colour, Block or Strips, alignment and the Series format. The line height is held at 0.94 of the type size, so the Line gap slider is greyed out too. The Narrow column is switched off, so covers start in the Medium one and can go Wide; every time the tool opens it starts in Medium again, whatever column was picked last time. The tape's cling is held at 100%. The cut styles stay open, as do position, size and rotation. Beyond the text block, one thing is held: the arrow takes the logo's colour. The photo, the logo and its colour are free.

The cut is a free choice, so it is remembered, and a change of the house cut would never reach a browser that had remembered the old one. The first time the tool opens after such a change, the cover takes the look's cut (a post's is the rough cut, a video's the tape cut); after that the choice is the person's again. For the next change, count up `HOUSE_CUT_KEY` in `src/locks.ts`.

The settings that are held, and single choices that are switched off, are listed in `src/locks.ts`; take one off its list to open it up. Settings saved before the locks went on, or under another look, are put into the one in use, keeping the words. Opening the tool with `?unlocked` at the end of the address lifts every lock.

## Cover styles

Two house styles, each a preset that can be adjusted afterwards (**Reset style** puts it back):

- **Headline**: Barlow Bold (700) in Title Case, left aligned, on one plain rectangle of tape, or on one strip per line stacked flush. Title case is applied automatically (short words such as "to", "the" and "of" stay lowercase and are moved to the end of a line rather than starting one, giving up a few pixels of size when that is what it takes); it only ever capitalises, so deliberate capitals like "iPhone" or "RTÉ" survive, and "3rd" or "1990s" stay as typed.
- **Feature**: Barlow Bold (700) in ALL CAPS on roomier strips with hand-torn ends, centred and slightly turned, with gaps between.

Every cover is set in the one weight, Barlow Bold, whatever its style or kind. (The published feature covers measured as Black: stem 0.27 of cap height, where Bold is 0.20. Both weights are set in `src/layout.ts`.)

Each style remembers how it was last set up during a session, so switching to Feature and back keeps your Headline choices.

Tape colours are the brand's: Light `#F0F0F0`, Dark `#101010` (white text), Yellow `#FFED1F`, or None (white text straight on the photo). The Dark background is the same brand black.

An optional **eyebrow** label (Breaking, News, Exclusive, The Big Read, or any text such as a date range) sits on the first line in capitals at 34 to 41px: nine tenths of the published tags, which are about 40px (`EYEBROW_SCALE` in `src/layout.ts`; the inside page's label follows it). It is yellow, or white on yellow tape or a yellow background. A long label shrinks to fit the safe area, and export is blocked if it still can't.

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

Upright text is drawn from Barlow's variable font (`src/assets/fonts/BarlowGX-Normal.ttf`, the Event Guide's width-pinned instance, weights 22–188), the one Barlow all the AD tools share since 2 October 2026; the code keeps the usual 400–900 and `src/barlow.ts` turns them into the variable font's own scale (Bold 700 = 141). There is no variable italic, so italics come from the static Fontsource files, as does any line with a letter the variable font lacks (Vietnamese, for one).

SVG text stays editable and embeds what it uses: the variable font once for upright text, and the static Barlow subsets (latin, latin-ext, Vietnamese) for italics and those lines, so it renders correctly in browsers and viewers without Barlow installed. Design tools that ignore embedded fonts (Figma, Illustrator) use their own Barlow instead; if a font file can't be fetched the app says so, and the PNG is always exact.
