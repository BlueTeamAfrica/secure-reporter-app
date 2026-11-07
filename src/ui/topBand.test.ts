import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { TABLES } from "../i18n/strings.ts";
import {
  BUTTON_ZONE_GAP,
  bandLayout,
  MAX_ZONE_WIDTH,
  MIN_BAND_HEIGHT,
  NOTES_LABEL_WIDTH,
} from "./topBand.ts";

// Narrowest Android phones in use are 320dp; 280 covers display-zoom extremes.
const WIDTHS = [280, 320, 340, 360, 393, 412, 480, 600];
const INSETS = [0, 24, 32, 48];

describe("top band: Notes button vs panic zone", () => {
  for (const w of WIDTHS) {
    it(`${w}dp: button clears the zone in LTR and RTL`, () => {
      for (const inset of INSETS) {
        const { button, zone } = bandLayout(w, inset);
        const ltr = { from: button.start, to: button.start + button.width };
        const rtl = { from: w - button.start - button.width, to: w - button.start };
        const z = { from: zone.left, to: zone.left + zone.width };
        assert.ok(ltr.to + BUTTON_ZONE_GAP <= z.from, `LTR overlap at ${w}`);
        assert.ok(z.to + BUTTON_ZONE_GAP <= rtl.from, `RTL overlap at ${w}`);
        assert.ok(rtl.to <= w && ltr.from >= 0, "button on screen");
      }
    });
  }

  it("zone stays centred, never wider than before, and usable on narrow phones", () => {
    for (const w of WIDTHS) {
      const { zone } = bandLayout(w, 24);
      assert.equal(zone.left * 2 + zone.width, w, "centred");
      assert.ok(zone.width <= MAX_ZONE_WIDTH);
      assert.ok(zone.width >= 96, `zone too small at ${w}: ${zone.width}`);
    }
    assert.equal(bandLayout(360, 24).zone.width, 184);
    assert.equal(bandLayout(320, 24).zone.width, 144);
  });

  it("zone is never shorter than the Phase 2a zone (72), and covers the whole band", () => {
    for (const inset of INSETS) {
      const b = bandLayout(360, inset);
      assert.ok(b.height >= MIN_BAND_HEIGHT);
      assert.equal(b.zone.height, b.height);
      assert.ok(b.button.top + b.button.height <= b.height, "button inside the band");
    }
  });

  // Measured from the bundled font files (advance widths of the isolated glyphs, an upper
  // bound: joined Arabic forms are narrower), at 12sp: ملاحظات in Cairo 600 = 48.5dp,
  // Notes in Poppins 600 = 35.1dp. The button allows font scaling up to 1.3.
  it("the measured Arabic and English labels fit the button at font scale 1.3", () => {
    const measured12sp: Record<string, number> = {
      [TABLES.ar.common.notesButton]: 48.5,
      [TABLES.en.common.notesButton]: 35.1,
    };
    assert.deepEqual(Object.keys(measured12sp).sort(), ["Notes", "ملاحظات"].sort(), "labels changed: re-measure");
    for (const [label, width] of Object.entries(measured12sp)) {
      assert.ok(width * 1.3 <= NOTES_LABEL_WIDTH, `${label}: ${width * 1.3} > ${NOTES_LABEL_WIDTH}`);
    }
  });
});
