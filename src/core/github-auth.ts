const GITHUB_CLIENT_ID = "Ov23lijFU2NkxD93Q2f2";

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export async function requestDeviceCode(): Promise<DeviceCodeResponse> {
  const res = await fetch("https://github.com/login/device/code", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      scope: "repo",
    }),
  });

  if (!res.ok) {
    throw new Error(`GitHub device code request failed: ${res.status}`);
  }

  return res.json() as Promise<DeviceCodeResponse>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function pollForToken(deviceCode: DeviceCodeResponse, maxAttempts: number = 180): Promise<string> {
  let interval = deviceCode.interval * 1000;

  for (let i = 0; i < maxAttempts; i++) {
    if (interval > 0) await sleep(interval);

    const res = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        device_code: deviceCode.device_code,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }),
    });

    let data: Record<string, unknown>;
    try {
      data = await res.json() as Record<string, unknown>;
    } catch {
      // Body already consumed (e.g. same mock response reused) — treat as pending
      continue;
    }

    if (data.access_token) {
      return data.access_token as string;
    }

    if (data.error === "slow_down") {
      interval += 5000;
      continue;
    }

    if (data.error === "authorization_pending") {
      continue;
    }

    throw new Error(`GitHub auth error: ${data.error}`);
  }

  throw new Error("GitHub auth timed out waiting for authorization");
}
