# Adaptive intelligence (Stage 3)

This document describes the scoring, classification, and High-effect lifecycle
rules introduced for findings **F4**, **F5**, and **F13**. Architecture,
branding, accessibility, and the contact API from Stages 1–2 are unchanged.

## F13 — Configurable scoring weights (0–100)

Each capability signal has a **quality** in `[0, 1]` and a configured **weight**.
Points earned are `quality × weight`. The final score is:

```
score = clamp(round(Σ quality × weight), 0, 100)
```

Missing signals contribute **0** and are **not** renormalized. That prevents a
sparse sample (for example FPS-only) from appearing as a perfect 100.

Weights are sanitized by `normalizeWeights`:

- Invalid or non-positive entries become `0`
- If every weight is invalid, defaults (`cpu 25 / memory 25 / fps 50`) apply
- Remaining positive weights are scaled so they sum to **100**

**Coverage** is separate from score: `availableWeight / 100`. A high score with
low coverage is still weak evidence.

Configuration lives in `server/config/modes.json` and the bundled
`public/js/config.js` (`configVersion: 2026-10-18.4`). Client and server share
`public/js/score.js`. Default weights favor frame observation (`fps: 50`) while
keeping CPU (`30`) slightly above memory (`20`) so browsers that omit
`deviceMemory` (common on Safari/Firefox) can still reach High with strong
threads + FPS.

## F4 — Classification accuracy and confidence

Classification uses score **and** independent evidence gates:

| Target | Requirements |
|--------|----------------|
| **HIGH** | Score ≥ high threshold (75), coverage ≥ `minCoverageHigh` (0.6), at least one hardware hint (CPU threads or device memory), completed FPS observation, plus existing touch/resource caps |
| **MEDIUM** | Score ≥ medium threshold (40) and coverage ≥ `minCoverageMedium` (0.35), after High gates and constraint demotions |
| **BASIC** | Everything else, including **no usable signals** (fallback is Basic, never Medium) |

CPU threads and device memory are **approximate hints**, not power meters. Either hint
satisfies `hasHardwareHint`; missing only one API does not block High when the remaining
signals still clear the score and coverage gates.

Screen size and touch input are **not** treated as weak-hardware judgments on their own.
The optional `touchCap` only demotes High→Medium on a small coarse-pointer viewport when
frame evidence is weak; strong FPS + WebGL2 can exempt.

**Confidence** is a heuristic evidence-quality label (coverage + FPS completeness), not a
calibrated statistical probability:

- `high` — coverage ≥ 0.6 and FPS present
- `medium` — coverage ≥ 0.35
- `low` — some coverage below the medium floor
- `none` — no scored signals

Dashboard copy surfaces score, coverage, confidence, and recommended class.
Manual override remains authoritative for the rendered mode.

### FPS / frame-observation fallback

With default weights (`fps: 50`), a completed frame observation is required to reach the
High score band: without FPS, maximum earned points from CPU+memory are ~50 and coverage
is 0.5, so classification lands at **Medium** (estimated) rather than inventing High.

When the benchmark is skipped, hidden, timed out, or otherwise unavailable:

1. `fps` is stored as `null` and the profile is marked estimated
2. `estimatedHighGuard` applies if a High score would otherwise be claimed without FPS
3. Remaining hardware hints still drive Medium/Basic honestly (no renormalization to 100)
4. Visitors can still choose High manually via the override (with the BASIC→High warning)

Browsers that omit `deviceMemory` or `hardwareConcurrency` are not excluded solely for that
gap: the other present weighted signals still score, and High remains reachable when FPS and
at least one hardware hint clear the gates.

## F5 — High-effect loading races and cleanup

High-only assets (GSAP, ScrollTrigger, `high-effects.js`) load asynchronously.
The mode controller keeps an `effectsEpoch` generation counter:

1. Every `applyAssets()` call increments the epoch
2. When the deferred load resolves, start only if `epoch === effectsEpoch`
3. Re-check `wantsHighEffects()` (mode is `high` and motion is `full`) before start
4. Pass `{ epoch, getEpoch }` into `highEffects.start()` so a stale generation refuses to activate

`highEffects.stop()` tears down WebGL, pointer magnets/tilts, GSAP context
(`ctx.revert()`), and remaining ScrollTriggers (`ScrollTrigger.getAll().kill()`).

Live downgrade offers run only in **Auto** source and honor
`liveDowngradeCooldownMs` so repeated offers do not thrash mode changes.

## Regression tests

- `server/tests/scoring-classification.test.js` — F4 / F13 table cases, weight sanitization, API parity
- `server/tests/effects-lifecycle.test.js` — F5 epoch harness and source contracts

Run: `npm test`.
