FROM python:3.12-slim

WORKDIR /app

# System deps for PyMuPDF + python-docx
RUN apt-get update && apt-get install -y --no-install-recommends \
    libmupdf-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Install uv for fast dependency resolution
RUN pip install uv

COPY apps/api/pyproject.toml .
RUN uv sync --no-dev

COPY apps/api/ .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
