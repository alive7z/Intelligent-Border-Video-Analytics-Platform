/**
 * Shared layout configuration for the Dashboard "Live Surveillance" section.
 *
 * The grid is CSS auto-fit — the browser computes how many landscape camera
 * cards fit from the ONLINE camera count + available container width. No column
 * counts are hardcoded for specific camera numbers; the only inputs are the
 * minimum useful card width and the container width.
 */

// Minimum useful card width. Staying below this would make previews unreadable,
// so overflow is resolved with internal scrolling instead.
export function getMinCardWidth(isDesktopUp) {
  return isDesktopUp ? 340 : 280;
}

// auto-fit picks how many tracks fit: minmax(MIN, 1fr) keeps cards ≥ MIN wide
// and lets each track grow to fill the container (no giant horizontal gaps).
export function getLiveGridTemplate(isDesktopUp) {
  return `repeat(auto-fit, minmax(${getMinCardWidth(isDesktopUp)}px, 1fr))`;
}

// Single online camera: keep one large landscape preview, but cap its width so
// it is not stretched edge-to-edge and centered in the section.
export function getSingleCameraMaxWidth() {
  return 740;
}

export function shouldCenterSingleCamera(onlineCount) {
  return onlineCount === 1;
}