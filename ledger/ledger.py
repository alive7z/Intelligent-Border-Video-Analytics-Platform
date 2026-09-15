#!/usr/bin/env python3
"""
IBVAP permissioned Proof-of-Authority (MAC) ledger node.

A tiny, dependency-free, honest integrity-anchoring layer. It is NOT a public
cryptocurrency chain: no mining, no tokens, no economic incentives. Block
"authorship" is authorized by an HMAC-SHA256 signature over the block header
using the shared node token, and every ledger write is validated against the
local append-only chain (prevHash continuity, index +1, Merkle root integrity,
duplicate evidenceId rejection). This is a MAC-based PoA ledger; digital
signatures are out of scope by design and are used separately for evidence.

Operations
----------
  REGISTER_EVIDENCE     anchors evidenceId + sha256 + metadata
  REGISTER_AUDIT_BATCH  anchors a Merkle root over audit records (batchKey)

HTTP endpoints (JSON POST)
--------------------------
  /status /health /tx /ledger /blocks /evidence/{id} /batch/{id} /replicate

Start a node:
  python3 ledger.py --node-id BOP --port 8541 --chain-id 51201 \
      --token changeme --peers localhost:8542
"""
import argparse
import hashlib
import hmac
import json
import os
import secrets
import sys
import threading
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from datetime import datetime, timezone

CHAIN_ID = "51201"
NETWORK = "ibvap-permissioned-poa"
VERSION = "1.0.0"
MAX_TXS_PER_BLOCK = 1
MAX_BODY = 1024 * 1024


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


def sha256_hex(data: str) -> str:
    return hashlib.sha256(data.encode("utf-8")).hexdigest()


# Fields that make up the signed block header (everything except the tx list,
# the blockHash itself and the signature).
HEADER_KEYS = ("index", "prevHash", "timestamp", "merkleRoot", "signer", "txCount", "chainId")


def block_header(block) -> dict:
    return {k: block[k] for k in HEADER_KEYS if k in block}


def canonical(obj) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def tx_hash(payload, nonce: str) -> str:
    return sha256_hex(canonical({"payload": payload, "nonce": nonce}))


def merkle_root(leaves):
    if not leaves:
        return sha256_hex("")
    nodes = list(leaves)
    while len(nodes) > 1:
        nxt = []
        for i in range(0, len(nodes), 2):
            left = nodes[i]
            right = nodes[i + 1] if i + 1 < len(nodes) else left
            nxt.append(sha256_hex(left + right))
        nodes = nxt
    return nodes[0]


def node_signature(header: dict, token: str) -> str:
    # MAC-based authorization: this is the "authority" for this PoA ledger.
    return hmac.new(token.encode("utf-8"), canonical(header).encode("utf-8"), hashlib.sha256).hexdigest()


def verify_signature(header: dict, token: str, sig: str) -> bool:
    return hmac.compare_digest(sig, node_signature(header, token))


