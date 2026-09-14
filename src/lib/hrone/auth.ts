import { decodeJwtPayload } from './parser';

export interface HROneLoginResult {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiry?: string;
  refreshTokenExpiry?: string;
  employeeId?: number;
  name?: string;
  username?: string;
  domainCode?: string;
  error?: string;
  rawResponse?: unknown;
}

/**
 * Authenticate directly with HROne Cloud using Username/Employee Code and Password
 */
export async function loginWithHROne(
  username: string,
  password: string,
  domainCode = 'uharvest'
): Promise<HROneLoginResult> {
  const endpoint = 'https://gateway.app.hrone.cloud/employeecode/oauth2/token';
  const cleanUsername = username.trim();
  const cleanDomain = (domainCode || 'uharvest').trim();

  const bodyParams = new URLSearchParams();
  bodyParams.append('username', cleanUsername);
  bodyParams.append('password', password);
  bodyParams.append('grant_type', 'password');
  bodyParams.append('loginType', '1');
  bodyParams.append('companyDomainCode', cleanDomain);
  bodyParams.append('isUpdated', '0');
  bodyParams.append('validSource', 'Y');
  bodyParams.append('deviceName', 'Chrome-mac-os-x-15');

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'accept': 'application/json, text/plain, */*',
        'accept-language': 'en-US,en;q=0.8',
        'accessmode': 'W',
        'content-type': 'application/x-www-form-urlencoded',
        'domaincode': cleanDomain,
        'origin': 'https://app.hrone.cloud',
        'referer': 'https://app.hrone.cloud/',
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36',
        'x-requested-with': 'https://app.hrone.cloud',
      },
      body: bodyParams.toString(),
    });

    const responseText = await response.text();
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(responseText);
    } catch {
      return {
        success: false,
        error: `Invalid response from HROne (${response.status}): ${responseText.slice(0, 200)}`,
      };
    }

    if (!response.ok || !data.access_token) {
      const errorMsg =
        (data.error_description as string) ||
        (data.error as string) ||
        (data.message as string) ||
        `Authentication failed (HTTP ${response.status})`;
      return {
        success: false,
        error: errorMsg,
        rawResponse: data,
      };
    }

    const accessToken = data.access_token as string;
    const refreshToken = (data.refresh_token as string) || '';

    // Parse token expiry from .expires or standard 60-hour window
    let tokenExpiry: string;
    if (typeof data['.expires'] === 'string') {
      tokenExpiry = new Date(data['.expires']).toISOString();
    } else {
      const expiresInSec = typeof data.expires_in === 'number' ? data.expires_in : 216000;
      tokenExpiry = new Date(Date.now() + expiresInSec * 1000).toISOString();
    }

    // Refresh token valid for 7 days
    const refreshTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    // Decode JWT payload for employee metadata
    const jwtClaims = decodeJwtPayload(accessToken) || {};
    const employeeId =
      Number(jwtClaims.LogOnId) ||
      Number(jwtClaims.EmployeeId) ||
      Number(jwtClaims.Uid) ||
      0;
    const name = (jwtClaims.UserName as string) || (jwtClaims.unique_name as string) || cleanUsername;

    return {
      success: true,
      accessToken,
      refreshToken,
      tokenExpiry,
      refreshTokenExpiry,
      employeeId,
      name,
      username: cleanUsername,
      domainCode: cleanDomain,
      rawResponse: data,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Network error connecting to HROne: ${message}`,
    };
  }
}
