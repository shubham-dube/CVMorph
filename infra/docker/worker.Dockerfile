FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libmupdf-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

RUN pip install uv

COPY apps/api/pyproject.toml .
RUN uv sync --no-dev

COPY apps/api/ .

CMD ["celery", "-A", "app.workers.celery_app", "worker", "--loglevel=info"]
