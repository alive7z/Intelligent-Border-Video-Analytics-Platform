import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np
import pytest

from streaming.live_ingest import LiveFrameProducer


class FakeReader:
    def __init__(self):
        self.count = 0
        self.closed = False

    def read(self):
        if self.closed:
            return False, None
        self.count += 1
        time.sleep(0.005)
        return True, np.full((8, 8, 3), self.count % 255, dtype=np.uint8)

    def get_metadata(self):
        return {
            "consecutiveFailures": 0,
            "lastFailureReason": None,
            "readTimeoutSeconds": 0.1,
        }

    def close(self):
        self.closed = True


def test_producer_keeps_only_latest_and_counts_stale_drops():
    reader = FakeReader()
    producer = LiveFrameProducer(reader, "CAM-TEST")
    producer.start()
    deadline = time.monotonic() + 1.0
    while producer.get_stats()["framesReceived"] < 5 and time.monotonic() < deadline:
        time.sleep(0.01)

    latest = producer.get_latest()
    stats = producer.get_stats()
    assert latest is not None
    assert latest.sequence == stats["latestSequence"]
    assert stats["droppedStaleFrames"] >= 3
    assert stats["decodedFps"] > 0
    assert producer.stop()


def test_producer_refuses_duplicate_start_and_stops_reader():
    reader = FakeReader()
    producer = LiveFrameProducer(reader, "CAM-TEST")
    producer.start()
    with pytest.raises(RuntimeError):
        producer.start()
    assert producer.stop()
    assert reader.closed is True
    assert producer.is_alive() is False
