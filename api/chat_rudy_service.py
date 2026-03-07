from __future__ import annotations

import math
import threading
import time
from typing import Optional

from config import env, env_int, required_env
from storage import download_blob_text

try:
    from openai import OpenAI
except Exception:
    OpenAI = None

_openai_lock = threading.Lock()
_openai_client = None

_rudy_prompt_lock = threading.Lock()
_rudy_prompt_cached: Optional[str] = None

_rudy_rag_lock = threading.Lock()
_rudy_rag_chunks_cached: Optional[list[str]] = None
_rudy_rag_embeddings_cached: Optional[list[Optional[list[float]]]] = None
_rudy_rag_embeddings_disabled_until: float = 0.0


def openai_client() -> "OpenAI":
    global _openai_client
    if _openai_client is not None:
        return _openai_client

    if OpenAI is None:
        raise RuntimeError("OpenAI SDK not installed. Add 'openai' to api/requirements.txt.")

    api_key = required_env("OPENAI_API_KEY")
    with _openai_lock:
        if _openai_client is None:
            _openai_client = OpenAI(api_key=api_key, max_retries=env_int("OPENAI_MAX_RETRIES", 2))
    return _openai_client


def rudy_system_prompt() -> str:
    container = required_env("CHAT_WITH_RUDY_CONTAINER")
    blob_name = required_env("CHAT_WITH_RUDY_PROMPT_BLOB")
    global _rudy_prompt_cached
    if _rudy_prompt_cached is not None:
        return _rudy_prompt_cached
    with _rudy_prompt_lock:
        if _rudy_prompt_cached is None:
            _rudy_prompt_cached = download_blob_text(container, blob_name).strip()
    return _rudy_prompt_cached or ""


def chunk_text(text: str, chunk_size: int = 1200, overlap: int = 150) -> list[str]:
    normalized = " ".join(text.split())
    if not normalized:
        return []
    chunks: list[str] = []
    start = 0
    while start < len(normalized):
        end = min(len(normalized), start + chunk_size)
        chunks.append(normalized[start:end])
        if end == len(normalized):
            break
        start = max(0, end - overlap)
    return chunks


def split_rag_chunks(text: str, chunk_size: int, overlap: int) -> list[str]:
    lines = text.splitlines()
    preamble: list[str] = []
    chunks: list[str] = []
    current: list[str] = []
    saw_chunk_marker = False

    for line in lines:
        if line.startswith("CHUNK:"):
            if not saw_chunk_marker:
                saw_chunk_marker = True
                pre = "\n".join(preamble).strip()
                if pre:
                    chunks.append(pre)
                preamble = []
            if current:
                chunks.append("\n".join(current).strip())
                current = []
        if saw_chunk_marker:
            current.append(line)
        else:
            preamble.append(line)

    if saw_chunk_marker and current:
        chunks.append("\n".join(current).strip())

    if not saw_chunk_marker:
        chunks = chunk_text(text, chunk_size=chunk_size, overlap=overlap)

    output: list[str] = []
    for chunk in chunks:
        if not chunk:
            continue
        if len(chunk) > chunk_size * 2:
            output.extend(chunk_text(chunk, chunk_size=chunk_size, overlap=overlap))
        else:
            output.append(chunk)
    return output


def cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    return dot / (norm_a * norm_b + 1e-12)


def embed(texts: list[str]) -> list[list[float]]:
    model = (env("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small") or "text-embedding-3-small").strip()
    batch_size = env_int("OPENAI_EMBED_BATCH_SIZE", 64)
    if batch_size < 1:
        batch_size = 64

    vectors: list[list[float]] = []
    for start in range(0, len(texts), batch_size):
        batch = texts[start : start + batch_size]
        response = openai_client().embeddings.create(model=model, input=batch)
        vectors.extend([item.embedding for item in response.data])
    return vectors


def is_openai_rate_limited(exc: Exception) -> bool:
    status = getattr(exc, "status_code", None)
    if status == 429:
        return True
    response = getattr(exc, "response", None)
    if response is not None and getattr(response, "status_code", None) == 429:
        return True
    text = str(exc).lower()
    return "429" in text or "rate limit" in text or "too many requests" in text


def tokenize_for_rag(text: str) -> set[str]:
    import re

    return set(re.findall(r"[a-z0-9]{2,}", (text or "").lower()))


