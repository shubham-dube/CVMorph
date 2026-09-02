FROM python:3.12-slim

WORKDIR /app

# ── System dependencies ────────────────────────────────────────────────────────
# PyMuPDF     → gcc (for compilation)
# xelatex     → texlive-xetex + fonts (for LaTeX template rendering)
# LibreOffice → for PDF↔DOCX conversion (DOCX templates → PDF)
# poppler     → poppler-utils (PDF utilities)
# fonts       → common fonts for proper PDF rendering
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    gcc \
    curl \
    poppler-utils \
    # LibreOffice (headless, for DOCX→PDF conversion)
    libreoffice-writer \
    libreoffice-calc \
    libreoffice-common \
    # Fonts needed for proper PDF rendering
    fonts-liberation \
    fonts-dejavu-core \
    # texlive for LaTeX template rendering (optional — comment out to save space if not needed)
    texlive-xetex \
    texlive-latex-extra \
    texlive-fonts-recommended \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Verify LibreOffice installed correctly
RUN libreoffice --version || (echo "ERROR: LibreOffice not found after install!" && exit 1)

# ── Python dependencies ────────────────────────────────────────────────────────
RUN pip install --no-cache-dir uv

COPY apps/api/pyproject.toml .
ENV UV_PROJECT_ENVIRONMENT="/venv"
RUN uv sync --no-dev
ENV PATH="/venv/bin:$PATH"
ENV PYTHONPATH="/app"

# ── App source ────────────────────────────────────────────────────────────────
COPY apps/api/ .

# ── LibreOffice user profile dir (needed for headless mode) ───────────────────
RUN mkdir -p /root/.config/libreoffice /tmp/libreoffice-profile

# Set LibreOffice to use a writable temp profile dir to avoid permission issues
ENV SOFFICE_OPTS="--user-installation=/tmp/libreoffice-profile"

EXPOSE 8000

# Run migrations automatically on container start, then launch API server
CMD ["sh", "-c", "uv run alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
