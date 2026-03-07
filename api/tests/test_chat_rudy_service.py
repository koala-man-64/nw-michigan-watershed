from __future__ import annotations

import types

import chat_rudy_service


def test_chunk_text_returns_empty_for_blank_input() -> None:
    assert chat_rudy_service.chunk_text("   ") == []


def test_split_rag_chunks_respects_chunk_markers() -> None:
    text = "Intro\nCHUNK: one\nLine A\nCHUNK: two\nLine B"

    assert chat_rudy_service.split_rag_chunks(text, chunk_size=1200, overlap=150) == [
        "Intro",
        "CHUNK: one\nLine A",
        "CHUNK: two\nLine B",
    ]


def test_lexical_prefilter_prioritizes_term_overlap() -> None:
    chunks = ["oak pine lake", "river delta", "pine watershed"]

    indexes = chat_rudy_service.lexical_prefilter("pine lake", chunks, take=2)

    assert indexes == [0, 2]


def test_rudy_rag_retrieve_uses_lexical_mode(monkeypatch) -> None:
    monkeypatch.setenv("RUDY_RAG_MODE", "lexical")
    monkeypatch.setenv("RUDY_RAG_TOP_K", "2")
    monkeypatch.setattr(
        chat_rudy_service,
        "rudy_rag_load",
        lambda: (["lake pine", "river reed", "pine cedar"], [None, None, None]),
    )

    assert chat_rudy_service.rudy_rag_retrieve("pine") == ["pine cedar", "lake pine"]


def test_rudy_rag_retrieve_falls_back_and_sets_cooldown_on_rate_limit(monkeypatch) -> None:
    class RateLimitError(Exception):
        status_code = 429

    monkeypatch.setenv("RUDY_RAG_RATE_LIMIT_COOLDOWN_SEC", "60")
    monkeypatch.setattr(
        chat_rudy_service,
        "rudy_rag_load",
        lambda: (["lake pine", "river reed"], [None, None]),
    )
    monkeypatch.setattr(chat_rudy_service, "embed", lambda texts: (_ for _ in ()).throw(RateLimitError("limited")))
    monkeypatch.setattr(chat_rudy_service.time, "time", lambda: 100.0)

    result = chat_rudy_service.rudy_rag_retrieve("pine")

    assert result == ["lake pine", "river reed"]
    assert chat_rudy_service._rudy_rag_embeddings_disabled_until == 160.0


def test_generate_reply_uses_openai_response_contract(monkeypatch) -> None:
    fake_client = types.SimpleNamespace(
        responses=types.SimpleNamespace(
            create=lambda **kwargs: types.SimpleNamespace(output_text="Answer from Rudy")
        )
    )
    monkeypatch.setenv("OPENAI_MODEL", "gpt-test")
    monkeypatch.setattr(chat_rudy_service, "rudy_system_prompt", lambda: "system")
    monkeypatch.setattr(chat_rudy_service, "rudy_rag_retrieve", lambda query: ["fact one", "fact two"])
    monkeypatch.setattr(chat_rudy_service, "openai_client", lambda: fake_client)

    result = chat_rudy_service.generate_reply("hello")

    assert result == {
        "reply": "Answer from Rudy",
        "model": "gpt-test",
        "rag_chunks": 2,
        "prompt_length": 6,
    }
