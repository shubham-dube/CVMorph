FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libmupdf-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

RUN pip install uv

COPY apps/api/pyproject.toml .
ENV UV_PROJECT_ENVIRONMENT="/venv"
RUN uv sync --no-dev
ENV PATH="/venv/bin:$PATH"

COPY apps/api/ .

CMD ["celery", "-A", "app.workers.celery_app", "worker", "--loglevel=info"]
