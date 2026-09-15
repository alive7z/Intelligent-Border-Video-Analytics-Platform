"use strict";

const crypto = require("crypto");

// Deterministic binary SHA-256 Merkle tree (RFC 6962-style balanced binary
// tree). Used for batching evidence hashes and audit-log hashes before a
// single ledger anchor. Leaves may be provided as Buffers or hex strings.

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest();

const asBuffer = (leaf) => (Buffer.isBuffer(leaf) ? leaf : Buffer.from(String(leaf), "hex"));

function buildTree(leaves) {
  if (!Array.isArray(leaves) || leaves.length === 0) {
    throw new Error("merkle: at least one leaf is required");
  }
  const normalized = leaves.map(asBuffer).map((buf) => (buf.length === 32 ? buf : sha256(buf)));

  const levels = [normalized];
  let current = normalized;
  while (current.length > 1) {
    const next = [];
    for (let i = 0; i < current.length; i += 2) {
      const left = current[i];
      const right = current[i + 1] || left; // odd leaf duplicated
      next.push(sha256(Buffer.concat([left, right])));
    }
    levels.push(next);
    current = next;
  }
  return levels;
}

const rootFromLevels = (levels) => levels[levels.length - 1][0];

function merkleRoot(leaves) {
  return rootFromLevels(buildTree(leaves)).toString("hex");
}

// Returns { leafHash, proof: [siblingHex, isLeftNode]... , root } walking from
// the leaf to the root. Proof verification replays the same balanced doubling.
function merkleProof(leaves, leafIndex) {
  if (!Array.isArray(leaves) || leafIndex < 0 || leafIndex >= leaves.length) {
    throw new Error("merkle: leafIndex out of range");
  }
  const levels = buildTree(leaves);
  const proof = [];
  let idx = leafIndex;
  for (const level of levels) {
    if (level.length === 1) break;
    const isOddTail = idx === level.length - 1 && idx % 2 === 0;
    if (isOddTail) {
      // Odd final leaf: buildTree duplicated it (hash(H||H)) so the proof
      // carries the self-duplicate step to stay fully replayable.
      proof.push({ sibling: level[idx].toString("hex"), index: "right" });
      idx = Math.floor(idx / 2);
      continue;
    }
    const sibling = idx % 2 === 0 ? level[idx + 1] : level[idx - 1];
    proof.push({ sibling: sibling.toString("hex"), index: idx % 2 === 0 ? "right" : "left" });
    idx = Math.floor(idx / 2);
  }
  return {
    leafHash: merkleRoot([asBuffer(leaves[leafIndex])]),
    proof,
    root: rootFromLevels(levels).toString("hex"),
  };
}

function verifyProof({ leaf, proof, root }) {
  let hash = asBuffer(leaf);
  hash = hash.length === 32 ? hash : sha256(hash);
  for (const step of proof) {
    const sibling = Buffer.from(step.sibling, "hex");
    hash = step.index === "right" ? sha256(Buffer.concat([hash, sibling])) : sha256(Buffer.concat([sibling, hash]));
  }
  return hash.toString("hex") === root;
}

module.exports = { merkleRoot, merkleProof, verifyProof, buildTree, sha256, asBuffer };