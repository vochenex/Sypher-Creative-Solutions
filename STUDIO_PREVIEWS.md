# Studio introduction and portfolio previews

The introduction sits immediately after the homepage hero in `public/index.html`.
The Services section contains Branding, Web Development, and Multimedia cards.
Branding opens six previews spanning Logofolio, Visual Identity, Social Media
Design, and Product Mockup Design, with permanent links to all four collections;
Web Development and Multimedia each contain four supplied design previews.
The “Start a project” card remains below the previews.

## Featured Works in the homepage hero

The six hero cards now use actual entries from Works: Moko visual identity,
AV / Avengers product mockups, Brewora, CTech, Stride Billboard, and Stride
Brochure. Each hero link and image matches its Works entry and opens the same
detail-page anchor. Lumen, Kiln, Northwind, and Harbor are removed from the hero.
The first-image preload uses the Moko identity artwork.

Artwork is shown in full with a separate caption area. Carousel dot labels use
the project name, including distinct Stride Billboard and Stride Brochure
labels. The existing six-card High/Medium carousel and Basic grid are retained.

Verified: all six cards match Works in the browser and source; detail-page
fragments and image files exist; the CTech carousel link opens its web study;
High, Medium, Basic, and the 375px Basic grid pass without horizontal overflow.
JavaScript syntax and diff checks pass. The selection map is recorded in
`../artifacts/hero-works-projects.json`.

To add work later, place preview images in `public/assets/images/` and fill the
matching array in `public/js/studio-intro.js`:

```js
var work = {
  branding: [
    {
      src: 'assets/images/your-brand-project.jpg',
      title: 'Your project name',
      alt: 'Describe the actual work shown in this image',
      href: 'branding.html#your-project'
    }
  ],
  web: [],
  multimedia: []
};
```

Filled previews link to their project details. Hidden preview links are removed
from the keyboard tab order. Permanent collection links remain available below.

Click, tap, Enter, or Space toggles the selected service's preview grid. Escape,
an outside click, or moving keyboard focus outside the board closes it. Escape
from a preview returns focus to its service button. Desktop previews appear
below the three cards; phone previews appear directly after the selected card.

`public/css/service-cards.css` provides the mode-specific card treatment. High
uses layered Nexora, Brewora, and Stride compositions, paper surfaces, shadows,
and subtle hover/gallery motion when full motion is available. Medium and Basic
use flat surfaces and a single static artwork preview. Reduced motion keeps
High's visual composition while disabling movement. There are no continuous
card animations. Without JavaScript, the static cards and collection links remain.

Verified: High/Medium/Basic switching, equal desktop card heights, phone stacking
without horizontal overflow, gallery toggling, keyboard activation, Escape focus
return, and the system reduced-motion setting. JavaScript syntax and diff checks pass.

The branding collection uses all nine original logos from `branding/Logo/`,
with AV / Avengers in the center position of the reference layout. The three
supplied visual identity boards are Moko, Stride, and Fleura. Public copies live
in `public/assets/branding/`; source artwork remains in the workspace's
`branding/` directory. The logofolio and three identity boards appear in Works
under the Branding filter and link to the collection's design notes and boards.
All are labeled as concepts; no client results are inferred from the artwork.

`public/visual-identity.html` presents Moko, Stride, and Fleura as individual
cream editorial panels. Desktop places descriptions and typography on the left,
with the identity collage on the right; narrow screens stack these sections.
Each collage uses SVG viewBoxes and explicit clip paths into the corresponding
original board. Primary logos, logotypes, brandmarks, submarks, and typography
samples retain the supplied artwork. Palette swatches use the hex values printed
on each board. No project date or client background is inferred.

Services previews, the three Works identity entries, and the logofolio's visual
identity links lead to `visual-identity.html#identity-moko`, `#identity-stride`,
or `#identity-fleura`. Each presentation links to its complete original board.
The nine-logo logofolio remains in `branding.html`, including AV / Avengers.

`public/social-media.html` presents the three supplied social profile/feed
designs: AV / Avengers, Fleura, and Moko. `public/product-mockups.html` contains
all 40 supplied mockups: 13 AV / Avengers, 9 Axis, 9 Nexora, and 9 Velora.
The seven collections have individual Works entries under Branding. Shared
collection navigation connects all four branding detail pages.

Original PNGs are copied byte-for-byte to `public/assets/branding/social/` and
`public/assets/branding/mockups/<brand>/`. JPEG previews preserve proportions;
mockup previews are at most 800 pixels on the longest side and never upscaled.
Social previews retain the original 1254-square dimensions. Full original files
remain accessible from the gallery viewer. All presentations describe concepts,
without inferring client results or product specifications from mockup text.

`public/js/branding-gallery.js` uses a native modal dialog to enlarge artwork.
Previous/next buttons and left/right arrow keys cycle within the selected
collection. Escape, Close, or the backdrop closes the viewer and returns focus
to the opening image. Without JavaScript, artwork links open the original file.
Styles live in `public/css/branding-applications.css`.

Styles live in `public/css/studio-intro.css` and `public/css/branding.css`.
The editorial identity presentations use `public/css/visual-identity.css`.

## Web design portfolio

