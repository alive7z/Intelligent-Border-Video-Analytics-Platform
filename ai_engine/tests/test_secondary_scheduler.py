from workers.secondary_scheduler import SecondaryScheduler


def test_cost_cooldown_is_per_task_and_does_not_create_a_queue():
    scheduler = SecondaryScheduler(enabled=True, budget_fraction=0.25)
    assert scheduler.allow("anpr", 10, now=1)
    scheduler.record("anpr", 1000, now=2)
    assert not scheduler.allow("anpr", 10, now=3)
    assert scheduler.allow("face", 10, now=3)
    assert scheduler.allow("anpr", 10, now=10)
    assert scheduler.snapshot()["queueDepth"] == 0


def test_stale_optional_work_is_skipped_but_disable_restores_existing_policy():
    assert not SecondaryScheduler(enabled=True, max_frame_age_ms=500).allow("face", 501, now=1)
    assert SecondaryScheduler(enabled=False).allow("face", 10000, now=1)


def test_pending_ocr_gets_only_two_prompt_retries_for_fast_consensus():
    scheduler = SecondaryScheduler(enabled=True)
    assert scheduler.allow("anpr", 10, now=1)
    scheduler.record("anpr", 500, now=1.5)
    assert scheduler.allow("anpr", 10, now=1.6, pending_confirmation=True)
    scheduler.record("anpr", 500, now=2)
    assert scheduler.allow("anpr", 10, now=2.1, pending_confirmation=True)
    scheduler.record("anpr", 500, now=2.6)
    assert not scheduler.allow("anpr", 10, now=2.7, pending_confirmation=True)


def test_state_and_costs_are_independent_across_cameras():
    a, b = SecondaryScheduler(), SecondaryScheduler()
    a.record("face", 500, now=1)
    assert not a.allow("face", 10, now=2)
    assert b.allow("face", 10, now=2)
