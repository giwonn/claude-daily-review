// @ts-check
/** @typedef {import('./types.d.ts').DeviceCodeResponse} DeviceCodeResponse */

const GITHUB_CLIENT_ID = 'Ov23lijFU2NkxD93Q2f2';

/** @returns {Promise<DeviceCodeResponse>} */
export async function requestDeviceCode() {
  const res = await fetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: GITHUB_CLIENT_ID, scope: 'repo' }),
  });
  if (!res.ok) throw new Error(`GitHub device code request failed: ${res.status}`);
  return /** @type {Promise<DeviceCodeResponse>} */ (res.json());
}

/** @param {number} ms @returns {Promise<void>} */
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

/** @param {DeviceCodeResponse} deviceCode @param {number} [maxAttempts=180] @returns {Promise<string>} */
export async function pollForToken(deviceCode, maxAttempts = 180) {
  let interval = deviceCode.interval * 1000;
  for (let i = 0; i < maxAttempts; i++) {
    if (interval > 0) await sleep(interval);
    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        device_code: deviceCode.device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    });
    /** @type {Record<string, unknown>} */
    let data;
    try { data = /** @type {Record<string, unknown>} */ (await res.json()); }
    catch { continue; }
    if (data.access_token) return /** @type {string} */ (data.access_token);
    if (data.error === 'slow_down') { interval += 5000; continue; }
    if (data.error === 'authorization_pending') continue;
    throw new Error(`GitHub auth error: ${data.error}`);
  }
  throw new Error('GitHub auth timed out waiting for authorization');
}
