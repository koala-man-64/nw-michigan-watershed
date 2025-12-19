export async function logClickEvent(event) {
  const logData = {
    eventType: 'click',
    targetTag: event.target.tagName,
    targetId: event.target.id || null,
    targetClasses: event.target.className || null,
    // Avoid logging innerText/PII; server may opt-in to capture limited text if desired.
    clientUrl: window.location.pathname
  };

  console.log("User Action Logged:", logData);

  try {
    const result = await fetch('/api/log-event', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(logData)
    });

    if (!result.ok) {
      const errorText = await result.text();
      console.error(
        `Error logging event: Status ${result.status} (${result.statusText}). Response: ${errorText}`
      );
    }else {
      console.log("Event logged successfully.");
    }
  } catch (err) {
    console.error("Error sending log event:", err);
  }
}
