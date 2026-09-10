import { updateEmployeeTokens } from '@/lib/db/employees';
import { EmployeeProfile } from '@/lib/types/employee';
import { decodeJwtPayload } from './parser';

export interface TokenRefreshResult {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiry?: string;
  refreshTokenExpiry?: string;
  error?: string;
  rawResponse?: unknown;
}

export async function refreshHROneToken(employee: EmployeeProfile): Promise<TokenRefreshResult> {
  const { employeeId, username, companyDomainCode, refreshToken } = employee;

  if (!refreshToken) {
    return { success: false, error: 'No refresh token available for employee' };
  }

  const endpoint = 'https://gateway.app.hrone.cloud/oauth2/token';
  const domain = companyDomainCode || 'uharvest';
  const userIdentifier = username || String(employeeId);

  const bodyParams = new URLSearchParams();
  bodyParams.append('refreshId', refreshToken);
  bodyParams.append('companyDomainCode', domain);
  bodyParams.append('grant_type', 'refresh_token');
  bodyParams.append('username', userIdentifier);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'accept': 'application/json, text/plain, */*',
        'accept-language': 'en-US,en;q=0.9',
        'accessmode': 'W',
        'content-type': 'application/x-www-form-urlencoded',
        'domaincode': domain,
        'origin': 'https://app.hrone.cloud',
        'referer': 'https://app.hrone.cloud/',
        'cookie': `RefreshTokenCookie=${refreshToken}`,
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36',
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
      return {
        success: false,
        error: (data.error_description as string) || (data.message as string) || `HTTP ${response.status} failed to refresh token`,
        rawResponse: data,
      };
    }

    const newAccessToken = String(data.access_token);
    const newRefreshToken = String(data.refresh_token || refreshToken);

    let tokenExpiry: string | undefined;
    let refreshTokenExpiry: string | undefined;

    const claims = decodeJwtPayload(newAccessToken);
    if (claims?.exp && typeof claims.exp === 'number') {
      tokenExpiry = new Date(claims.exp * 1000).toISOString();
    } else if (typeof data.expires_in === 'number') {
      tokenExpiry = new Date(Date.now() + data.expires_in * 1000).toISOString();
    }

    // Refresh token sliding window (default 60 days)
    refreshTokenExpiry = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();

    // Persist new sliding tokens in MongoDB
    await updateEmployeeTokens(
      employeeId,
      newAccessToken,
      newRefreshToken,
      tokenExpiry,
      refreshTokenExpiry
    );

    return {
      success: true,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      tokenExpiry,
      refreshTokenExpiry,
      rawResponse: data,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Network error';
    return {
      success: false,
      error: `Token refresh request error: ${msg}`,
    };
  }
}
