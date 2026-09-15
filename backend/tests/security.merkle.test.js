"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { merkleRoot, merkleProof, verifyProof, buildTree, sha256 } = require("../src/security/merkle");

const L = ["aa", "bb", "cc", "dd", "ee", "ff", "gg"];

test("merkle root is deterministic for identical leaf sets", () => {
  assert.equal(merkleRoot(L), merkleRoot(L));
  assert.ok(/^[0-9a-f]{64}$/.test(merkleRoot(L)));
});

test("merkle root changes when any leaf changes", () => {
  const changed = [...L.slice(0, 4), "xx", ...L.slice(5)];
  assert.notEqual(merkleRoot(L), merkleRoot(changed));
});

test("single leaf root equals the leaf hash", () => {
  const leaf = sha256(Buffer.from("only", "utf8")).toString("hex");
  assert.equal(merkleRoot([leaf]), leaf);
});

test("merkle proofs verify for every leaf, including odd-leaf duplication", () => {
  for (let i = 0; i < L.length; i += 1) {
    const p = merkleProof(L, i);
    assert.equal(p.root, merkleRoot(L));
    assert.ok(verifyProof({ leaf: p.leafHash, proof: p.proof, root: p.root }), `leaf ${i}`);
  }
});

test("a proof from a different tree does not verify", () => {
  const p = merkleProof(L, 0);
  const otherRoot = merkleRoot(["zz", "yy", "xx", "ww", "vv", "uu", "tt"]);
  assert.ok(!verifyProof({ leaf: p.leafHash, proof: p.proof, root: otherRoot }));
});

test("tree structure: each level halves the node count (balanced binary)", () => {
  const levels = buildTree(L);
  assert.equal(levels[0].length, 7);
  assert.equal(levels[levels.length - 1].length, 1);
});

test("hex leaves and buffer leaves produce identical roots", () => {
  const hex = merkleRoot(L);
  const buf = merkleRoot(L.map((x) => Buffer.from(x, "hex")));
  assert.equal(hex, buf);
});