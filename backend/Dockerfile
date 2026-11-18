FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN groupadd --system app && useradd --system --gid app --home /app app

# INSTALL_AZURE=false builds a smaller image for air-gapped / on-premises installs.
ARG INSTALL_AZURE=true

COPY requirements.txt requirements-azure.txt ./
RUN pip install --upgrade pip && pip install -r requirements.txt \
    && if [ "$INSTALL_AZURE" = "true" ]; then pip install -r requirements-azure.txt; fi \
    && python -c "from tree_sitter_language_pack import download; download(['java','csharp','python','javascript','typescript','tsx'])"

# Built-in embedding models for semantic search, baked into the image so they work without internet access.
ENV FASTEMBED_CACHE_PATH=/app/models
RUN python -c "from fastembed import TextEmbedding; [list(TextEmbedding(m, cache_dir='/app/models').embed(['warm up'])) for m in ('BAAI/bge-small-en-v1.5', 'sentence-transformers/all-MiniLM-L6-v2')]"
# The models are in the image now: never contact the model hub at run time.
ENV HF_HUB_OFFLINE=1

COPY app ./app
COPY migrations ./migrations
COPY migrations_docqa ./migrations_docqa
COPY alembic.ini ./
COPY sample_data ./sample_data

RUN mkdir -p /app/data && chown -R app:app /app
USER app

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')" || exit 1

# The same image runs the queue worker with: python -m app.worker
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
