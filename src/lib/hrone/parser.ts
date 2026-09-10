export interface ParsedHROneCredentials {
  employeeId?: number;
  name?: string;
  username?: string;
  companyDomainCode?: string;
  jwtToken?: string;
  refreshToken?: string;
  tokenExpiry?: string;
  refreshTokenExpiry?: string;
  latitude?: string;
  longitude?: string;
  geoAccuracy?: string;
  geoLocation?: string;
}

export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      Buffer.from(base64, 'base64')
        .toString('binary')
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (err) {
    console.error('Failed to decode JWT:', err);
    return null;
  }
}

export function parseCurlOrInput(input: string): ParsedHROneCredentials {
  const result: ParsedHROneCredentials = {};

  // 1. Extract JwtTokenCookie
  const jwtMatch = input.match(/JwtTokenCookie=([^;\s'"\\]+)/);
  if (jwtMatch) {
    result.jwtToken = jwtMatch[1];
  }

  // 2. Extract RefreshTokenCookie
  const refreshMatch =
    input.match(/RefreshTokenCookie=([^;\s'"\\]+)/) ||
    input.match(/refreshId=([a-fA-F0-9-]+)/) ||
    input.match(/refresh_token["']?\s*:\s*["']([^"']+)["']/);
  if (refreshMatch) {
    result.refreshToken = refreshMatch[1];
  }

  // 3. Extract domaincode
  const domainMatch =
    input.match(/domaincode:\s*([^\s'"\\]+)/i) ||
    input.match(/companyDomainCode=([^\s&'"\\]+)/) ||
    input.match(/companyDomainCode["']?\s*:\s*["']([^"']+)["']/);
  if (domainMatch) {
    result.companyDomainCode = domainMatch[1];
  }

  // 4. Extract username from body e.g. username=9871251984 or username=E1885
  const usernameMatch = input.match(/username=([^\s&'"\\]+)/);
  if (usernameMatch) {
    result.username = usernameMatch[1];
  }

  // 5. If JSON body is present in curl, parse it
  const bodyMatch = input.match(/--data(-raw)?\s+['"]([\s\S]*?)['"]\s*$/m) || input.match(/-d\s+['"]([\s\S]*?)['"]/m);
  if (bodyMatch && bodyMatch[2]) {
    try {
      const json = JSON.parse(bodyMatch[2]);
      if (json.employeeId) result.employeeId = Number(json.employeeId);
      if (json.latitude) result.latitude = String(json.latitude);
      if (json.longitude) result.longitude = String(json.longitude);
      if (json.geoAccuracy) result.geoAccuracy = String(json.geoAccuracy);
      if (json.geoLocation) result.geoLocation = String(json.geoLocation);
    } catch {
      // Not JSON, might be form-urlencoded
      const pairs = bodyMatch[2].split('&');
      for (const pair of pairs) {
        const [k, v] = pair.split('=');
        if (k === 'refreshId') result.refreshToken = decodeURIComponent(v);
        if (k === 'companyDomainCode') result.companyDomainCode = decodeURIComponent(v);
        if (k === 'username') result.username = decodeURIComponent(v);
      }
    }
  }

  // 6. Decode JWT to extract extra metadata (LogOnId, UserName, Expirations, etc.)
  if (result.jwtToken) {
    const claims = decodeJwtPayload(result.jwtToken);
    if (claims) {
      if (!result.employeeId && claims.LogOnId && !isNaN(Number(claims.LogOnId))) {
        result.employeeId = Number(claims.LogOnId);
      }
      if (!result.name && claims.UserName) {
        result.name = String(claims.UserName);
      }
      if (!result.username) {
        result.username = String(claims.UserLogOnId || claims.unique_name || claims.loginUser || '');
      }
      if (!result.companyDomainCode && claims.domainCode) {
        result.companyDomainCode = String(claims.domainCode);
      }
      if (claims.exp && typeof claims.exp === 'number') {
        result.tokenExpiry = new Date(claims.exp * 1000).toISOString();
      }
      if (claims.RefreshExpiry && typeof claims.RefreshExpiry === 'string') {
        const minutes = parseInt(claims.RefreshExpiry, 10);
        if (!isNaN(minutes)) {
          result.refreshTokenExpiry = new Date(Date.now() + minutes * 60 * 1000).toISOString();
        }
      }
    }
  }

  // Defaults if office coordinates are missing
  if (!result.latitude) result.latitude = '28.5004327';
  if (!result.longitude) result.longitude = '77.4150811';
  if (!result.geoAccuracy) result.geoAccuracy = '12.126';
  if (!result.geoLocation) result.geoLocation = '210-211, altF, Sector 142, Noida, Uttar Pradesh 201304, India';
  if (!result.companyDomainCode) result.companyDomainCode = 'uharvest';

  return result;
}
