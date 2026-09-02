FROM python:3.12-slim

WORKDIR /app

# ── System dependencies ────────────────────────────────────────────────────────
# PyMuPDF    → libmupdf-dev, gcc
# xelatex    → texlive-xetex + fonts (for LaTeX template rendering)
# LibreOffice → libreoffice-writer (for PDF↔DOCX conversion)
# poppler    → poppler-utils (PDF utilities)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libmupdf-dev \
    gcc \
    texlive-xetex \
    texlive-latex-extra \
    texlive-fonts-recommended \
    texlive-fonts-extra \
    libreoffice-writer \
    libreoffice-calc \
    poppler-utils \
    curl \
    && rm -rf /var/lib/apt/lists/*

# ── Python dependencies ────────────────────────────────────────────────────────
RUN pip install uv

COPY apps/api/pyproject.toml .
ENV UV_PROJECT_ENVIRONMENT="/venv"
RUN uv sync --no-dev
ENV PATH="/venv/bin:$PATH"
ENV PYTHONPATH="/app"

# ── App source ────────────────────────────────────────────────────────────────
COPY apps/api/ .

# ── LibreOffice user profile (needed for headless mode) ───────────────────────
RUN mkdir -p /root/.config/libreoffice

EXPOSE 8000

CMD ["sh", "-c", "uv run alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
