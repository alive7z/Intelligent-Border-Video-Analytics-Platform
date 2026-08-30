from config import AI_ENGINE_HOST, AI_ENGINE_PORT, LOG_LEVEL


def main() -> None:
    print(f"IBVAP AI Engine starting on {AI_ENGINE_HOST}:{AI_ENGINE_PORT} ({LOG_LEVEL})")
    print("AI service scaffold only. Real ingestion, detectors, trackers, and risk logic will be implemented after approval.")


if __name__ == "__main__":
    main()
