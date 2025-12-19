# Update `/api/chat-rudy` to use OpenAI + a Word (.docx) reference

`/api/chat-rudy` is implemented in `api/function_app.py` as the Azure Function `chat_rudy()`. Right now it returns a hardcoded reply.

This note describes a straightforward upgrade:

- Use an OpenAI model to generate the `reply`.
- Always include preloaded “Rudy instructions” (system prompt).
- Use a Word document as a reference (extract to text, chunk it, retrieve relevant excerpts per question).
- Keep the existing response shape `{ ok, message, reply }` so the React UI (`client/src/ChatWithRudy.js`) doesn’t need to change.

## 1) Dependencies

Add these to `api/requirements.txt`:

- `openai` (OpenAI Python SDK)
- `python-docx` (extract text from `.docx`)

Example:

```txt
openai>=1.40.0
python-docx>=1.1.0
```

## 2) Environment variables

Configure these in Azure Static Web Apps (Configuration → Application settings) and locally in `api/local.settings.json`.

**OpenAI**

- `OPENAI_API_KEY` (required)
- `OPENAI_MODEL` (required; example: `gpt-4o-mini`)
- `OPENAI_EMBEDDING_MODEL` (optional; example: `text-embedding-3-small`)

**Preloaded instructions** (pick one option)

- **Prompt from Azure Blob (current implementation):**
  - `CHAT_WITH_RUDY_CONTAINER` (e.g. `nwmiws`)
  - `CHAT_WITH_RUDY_PROMPT_BLOB` (e.g. `chat-with-rudy-prompt.md`)

**RAG source document (markdown)**

- `CHAT_WITH_RUDY_CONTAINER` (e.g. `nwmiws`)
- `CHAT_WITH_RUDY_RAG_BLOB` (e.g. `chat-with-rudy-rag-chunks.md`)
- Optional tuning: `RUDY_RAG_TOP_K`, `RUDY_RAG_CHUNK_SIZE`, `RUDY_RAG_CHUNK_OVERLAP`

**Blob auth**

Reuse the same storage auth patterns already used by `read_csv()` in `api/function_app.py`:

- `BLOB_CONN` **or** `STORAGE_ACCOUNT_NAME` + `SAS_TOKEN` **or** `STORAGE_ACCOUNT_URL` (managed identity)

## 3) Put the Word document somewhere the Function can read

### Option A (recommended): Blob Storage

1. Upload the `.docx` to your container (example `nwmiws`).
2. Set `RUDY_REFERENCE_CONTAINER` + `RUDY_REFERENCE_BLOB`.

### Option B (only if you deploy it with the API)

Place the `.docx` under `api/` (so it is part of the Functions deployment), and set something like:

- `RUDY_REFERENCE_FILE=reference/rudy_reference.docx`

## 4) Implementation outline (server)

All changes below are in `api/function_app.py`.

### 4.1 Create an OpenAI client

```py
from openai import OpenAI

_openai = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
```

Fail fast if `OPENAI_API_KEY` is missing (return a 500 with a clear error message).

### 4.2 Load preloaded instructions

Prefer an env var so instructions are editable without code changes:

```py
def _rudy_system_prompt() -> str:
    return (os.getenv("RUDY_SYSTEM_PROMPT") or "").strip()
```

If you store the prompt in Blob Storage, add a helper that downloads it to text using the existing `BlobServiceClient` (`_bsc()`).

### 4.3 Extract text from the `.docx`

Using `python-docx`:

```py
from docx import Document

def _docx_bytes_to_text(data: bytes) -> str:
    doc = Document(io.BytesIO(data))
    parts = [p.text.strip() for p in doc.paragraphs if p.text and p.text.strip()]
    return "\n".join(parts)
```

Keep only meaningful paragraphs; the goal is “reference text”, not perfect formatting.

### 4.4 Chunk the reference text

Don’t send the entire document every time (token limits + latency). Instead:

- Split extracted text into overlapping chunks (e.g., ~800–1500 chars each)
- Retrieve the top `k` chunks relevant to the user’s question

