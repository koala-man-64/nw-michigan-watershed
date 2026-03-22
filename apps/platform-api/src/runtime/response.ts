import type { HttpResponseInit } from "@azure/functions";

export function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
): HttpResponseInit {
  return {
    status,
    jsonBody: body,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, private",
      ...headers,
    },
  };
}

export function stateUnavailableResponse(): HttpResponseInit {
  return jsonResponse(503, {
    error: "state_unavailable",
    message: "Platform state is unavailable.",
  });
}

export function textResponse(
  status: number,
  body: string,
  contentType = "text/plain; charset=utf-8",
  headers: Record<string, string> = {}
): HttpResponseInit {
  return {
    status,
    body,
    headers: {
      "Content-Type": contentType,
      ...headers,
    },
  };
}
