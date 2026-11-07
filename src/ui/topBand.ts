/**
 * Geometry of the top band on real screens (Phase 2b items 3 and 4). Pure, so it is tested.
 *
 * The band holds only two things: the visible Notes button at the logical start edge, and the
 * invisible panic-gesture zone, centred. Screen content starts below the band, so no screen
 * control can ever sit under the zone, in either direction and at any scroll position.
 */
export const BAND_BAR_HEIGHT = 56;
/** The zone was 72 high in Phase 2a; never smaller. */
export const MIN_BAND_HEIGHT = 72;
export const MAX_ZONE_WIDTH = 220;

export const NOTES_BUTTON_WIDTH = 72;
export const NOTES_BUTTON_HEIGHT = 48;
/** Inner text width of the button (horizontal padding 4 each side). */
export const NOTES_LABEL_WIDTH = NOTES_BUTTON_WIDTH - 8;
export const EDGE_MARGIN = 8;
/** Minimum empty space between the button and the zone. */
export const BUTTON_ZONE_GAP = 8;

export type BandLayout = {
  height: number;
  button: { start: number; top: number; width: number; height: number };
  zone: { left: number; width: number; height: number };
};

export function bandLayout(screenWidth: number, insetTop: number): BandLayout {
  const height = Math.max(MIN_BAND_HEIGHT, Math.round(insetTop) + BAND_BAR_HEIGHT);
  const reserved = EDGE_MARGIN + NOTES_BUTTON_WIDTH + BUTTON_ZONE_GAP;
  // Symmetric reserve on both sides keeps the zone centred and clear of the button in LTR
  // (button on the left) and in RTL (button on the right).
  const width = Math.max(0, Math.min(MAX_ZONE_WIDTH, screenWidth - 2 * reserved));
  return {
    height,
    button: {
      start: EDGE_MARGIN,
      top: height - BAND_BAR_HEIGHT + (BAND_BAR_HEIGHT - NOTES_BUTTON_HEIGHT) / 2,
      width: NOTES_BUTTON_WIDTH,
      height: NOTES_BUTTON_HEIGHT,
    },
    zone: { left: (screenWidth - width) / 2, width, height },
  };
}