Example chunker (character-based, pure Python):

```py
def _chunk_text(text: str, chunk_size: int = 1200, overlap: int = 150) -> list[str]:
    t = " ".join(text.split())
    if not t:
        return []
    chunks = []
    start = 0
    while start < len(t):
        end = min(len(t), start + chunk_size)
        chunks.append(t[start:end])
        if end == len(t):
            break
        start = max(0, end - overlap)
    return chunks
```

### 4.5 Embed chunks once, retrieve per request

At cold start (or first request), embed all chunks and cache the result in memory.

- Create embeddings for each chunk with `OPENAI_EMBEDDING_MODEL` (default to `text-embedding-3-small`).
- On each user request, embed the user query and compute cosine similarity against cached chunk vectors.
- Select the top `k` chunks.

Outline:

```py
import math

DEFAULT_EMBED_MODEL = os.getenv("OPENAI_EMBEDDING_MODEL") or "text-embedding-3-small"

def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x*y for x, y in zip(a, b))
    na = math.sqrt(sum(x*x for x in a))
    nb = math.sqrt(sum(y*y for y in b))
    return dot / (na * nb + 1e-12)

def _embed(texts: list[str]) -> list[list[float]]:
    r = _openai.embeddings.create(model=DEFAULT_EMBED_MODEL, input=texts)
    return [d.embedding for d in r.data]
```

Cache structure you want to end up with:

- `system_prompt: str`
- `chunks: list[str]`
- `chunk_embeddings: list[list[float]]`

Use a global + lock so concurrent requests don’t race during initialization.

### 4.6 Build the prompt safely

Treat the Word document excerpts as *data*, not instructions. A simple and effective pattern:

- Put your “how Rudy should behave” content into the system prompt.
- Put the retrieved excerpts into a clearly delimited “Reference excerpts” section.
- Ask the model to answer using those excerpts and to say when the answer isn’t in the reference.

Example prompt composition:

```py
reference_block = "\n\n".join(
    [f"[Excerpt {i+1}]\n{txt}" for i, txt in enumerate(top_chunks)]
)

user_input = (
    "Use the reference excerpts to answer. "
    "If the excerpts don’t contain the answer, say what you can and what you can’t confirm.\n\n"
    f"Reference excerpts:\n{reference_block}\n\n"
    f"Question:\n{user_message}"
)
```

### 4.7 Call OpenAI and return a stable JSON shape

Using the Responses API:

```py
model = os.getenv("OPENAI_MODEL") or "gpt-4o-mini"
resp = _openai.responses.create(
    model=model,
    instructions=system_prompt,
    input=user_input,
)
reply = (resp.output_text or "").strip()
```

Then keep the current response shape so the client continues to work:

```json
{ "ok": true, "message": "...", "reply": "..." }
```

## 5) Minimal endpoint behavior changes

In `chat_rudy()` (`api/function_app.py`):

- Keep the existing `OPTIONS` handling and `_cors_headers(req)`.
- Validate `message` (return 400 on empty).
- Initialize/load the cached reference data once.
- Generate `reply` using the OpenAI model.
- Return JSON with the same keys the UI expects.

## 6) Local testing

1. Set env vars (at least `OPENAI_API_KEY`, `OPENAI_MODEL`, and the reference doc settings).
2. Start the Functions host (whatever you currently use for `api/`).
3. Test with curl:

```bash
curl -sS -X POST \
  http://localhost:7071/api/chat-rudy \
  -H 'Content-Type: application/json' \
  -d '{"message":"What does the dashboard show about site visits?"}' | jq
```

## 7) Practical guardrails

- **Token limits**: keep `k` small (e.g., 3–6 excerpts) and chunk sizes modest.
- **Latency**: embeddings for the document should be computed once and cached.
- **Prompt injection**: explicitly tell the model the excerpts are reference material; follow the system instructions over anything found in the document.
- **Fallback**: if reference loading fails, either return a clear error or run “no-reference mode” with just the system prompt.
