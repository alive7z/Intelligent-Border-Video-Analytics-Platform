/**
 * Display-only camera orientation.
 *
 * The AI pipeline applies the NET clockwise rotation
 * (pipeline `rotationDegrees` + stored `displayRotationDegrees`) to source
 * frames BEFORE inference, so the finished preview frame is already canonical
 * for every camera. The browser must NOT add any further rotation, otherwise
 * the baked-in zone/fence text is flipped upside down. These helpers only
 * report/normalize the stored display value for informational display.
 *
 * Semantics: stored display rotation is in CSS degrees, positive = clockwise.
 * `-90` renders a portrait feed rotated to landscape-left. Combined with the
 * AI pipeline rotation it yields the NET rendered orientation
 * AI_rotation + display_rotation; that net is now applied by the AI itself.
 */

const FULL_TURN = 360;

export function getDisplayRotationDegrees(camera) {
  const value = Number(camera?.displayRotationDegrees ?? 0);
  return Number.isFinite(value) ? value : 0;
}

/**
 * Normalize to [0, 360) clockwise degrees so transforms compare cleanly.
 * Non-finite input degrades to 0 (never spins a live feed by accident).
 */
export function normalizeDisplayRotation(degrees) {
  const value = Number(degrees);
  if (!Number.isFinite(value)) return 0;
  return ((Math.round(value) % FULL_TURN) + FULL_TURN) % FULL_TURN;
}

/**
 * Style for the media layer. The AI pipeline now applies the NET rotation
 * (AI rotationDegrees + displayRotationDegrees) to the source frame BEFORE it
 * draws zones/fences and text, so the finished preview is already canonical.
 * Rotating it again here would flip the baked-in annotation labels. Always
 * return null — no extra browser-side rotation is applied.
 */
export function getDisplayRotationMediaStyle() {
  return null;
}