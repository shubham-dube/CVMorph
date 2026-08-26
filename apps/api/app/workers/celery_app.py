"""
Celery application configuration.

Workers are run separately from the API:
    celery -A app.workers.celery_app worker --loglevel=info

Queues:
    default   — parse_task, extract_task
    rendering — render_task (separate queue so heavy rendering doesn't block parsing)
"""

from __future__ import annotations

from celery import Celery

from app.core.config import settings

celery_app = Celery(
    "cv-platform",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=[
        "app.workers.tasks.parse_task",
        "app.workers.tasks.extract_task",
        "app.workers.tasks.render_task",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_routes={
        "app.workers.tasks.render_task.*": {"queue": "rendering"},
    },
    task_acks_late=True,       # tasks re-queued if worker dies mid-execution
    worker_prefetch_multiplier=1,  # one task at a time per worker (parsing is heavy)
)
