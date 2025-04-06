// logUserActions.js

export function logClickEvent(event) {
    // Extract some basic event details
    const logData = {
      eventType: 'click',
      targetTag: event.target.tagName,
      targetId: event.target.id || null,
      targetClasses: event.target.className || null,
      timestamp: new Date().toISOString(),
    };
  
    // For now, just log to the console
    console.log("User Action Logged:", logData);
  
    // Later you can send this data to an API endpoint like so:
    // fetch('/api/logs', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(logData)
    // });
  }
  