import React, { useMemo, useRef, useState } from "react";

function nowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

export default function ChatWithRudy() {
  const inputRef = useRef(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState(() => [
    {
      id: "rudy-welcome",
      role: "bot",
      text: "Hi, I’m Rudy. Ask me anything about the dashboard.",
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
      { id: botId, role: "bot", text: "…", ts: nowIso(), pending: true },
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
                {m.text}
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

