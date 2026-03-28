import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { requestDeviceCode, pollForToken, type DeviceCodeResponse } from "../../src/core/github-auth.js";

describe("github-auth", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("requestDeviceCode", () => {
    it("returns device code response", async () => {
      const mockResponse = {
        device_code: "dc_123",
        user_code: "ABCD-1234",
        verification_uri: "https://github.com/login/device",
        expires_in: 900,
        interval: 5,
      };
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const result = await requestDeviceCode();
      expect(result.user_code).toBe("ABCD-1234");
      expect(result.device_code).toBe("dc_123");
      expect(result.verification_uri).toBe("https://github.com/login/device");
    });

    it("throws on API error", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response("error", { status: 500 }),
      );
      await expect(requestDeviceCode()).rejects.toThrow();
    });
  });

  describe("pollForToken", () => {
    it("returns token on success", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "gho_abc123", token_type: "bearer" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const deviceCode: DeviceCodeResponse = {
        device_code: "dc_123",
        user_code: "ABCD-1234",
        verification_uri: "https://github.com/login/device",
        expires_in: 900,
        interval: 0,
      };

      const token = await pollForToken(deviceCode, 1);
      expect(token).toBe("gho_abc123");
    });

    it("retries on authorization_pending", async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ error: "authorization_pending" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ access_token: "gho_abc123", token_type: "bearer" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );

      const deviceCode: DeviceCodeResponse = {
        device_code: "dc_123",
        user_code: "ABCD-1234",
        verification_uri: "https://github.com/login/device",
        expires_in: 900,
        interval: 0,
      };

      const token = await pollForToken(deviceCode, 5);
      expect(token).toBe("gho_abc123");
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it("throws on timeout (max attempts)", async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify({ error: "authorization_pending" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const deviceCode: DeviceCodeResponse = {
        device_code: "dc_123",
        user_code: "ABCD-1234",
        verification_uri: "https://github.com/login/device",
        expires_in: 900,
        interval: 0,
      };

      await expect(pollForToken(deviceCode, 2)).rejects.toThrow("timed out");
    });
  });
});
