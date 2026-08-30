class FrameBuffer:
    """Placeholder for buffering, sampling, and frame management."""

    def __init__(self, maxlen: int = 30):
        self.maxlen = maxlen
        self.frames = []

    def push(self, frame):
        self.frames.append(frame)
        if len(self.frames) > self.maxlen:
            self.frames.pop(0)

    def clear(self):
        self.frames.clear()
