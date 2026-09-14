import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

let server, Gallery;
before(async () => {
  server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", logLevel: "silent" });
  Gallery = (await server.ssrLoadModule("/src/components/common/EvidenceGallery.jsx")).default;
});
after(async () => server?.close());

test("empty evidence renders no invented id, box, zone or clip duration", () => {
  const html = renderToStaticMarkup(React.createElement(Gallery, { items: [] }));
  assert.match(html, /No snapshot available/);
  for (const fake of ["EVD-00000", "Restricted Zone Boundary", "00:12"]) assert.equal(html.includes(fake), false);
});
test("stored detection-only face evidence exposes its real id and no identity claim", () => {
  const html = renderToStaticMarkup(React.createElement(Gallery, { items: [{ id: "test-face-evidence", type: "FACE", cameraCode: "TEST-CAMERA", capturedAt: "2026-09-11T00:00:00Z" }] }));
  assert.match(html, /test-face-evidence/);
  assert.match(html, /identity unknown/);
  assert.match(html, /Loading evidence/);
});
