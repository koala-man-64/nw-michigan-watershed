import React, { useMemo, useRef, useState } from "react";

function nowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

function TypingIndicator() {
  return (
    <span className="chat-typing" aria-label="Rudy is thinking">
      <span className="chat-typing-text">Rudy is thinking</span>
      <span className="chat-typing-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    </span>
  );
}

export default function ChatWithRudy() {
  const inputRef = useRef(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState(() => [
    {
      id: "rudy-welcome",
      role: "bot",
      text: "Hi, I’m Rudy — a hands-on tech lead who ships AI systems end-to-end (RAG/agents, APIs, UI, and Azure). Ask me anything about my projects and approach.",
      ts: nowIso(),
    },
  ]);

  const canSend = useMemo(() => !sending && draft.trim().length > 0, [sending, draft]);

  const sendMessage = async () => {
    const text = draft.trim();
    if (!text || sending) return;

    const userId = `user-${Date.now()}`;
    const botId = `bot-${Date.now() + 1}`;

    setDraft("");
    setSending(true);
    setMessages((prev) => [
      ...prev,
      { id: userId, role: "user", text, ts: nowIso() },
      { id: botId, role: "bot", text: "", ts: nowIso(), pending: true },
    ]);

    try {
      const res = await fetch("/api/chat-rudy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });

      const payload = await res.json().catch(() => ({}));
      const replyText =
        res.ok && payload && typeof payload.reply === "string"
          ? payload.reply
          : "Sorry — I couldn’t reach the server.";

      setMessages((prev) =>
        prev.map((m) => (m.id === botId ? { ...m, text: replyText, pending: false } : m))
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === botId ? { ...m, text: "Sorry — I couldn’t reach the server.", pending: false } : m
        )
      );
    } finally {
      setSending(false);
      // Keep keyboard flow smooth after sending.
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  return (
    <div className="chat-page">
      <div className="chat-shell">
        <h1 className="chat-title">Chat with Rudy</h1>
        <div className="chat-messages" role="log" aria-label="Chat messages">
          {messages.map((m) => (
            <div key={m.id} className={`chat-row ${m.role === "user" ? "user" : "bot"}`}>
              <div className={`chat-bubble ${m.role === "user" ? "user" : "bot"}`}>
                {m.pending ? <TypingIndicator /> : m.text}
              </div>
            </div>
          ))}
        </div>

        <div className="chat-composer">
          <input
            ref={inputRef}
            className="chat-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") sendMessage();
            }}
            placeholder="Type a message…"
            aria-label="Message"
            disabled={sending}
          />
          <button type="button" className="chat-send" onClick={sendMessage} disabled={!canSend}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