def lexical_prefilter(query: str, chunks: list[str], take: int) -> list[int]:
    query_terms = tokenize_for_rag(query)
    if not query_terms:
        return list(range(min(take, len(chunks))))

    scored: list[tuple[int, int]] = []
    for index, chunk in enumerate(chunks):
        scored.append((len(query_terms & tokenize_for_rag(chunk)), index))
    scored.sort(reverse=True)
    return [index for _, index in scored[: min(take, len(scored))]]


def rudy_rag_load() -> tuple[list[str], list[Optional[list[float]]]]:
    global _rudy_rag_chunks_cached, _rudy_rag_embeddings_cached

    if _rudy_rag_chunks_cached is not None and _rudy_rag_embeddings_cached is not None:
        return _rudy_rag_chunks_cached, _rudy_rag_embeddings_cached

    with _rudy_rag_lock:
        if _rudy_rag_chunks_cached is not None and _rudy_rag_embeddings_cached is not None:
            return _rudy_rag_chunks_cached, _rudy_rag_embeddings_cached

        container = required_env("CHAT_WITH_RUDY_CONTAINER")
        blob_name = required_env("CHAT_WITH_RUDY_RAG_BLOB")
        raw = download_blob_text(container, blob_name)
        chunks = split_rag_chunks(raw, chunk_size=env_int("RUDY_RAG_CHUNK_SIZE", 1200), overlap=env_int("RUDY_RAG_CHUNK_OVERLAP", 150))
        if not chunks:
            raise RuntimeError("RAG source produced no chunks.")
        _rudy_rag_chunks_cached = chunks
        _rudy_rag_embeddings_cached = [None] * len(chunks)
        return _rudy_rag_chunks_cached, _rudy_rag_embeddings_cached


def rudy_rag_retrieve(query: str) -> list[str]:
    global _rudy_rag_embeddings_disabled_until
    top_k = max(1, env_int("RUDY_RAG_TOP_K", 6))
    chunks, embeddings = rudy_rag_load()
    prefilter_k = max(top_k, env_int("RUDY_RAG_PREFILTER_K", 25))
    candidate_indexes = lexical_prefilter(query, chunks, take=prefilter_k)

    if time.time() < _rudy_rag_embeddings_disabled_until:
        return [chunks[index] for index in candidate_indexes[:top_k]]

    mode = (env("RUDY_RAG_MODE", "embeddings") or "embeddings").strip().lower()
    if mode == "lexical":
        return [chunks[index] for index in candidate_indexes[:top_k]]

    try:
        query_vec = embed([query])[0]
        missing_indexes = [index for index in candidate_indexes if embeddings[index] is None]
        if missing_indexes:
            new_vectors = embed([chunks[index] for index in missing_indexes])
            for index, vector in zip(missing_indexes, new_vectors):
                embeddings[index] = vector

        scored: list[tuple[float, int]] = []
        for index in candidate_indexes:
            vector = embeddings[index]
            if vector is None:
                continue
            scored.append((cosine(query_vec, vector), index))

        scored.sort(reverse=True)
        top = scored[:top_k]
        if top:
            return [chunks[index] for _, index in top]
    except Exception as exc:
        if is_openai_rate_limited(exc):
            cooldown = max(0, env_int("RUDY_RAG_RATE_LIMIT_COOLDOWN_SEC", 60))
            _rudy_rag_embeddings_disabled_until = time.time() + cooldown

    return [chunks[index] for index in candidate_indexes[:top_k]]


def generate_reply(user_message: str) -> dict[str, object]:
    system_prompt = rudy_system_prompt()
    top_chunks = rudy_rag_retrieve(user_message)
    reference_block = "\n\n".join([f"[Excerpt {index + 1}]\n{text}" for index, text in enumerate(top_chunks)])
    user_input = f"INTERVIEWER_QUESTION: {user_message}\n\nRETRIEVED_CONTEXT:\n{reference_block}\n"
    model = (env("OPENAI_MODEL", "gpt-4o-mini") or "gpt-4o-mini").strip()
    response = openai_client().responses.create(
        model=model,
        instructions=system_prompt,
        input=user_input,
    )
    reply = (getattr(response, "output_text", "") or "").strip()
    if not reply:
        reply = "Sorry — I couldn’t generate a response right now."
    return {
        "reply": reply,
        "model": model,
        "rag_chunks": len(top_chunks),
        "prompt_length": len(system_prompt),
    }