`public/web-development.html` presents the four desktop screenshots supplied in
`web dev/Web Design/`: Brewora, CTech, ModuSole, and Putahe. The source filename
`Brewcora.png` is preserved in the workspace, while the portfolio uses the
visible screenshot name, Brewora. Putahe is presented as a product-list
management interface. The page describes visible design elements without
inferring deployment, working checkout behavior, implementation stacks, or
performance results from screenshots.

Original PNGs are copied byte-for-byte to `public/assets/web-development/`.
Proportional JPEG previews use a maximum width of 1600 pixels. Services contains
four real Web Development previews and a permanent collection link. Works has
four source-based Web entries, replacing the Lumen and Harbor sample entries.

The shared gallery viewer supports previous/next and original-file links. The
web page also has an optional Actual size / Fit screenshot toggle. Actual size
uses each screenshot's native dimensions with horizontal and vertical scrolling;
the full source remains reachable from its top-left corner. Closing restores
focus and resets the toggle. Without JavaScript, image links open original PNGs.

Web portfolio styles live in `public/css/web-development.css`.
User-provided live-site links are available for Brewora, CTech, and Putahe in
both their project details and Works entries. They open in new tabs with
`noopener noreferrer`; Facebook tracking parameters are omitted. ModuSole
continues to link to its supplied screenshot.

## Multimedia and service cleanup

`public/multimedia.html` presents all four supplied Stride images from
`multimedia/`: billboard, brochure, flyer, and poster. Original PNGs are copied
byte-for-byte to `public/assets/multimedia/`, with proportional JPEG previews
at a maximum of 1200 pixels on the longest side. Each is labeled as a design
concept and opens in the shared enlarged artwork viewer. Source contact details,
event dates, QR imagery, and gym statements remain artwork content; they are
not presented as verified client facts or active features.

Multimedia now has four populated service previews, a collection link, four
Works entries, and two Stride hero cards replacing the former Verde/Atlas
sample cards. The hero keeps its existing six-card animation structure.
The portfolio counts show the supplied collection totals: four branding
collections, four web studies, four multimedia formats, and nine logo concepts.

Marketing was removed from active homepage metadata, the marquee, Works filter,
project entries, contact service selector, and API service validation. Its
related sample testimonials were removed. The inquiry tests verify that a
request for the removed service is rejected before persistence.

Multimedia styles live in `public/css/multimedia.css`.
The multimedia verification preview runs on port 3001. A discovered serving
race is guarded: if a browser disconnects before an image stream opens, the
server discards that stream instead of piping to a destroyed response. The
static-file regression suite covers that cancellation sequence.
Verification: desktop and phone layouts, Services previews, the four-item Works
filter, and the artwork viewer passed. All 78 tests pass with test-file
concurrency set to one. The default parallel run intermittently fails the
existing inquiry concurrent-write test with STORE_WRITE_FAILED; that test also
passes when run alone. This storage issue remains outside the portfolio changes.
No build step is needed; the existing
local server serves the saved files.

## Portrait film strip

The homepage's Process section and all Process navigation/CTA links are removed.
The former Showreel is replaced by a full-width portrait film strip at
`#promotional-video` (carousel anchor: `#promo-carousel`). It has no visible
heading, descriptive panels, or navbar/footer entry. It uses all five original
15-second files from `Promotional Video/`: AV / Avengers, Fleura, Moko, Nexora,
and Stride. Public MP4 copies are byte-for-byte identical. Poster JPEGs are
frames extracted from the supplied films.

`public/css/promotional-video.css` creates the black backdrop, rounded 9:16
cards, enlarged center card, dimmer neighbors, and cropped outer edges. Card
height adapts to the screen. High adds animated card movement and translucent
play controls when full motion is available; Medium, Basic, and reduced motion
switch positions without animation.

`public/js/promotional-video.js` handles circular previous/next navigation,
dots, arrow/Home/End keys, swipe/drag, and play buttons. Selecting a film centers
it. Playback starts on request and enables native controls. Switching cards
pauses the previous film. Leaving the strip or hiding the page pauses playback.
All videos use `preload="none"`. Without JavaScript, native players remain in a
horizontally scrollable strip.

Verified: all five films play; switching cards pauses the previous film;
neighboring-card playback, keyboard navigation, swipe, wraparound, and the
375px phone layout pass without horizontal page overflow. The visible heading
and descriptive panels are absent. JavaScript syntax and diff checks pass.
The previous carousel iteration passed all 78 existing tests with test-file
concurrency set to one; this presentation update was checked in the browser.

## Contact email

The contact form opens a prefilled email draft addressed to the user-confirmed
studio inbox, `syphersolutions@gmail.com`. It includes the visitor's name, reply
email, service, budget, and message. The visitor completes sending in their email
app. The UI never reports the draft as delivered and preserves the original form.

`public/js/contact-email.js` validates the required fields, encodes the subject
and body, then opens the mailto link. It also exposes an explicit draft link and
a read-only copyable draft if no mail app opens. Editing the form invalidates
the previous draft. The form action provides a native mailto fallback when
JavaScript is off. The displayed contact email uses the same studio inbox.

The public form no longer calls the local inquiry-storage API. That legacy demo
route remains separately available and its privacy protections remain intact.
Seven focused tests verify routing, Unicode and special-character encoding,
validation, preserved fields, optional defaults, stale-draft removal, and failed
app handoff. An actual sent message and delivery to the inbox were not tested.
Browser validation was blocked by an unresponsive in-app browser preview.
The full sequential test run passes: 85 tests, zero failures.
