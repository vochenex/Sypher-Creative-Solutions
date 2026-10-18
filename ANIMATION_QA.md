# Animation and display-mode verification

The homepage follows the selected display mode. The slow project ribbon is the
intentional exception: it starts automatically in every mode, including reduced
motion, as requested. The Pause motion control pauses the hero effects together.

| Mode | Homepage | Rest of the page |
| --- | --- | --- |
| High | Word entrance, WebGL lighting, animated ripple field, cursor halo and card tilt on a fine pointer | Scroll scenes, parallax, counters, magnetic buttons, spotlight borders, automatic testimonials and muted video preview |
| Medium | Headline fade, CSS color drift, hover lift, native cursor | Lighter reveals and transitions, manual testimonial slider and click-to-play video |
| Basic | Static warm background, system font, native cursor, slow project ribbon | No High scenes or libraries; static testimonials, immediate accordion changes and click-to-play video |

Reduced motion disables the richer effects and WebGL, while keeping the requested
slow ribbon. Returning to full motion restores the selected mode's effects.

## Checks performed

- Automated suite: **60 passing tests**, including four mode-transition regression tests.
- Chrome desktop: 1440 x 950.
- Chrome mobile emulation: 390 x 844, with touch input.
- Mode selection through the actual performance panel: High → Medium → Basic → High → Basic.
- Measured card movement in every mode, with no horizontal page overflow.
- Rapid mode changes, saved selections after reload, and reduced-motion recovery.
- Counter completion, service accordion, portfolio filtering, and muted High video behavior.
- High scenes and effects stop when switching to Basic or Medium.
- No JavaScript browser errors in the desktop/mobile mode matrix.
- Fresh starts at 320px for all three modes, with no horizontal overflow.
- Basic and Medium do not fetch High's GSAP libraries on a fresh start.
- With API and GSAP requests unavailable, High retains its CSS/2D background and moving ribbon.
- Pause/resume stops and restores the ribbon, 2D field, and measured WebGL draw calls.

Mobile verification uses browser emulation, rather than a physical phone.

## Regression fixes

- Publish mode changes after the view-transition DOM commit, and reject stale commits.
- Handle skipped transition promises without unhandled browser errors.
- Connect the new hero to mode and motion events.
- Restore headline entrance and WebGL lighting for the new hero markup.
- Use the WebGL context compatible with the GLSL ES 1.00 shaders.
- Cancel active magnetic/tilt tweens during teardown.
- Avoid perspective widening the services panel on narrow screens.

Browser evidence from this run is in `.screens/mode-matrix-results.json` and the
desktop/mobile screenshots in `.screens/`. This directory is ignored by Git.

## High cursor and continuous hover follow-up

The High cursor now lives at body level with fixed viewport coordinates and its
own frame loop. It continues through Services, Work, Showreel, Process, Clients,
Contact, and the performance panel even when the hero is offscreen. Neutral
areas show a dot, ring, and soft gradient. Interactive targets use action labels
such as Explore, Expand/Close, Discover, Let's Talk, Play, and Filter. Editable
fields, native selects, and native video controls keep their native cursor.

Card tilt and magnetic reset use their existing GSAP quickTo setters, avoiding
the overwriting reset tween that killed later hover responses. Hero cards also
recalculate tilt as the ribbon moves under a stationary mouse, using their
wrapper bounds to avoid feedback from their own tilt.

Verified in the local in-app Chromium browser at a 1440 x 950 viewport:

- Card tilt changes direction during pointer movement and after leaving/re-entering.
- Cursor stays visible with the hero offscreen.
- Accordion labels update to match expanded/collapsed state.
- Service card shows Let's Talk; neutral space restores dot, ring, and gradient.
- Native text cursor works in the contact form.
- High -> Medium -> Basic -> High hides/restores the cursor correctly.
- Hero card hover shows Explore and continues updating tilt as the ribbon moves.
- No horizontal overflow or application console errors observed.

Automated suite: **63 passing tests**, including three new tests using the shipped
GSAP engine for repeated tilt, magnetic reset during animation, and stop/restart
cleanup. One initial full-suite run had an inquiry-store write failure; the
isolated inquiry tests and the subsequent complete 63-test run passed.

Pointer screenshots: `.screens/pointer-neutral.png`,
`.screens/pointer-services-label.png`, and `.screens/pointer-card-label.png`.
This follow-up did not perform physical-device testing.

## Centered first-scan setup

The first scan now shows a centered panel with a loading ring, a brief ready
confirmation, and a fade out. The normal sequence takes about two seconds:
the benchmark runs for up to 1.2 seconds, device signals have a 250 ms battery
timeout, and completion uses a 320 ms confirmation plus a 220 ms fade. The
analysis hard limit is 1.8 seconds. Fast failures still show the panel for at
least 900 ms before completing. Reduced motion uses the existing motion guard.

The validated profile stays in localStorage without the previous 24-hour
expiry. New browser sessions restore it before paint and skip both the benchmark
and the loading panel. Initialization is idempotent and overlapping scans are
ignored. Re-run detection explicitly replaces the saved profile. Invalid or
incompatible profiles still fall back to a fresh scan; blocked/cleared browser
storage cannot preserve the result.

Automated suite: **71 passing tests**, including persistent cache reuse, repeated
initialization, overlapping scan requests, explicit re-scan, hard-limit fallback,
loader timing, and fail-safe callback delivery. In-app browser verification
confirmed cached startup without the loader and captured the centered animated
panel in `.screens/performance-scan-centered.png`. Physical devices were not
tested in this follow-up.

## Updated performance score bands

Browser and server now use High 80–100, Medium 60–79, and Basic 0–59 as their
score bands. Existing capability constraints and manual preferences still apply.
Saved measurements are reclassified once when the band signature changes,
without running another benchmark. All **76 tests pass**, including every integer
score from 0 through 100, estimated-score boundaries, API classification, and
saved-result migration at 59, 60, 79, and 80.
