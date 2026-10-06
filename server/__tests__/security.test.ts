import { test, expect, describe } from "bun:test";
import {
  isValidHost,
  isValidOrigin,
  isValidSecFetchSite,
  validateRequest,
  isValidWebSocketOrigin,
  corsHeaders,
} from "../middleware/security.ts";

const config = { port: 4567 };

describe("isValidHost", () => {
  test("allows localhost with port", () => {
    expect(isValidHost("localhost:4567", config)).toBe(true);
  });

  test("allows 127.0.0.1 with port", () => {
    expect(isValidHost("127.0.0.1:4567", config)).toBe(true);
  });

  test("allows localhost without port", () => {
    expect(isValidHost("localhost", config)).toBe(true);
  });

  test("rejects external host", () => {
    expect(isValidHost("evil.com", config)).toBe(false);
  });

  test("rejects null host", () => {
    expect(isValidHost(null, config)).toBe(false);
  });

  test("rejects wrong port", () => {
    expect(isValidHost("localhost:9999", config)).toBe(false);
  });
});

describe("isValidOrigin", () => {
  test("allows correct origin", () => {
    expect(isValidOrigin("http://localhost:4567", config)).toBe(true);
  });

  test("allows 127.0.0.1 origin", () => {
    expect(isValidOrigin("http://127.0.0.1:4567", config)).toBe(true);
  });

  test("allows null origin (same-origin request)", () => {
    expect(isValidOrigin(null, config)).toBe(true);
  });

  test("rejects cross-origin", () => {
    expect(isValidOrigin("http://evil.com", config)).toBe(false);
  });

  test("rejects other localhost ports by default", () => {
    expect(isValidOrigin("http://localhost:9999", config)).toBe(false);
    expect(isValidOrigin("http://127.0.0.1:3000", config)).toBe(false);
  });

  test("rejects localhost origin without explicit port", () => {
    expect(isValidOrigin("http://localhost", config)).toBe(false);
  });

  test("allows explicitly listed localhost ports (preview servers)", () => {
    expect(isValidOrigin("http://localhost:9999", config, { extraAllowedPorts: [9999] })).toBe(
      true,
    );
  });

  test("rejects non-localhost origin even when port is listed", () => {
    expect(isValidOrigin("http://evil.com:9999", config, { extraAllowedPorts: [9999] })).toBe(
      false,
    );
  });
});

describe("isValidSecFetchSite", () => {
  test("allows GET regardless of sec-fetch-site", () => {
    expect(isValidSecFetchSite("cross-site", "GET")).toBe(true);
  });

  test("allows same-origin POST", () => {
    expect(isValidSecFetchSite("same-origin", "POST")).toBe(true);
  });

  test("allows none (direct navigation) for POST", () => {
    expect(isValidSecFetchSite("none", "POST")).toBe(true);
  });

  test("rejects cross-site POST", () => {
    expect(isValidSecFetchSite("cross-site", "POST")).toBe(false);
  });

  test("rejects same-site POST (not same-origin)", () => {
    expect(isValidSecFetchSite("same-site", "POST")).toBe(true);
  });

  test("allows null sec-fetch-site for POST (non-browser)", () => {
    expect(isValidSecFetchSite(null, "POST")).toBe(true);
  });
});

describe("validateRequest", () => {
  function makeRequest(url: string, method: string, headers: Record<string, string> = {}): Request {
    return new Request(url, {
      method,
      headers: {
        host: "localhost:4567",
        ...headers,
      },
    });
  }

  test("allows valid same-origin GET", () => {
    const req = makeRequest("http://localhost:4567/api/diff", "GET");
    expect(validateRequest(req, config)).toBeNull();
  });

  test("allows valid same-origin POST", () => {
    const req = makeRequest("http://localhost:4567/api/comment", "POST", {
      origin: "http://localhost:4567",
      "sec-fetch-site": "same-origin",
    });
    expect(validateRequest(req, config)).toBeNull();
  });

  test("rejects invalid host", () => {
    const req = makeRequest("http://evil.com/api/diff", "GET", {
      host: "evil.com",
    });
    const result = validateRequest(req, config);
    expect(result).not.toBeNull();
    expect(result?.status).toBe(403);
  });

  test("rejects cross-origin POST", () => {
    const req = makeRequest("http://localhost:4567/api/comment", "POST", {
      origin: "http://evil.com",
    });
    const result = validateRequest(req, config);
    expect(result).not.toBeNull();
    expect(result?.status).toBe(403);
  });

  test("allows cross-site POST from own localhost origin", () => {
    const req = makeRequest("http://localhost:4567/api/comment", "POST", {
      origin: "http://localhost:4567",
      "sec-fetch-site": "cross-site",
    });
    const result = validateRequest(req, config);
    expect(result).toBeNull();
  });

  test("rejects cross-site POST from another localhost port", () => {
    const req = makeRequest("http://localhost:4567/api/action", "POST", {
      origin: "http://localhost:3000",
      "sec-fetch-site": "cross-site",
    });
    const result = validateRequest(req, config);
    expect(result).not.toBeNull();
    expect(result?.status).toBe(403);
  });

  test("allows cross-site POST from a listed preview server port", () => {
    const req = makeRequest("http://localhost:4567/api/preview-comment", "POST", {
      origin: "http://localhost:3000",
      "sec-fetch-site": "cross-site",
    });
    expect(validateRequest(req, config, { extraAllowedPorts: [3000] })).toBeNull();
  });

  test("rejects cross-site POST from non-localhost origin", () => {
    const req = makeRequest("http://localhost:4567/api/comment", "POST", {
      origin: "http://evil.com",
      "sec-fetch-site": "cross-site",
    });
    const result = validateRequest(req, config);
    expect(result).not.toBeNull();
    expect(result?.status).toBe(403);
  });
});

describe("isValidWebSocketOrigin", () => {
  test("allows valid origin", () => {
    const req = new Request("http://localhost:4567/ws", {
      headers: { origin: "http://localhost:4567" },
    });
    expect(isValidWebSocketOrigin(req, config)).toBe(true);
  });

  test("rejects cross-origin", () => {
    const req = new Request("http://localhost:4567/ws", {
      headers: { origin: "http://evil.com" },
    });
    expect(isValidWebSocketOrigin(req, config)).toBe(false);
  });

  test("rejects other localhost ports", () => {
    const req = new Request("http://localhost:4567/ws", {
      headers: { origin: "http://localhost:3000" },
    });
    expect(isValidWebSocketOrigin(req, config)).toBe(false);
  });
});

describe("corsHeaders", () => {
  test("reflects own origin", () => {
    expect(corsHeaders(config, "http://127.0.0.1:4567")["Access-Control-Allow-Origin"]).toBe(
      "http://127.0.0.1:4567",
    );
  });

  test("does not reflect other localhost ports by default", () => {
    expect(corsHeaders(config, "http://localhost:3000")["Access-Control-Allow-Origin"]).toBe(
      "http://localhost:4567",
    );
  });

  test("reflects listed preview server origin", () => {
    expect(
      corsHeaders(config, "http://localhost:3000", { extraAllowedPorts: [3000] })[
        "Access-Control-Allow-Origin"
      ],
    ).toBe("http://localhost:3000");
  });
});