class LedgerStore:
    """Append-only block chain persisted as newline-delimited JSON."""

    def __init__(self, data_dir: str, node_id: str, token: str, chain_id: str = CHAIN_ID):
        self.data_dir = data_dir
        self.node_id = node_id
        self.token = token
        self.chain_id = chain_id
        os.makedirs(data_dir, exist_ok=True)
        self.blocks_file = os.path.join(data_dir, "blocks.jsonl")
        self.chain = []          # list of block dicts (oldest first)
        self.tx_index = {}       # txHash -> tx
        self.evidence_index = {} # evidenceId -> tx
        self.batch_index = {}    # batchKey -> tx
        self._lock = threading.RLock()
        self._load()

    def _load(self):
        if os.path.exists(self.blocks_file):
            with open(self.blocks_file, "r", encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if not line:
                        continue
                    block = json.loads(line)
                    self.chain.append(block)
                    for tx in block["txs"]:
                        self._index_tx(block, tx)

    def _append_block_line(self, block):
        with open(self.blocks_file, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(block, sort_keys=True, separators=(",", ":")) + "\n")
            fh.flush()
            os.fsync(fh.fileno())

    def _index_tx(self, block, tx):
        tx = dict(tx)
        tx["blockNumber"] = block["index"]
        tx["blockHash"] = block["blockHash"]
        tx["timestamp"] = block["timestamp"]
        self.tx_index[tx["txHash"]] = tx
        op = tx.get("op")
        p = tx.get("payload", {})
        if op == "REGISTER_EVIDENCE":
            self.evidence_index[p.get("evidenceId")] = tx
        elif op == "REGISTER_AUDIT_BATCH":
            self.batch_index[p.get("batchKey")] = tx

    def height(self) -> int:
        return len(self.chain)

    def head(self):
        return self.chain[-1] if self.chain else None

    def validate_chain(self) -> list:
        errors = []
        for i, block in enumerate(self.chain):
            if i != block["index"]:
                errors.append(f"block {i}: index mismatch")
                continue
            header = block_header(block)
            if block["blockHash"] != sha256_hex(canonical(header)):
                errors.append(f"block {i}: blockHash mismatch")
            if block["merkleRoot"] != merkle_root([t["txHash"] for t in block["txs"]]):
                errors.append(f"block {i}: merkleRoot mismatch")
            if i > 0 and block["prevHash"] != self.chain[i - 1]["blockHash"]:
                errors.append(f"block {i}: prevHash link broken")
            if not verify_signature(header, self.token, block["signature"]):
                errors.append(f"block {i}: signature invalid")
            if block["chainId"] != self.chain_id and self.node_id != "IMPORTER":
                errors.append(f"block {i}: chainId mismatch")
        return errors

    def make_block(self, payloads):
        prev = self.head()
        prev_hash = prev["blockHash"] if prev else sha256_hex("")
        index = self.height()
        nonces = [secrets.token_hex(8) for _ in payloads]
        txs = [
            {"txHash": tx_hash(p, n), "op": p["op"], "payload": p, "signer": self.node_id, "nonce": n}
            for p, n in zip(payloads, nonces)
        ]
        header = {
            "index": index,
            "prevHash": prev_hash,
            "timestamp": now_iso(),
            "merkleRoot": merkle_root([t["txHash"] for t in txs]),
            "signer": self.node_id,
            "txCount": len(txs),
            "chainId": self.chain_id,
        }
        block = {**header, "txs": txs, "signature": node_signature(header, self.token), "blockHash": sha256_hex(canonical(header))}
        return block

    def commit_block(self, block) -> tuple:
        """Validate a block from any source and append it. Returns (ok, error)."""
        with self._lock:
            if self.height() != block["index"]:
                return False, f"height {self.height()} != block.index {block['index']}"
            prev = self.head()
            if prev is None and block["index"] != 0:
                return False, "first block must have index 0"
            if prev is not None and prev["blockHash"] != block["prevHash"]:
                return False, "prevHash mismatch"
            header = block_header(block)
            if block["blockHash"] != sha256_hex(canonical(header)):
                return False, "blockHash mismatch"
            if block["merkleRoot"] != merkle_root([t["txHash"] for t in block["txs"]]):
                return False, "merkleRoot mismatch"
            if block["chainId"] != self.chain_id:
                return False, "chainId mismatch"
            if not verify_signature(header, self.token, block["signature"]):
                return False, "block signature invalid"
            for tx in block["txs"]:
                dup = self.find_duplicate(tx)
                if dup:
                    return False, f"duplicate {tx.get('op')} ({dup})"
            self._append_block_line(block)
            self.chain.append(block)
            for tx in block["txs"]:
                self._index_tx(block, tx)
            return True, None

    def find_duplicate(self, tx) -> str:
        op = tx.get("op")
        p = tx.get("payload", {})
        if op == "REGISTER_EVIDENCE" and p.get("evidenceId") in self.evidence_index:
            return f"evidenceId {p.get('evidenceId')} already anchored"
        if op == "REGISTER_AUDIT_BATCH" and p.get("batchKey") in self.batch_index:
            return f"batchKey {p.get('batchKey')} already anchored"
        if tx.get("txHash") in self.tx_index:
            return f"txHash {tx.get('txHash')}"
        return ""

    def clear(self):
        with self._lock:
            self.chain.clear()
            self.tx_index.clear()
            self.evidence_index.clear()
            self.batch_index.clear()
            if os.path.exists(self.blocks_file):
                os.remove(self.blocks_file)


class Node:
    def __init__(self, node_id: str, port: int, token: str, peers, chain_id: str = CHAIN_ID, enable_clear=False):
        self.node_id = node_id
        self.port = port
        self.token = token
        self.chain_id = chain_id
        self.peers = peers if isinstance(peers, list) else []
        self.enable_clear = enable_clear
        self.store = LedgerStore(os.path.join("data", node_id), node_id, token, chain_id)
        self._lock = threading.RLock()

    # ── helpers ────────────────────────────────────────────────────────────

    def json_response(self, handler, code, data):
        handler.send_response(code)
        handler.send_header("Content-Type", "application/json")
        handler.end_headers()
        handler.wfile.write(json.dumps(data).encode("utf-8"))

    def read_body(self, handler) -> dict:
        length = int(handler.headers.get("Content-Length", 0) or 0)
        if length <= 0 or length > MAX_BODY:
            return {}
        raw = handler.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except Exception:
            return {}

    def auth_ok(self, body) -> bool:
        provided = body.get("nodeToken", "")
        ok = hmac.compare_digest(str(provided), self.token)
        if not ok:
            print(f"[{self.node_id}] AUTH FAIL body={body!r}", file=sys.stderr, flush=True)
        return ok

    def relay_to_peers(self, block, tried=None):
        tried = set(tried or [])
        for peer in self.peers:
            if peer in tried:
                continue
            tried.add(peer)
            try:
                url = f"http://{peer}/replicate"
                req = urllib.request.Request(url, data=json.dumps(block).encode("utf-8"), headers={"Content-Type": "application/json"})
                with urllib.request.urlopen(req, timeout=5) as resp:
                    resp.read()
            except Exception:
                continue

    # ── tx submission ──────────────────────────────────────────────────────

    def handle_tx(self, body):
        if not self.auth_ok(body):
            return 401, {"success": False, "error": "unauthorized"}
        op = body.get("op")
        payload = body.get("payload")
        if not isinstance(payload, dict):
            return 400, {"success": False, "error": "payload object required"}

        if op == "REGISTER_EVIDENCE":
            evidence_id = payload.get("evidenceId")
            if not evidence_id or not str(evidence_id).strip():
                return 400, {"success": False, "error": "evidenceId required"}
            if "sha256" not in payload:
                return 400, {"success": False, "error": "sha256 required"}
            if payload.get("chainId") and str(payload["chainId"]) != self.chain_id:
                return 400, {"success": False, "error": "chainId mismatch"}
        elif op == "REGISTER_AUDIT_BATCH":
            if not payload.get("batchKey") or "merkleRoot" not in payload:
                return 400, {"success": False, "error": "batchKey and merkleRoot required"}
        else:
            return 400, {"success": False, "error": f"unknown op: {op}"}

        payload["op"] = op
        payload["network"] = payload.get("network", NETWORK)

        with self._lock:
            block = self.store.make_block([payload])
            ok, err = self.store.commit_block(block)
            if not ok:
                return 409, {"success": False, "error": err}
        self.relay_to_peers(block)
        tx = block["txs"][0]
        return 200, {"success": True, "op": op, "txHash": tx["txHash"], "blockNumber": block["index"],
                     "blockHash": block["blockHash"], "node": self.node_id, "timestamp": block["timestamp"]}

    # ── replication ────────────────────────────────────────────────────────

    def handle_replicate(self, block):
        if not isinstance(block, dict) or "blockHash" not in block:
            return 400, {"success": False, "error": "invalid block"}
        with self._lock:
            ok, err = self.store.commit_block(block)
            if ok:
                return 200, {"success": True}
            # Already known / duplicate is fine during sync.
            if err and "duplicate" in err:
                return 200, {"success": True}
            return 409, {"success": False, "error": err}

    # ── queries ────────────────────────────────────────────────────────────

    def handle_status(self):
        errors = self.store.validate_chain()
        head = self.store.head()
        return 200, {"status": "ok", "node": self.node_id, "chainId": self.chain_id, "network": NETWORK,
                     "height": self.store.height(), "lastBlockHash": head["blockHash"] if head else None,
                     "peers": self.peers, "chainValid": len(errors) == 0, "chainErrors": errors, "version": VERSION}

    def handle_health(self):
        return 200, {"status": "ok", "node": self.node_id, "height": self.store.height()}

    def handle_ledger(self):
        return 200, {"chainId": self.chain_id, "network": NETWORK, "height": self.store.height(),
                     "txCount": len(self.store.tx_index), "nodes": [self.node_id] + self.peers,
                     "node": self.node_id}

    def handle_blocks(self, query):
        try:
            after = int(query.get("after", "-1")[0] if isinstance(query.get("after"), list) else query.get("after", "-1") or -1)
        except Exception:
            after = -1
        blocks = [b for b in self.store.chain if b["index"] > after]
        return 200, {"blocks": blocks}

    def handle_evidence(self, evidence_id):
        tx = self.store.evidence_index.get(evidence_id)
        if not tx:
            return 404, {"success": False, "error": "not anchored"}
        return 200, {"evidenceId": evidence_id, "txHash": tx["txHash"], "blockNumber": tx["blockNumber"],
                     "blockHash": tx["blockHash"], "sha256": tx["payload"].get("sha256"),
                     "metadataHash": tx["payload"].get("metadataHash"), "keyId": tx["payload"].get("keyId"),
                     "op": tx["op"], "node": tx["signer"], "timestamp": tx["timestamp"]}

    def handle_batch(self, batch_key):
        tx = self.store.batch_index.get(batch_key)
        if not tx:
            return 404, {"success": False, "error": "not anchored"}
        return 200, {"batchKey": batch_key, "txHash": tx["txHash"], "blockNumber": tx["blockNumber"],
                     "merkleRoot": tx["payload"].get("merkleRoot"), "recordCount": tx["payload"].get("recordCount"),
                     "node": tx["signer"], "timestamp": tx["timestamp"]}

    def dispatch(self, handler):
        body = self.read_body(handler)
        path = handler.path.split("?")[0]

        if path == "/status":
            code, data = self.handle_status()
        elif path == "/health":
            code, data = self.handle_health()
        elif path == "/ledger":
            code, data = self.handle_ledger()
        elif path == "/blocks":
            code, data = self.handle_blocks(handler.path)
        elif path == "/tx":
            code, data = self.handle_tx(body)
        elif path == "/replicate":
            code, data = self.handle_replicate(body)
        elif path.startswith("/evidence/"):
            code, data = self.handle_evidence(urllib.request.unquote(path[len("/evidence/"):]))
        elif path.startswith("/batch/"):
            code, data = self.handle_batch(urllib.request.unquote(path[len("/batch/"):]))
        else:
            code, data = 404, {"success": False, "error": "not found"}
        self.json_response(handler, code, data)


def make_handler(node: Node):
    class LedgerHandler(BaseHTTPRequestHandler):
        def log_message(self, fmt, *args):
            sys.stderr.write("[%s] %s\n" % (node.node_id, fmt % args))

        def do_POST(self):
            node.dispatch(self)

        def do_GET(self):
            self.send_response(405)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": "GET not supported, use POST"}).encode("utf-8"))

    return LedgerHandler


def main():
    parser = argparse.ArgumentParser(description="IBVAP permissioned PoA ledger node")
    parser.add_argument("--node-id", default="BOP")
    parser.add_argument("--port", type=int, default=8541)
    parser.add_argument("--token", default=os.environ.get("LEDGER_NODE_TOKEN", "ibvap-ledger-changeme"))
    parser.add_argument("--peers", default="", help="comma-separated host:port")
    parser.add_argument("--chain-id", default=CHAIN_ID)
    parser.add_argument("--allow-clear", action="store_true", help="enable POST /clear (demo only)")
    args = parser.parse_args()

    node = Node(args.node_id, args.port, args.token, [p for p in args.peers.split(",") if p], chain_id=args.chain_id, enable_clear=args.allow_clear)

    if args.allow_clear:
        original_dispatch = node.dispatch

        def dispatch_with_clear(handler):
            if handler.path.split("?")[0] == "/clear":
                node.store.clear()
                node.json_response(handler, 200, {"success": True, "height": node.store.height()})
                return
            original_dispatch(handler)

        node.dispatch = dispatch_with_clear

    httpd = ThreadingHTTPServer(("127.0.0.1", args.port), make_handler(node))
    print(f"ledger node {args.node_id} listening on 127.0.0.1:{args.port} height={node.store.height()}", flush=True)
    httpd.serve_forever()


if __name__ == "__main__":
    main()