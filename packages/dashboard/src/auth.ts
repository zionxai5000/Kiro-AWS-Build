/**
 * SeraphimOS Dashboard — Cognito Authentication
 *
 * Lightweight auth module that authenticates against AWS Cognito using
 * raw fetch calls (no SDK). Handles login UI, token storage, refresh,
 * and logout.
 *
 * Uses USER_PASSWORD_AUTH flow via the Cognito InitiateAuth API.
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

interface CognitoConfig {
  region: string;
  userPoolId: string;
  clientId: string;
}

function getConfig(): CognitoConfig {
  const w = window as any;
  return {
    region: w.__SERAPHIM_COGNITO_REGION__ || 'us-east-1',
    userPoolId: w.__SERAPHIM_COGNITO_POOL_ID__ || '',
    clientId: w.__SERAPHIM_COGNITO_CLIENT_ID__ || '',
  };
}

function getCognitoEndpoint(): string {
  const { region } = getConfig();
  return `https://cognito-idp.${region}.amazonaws.com/`;
}

// ---------------------------------------------------------------------------
// Token Storage
// ---------------------------------------------------------------------------

const STORAGE_KEYS = {
  idToken: 'seraphim_id_token',
  accessToken: 'seraphim_access_token',
  refreshToken: 'seraphim_refresh_token',
} as const;

interface StoredTokens {
  idToken: string;
  accessToken: string;
  refreshToken: string;
}

function storeTokens(tokens: StoredTokens): void {
  localStorage.setItem(STORAGE_KEYS.idToken, tokens.idToken);
  localStorage.setItem(STORAGE_KEYS.accessToken, tokens.accessToken);
  localStorage.setItem(STORAGE_KEYS.refreshToken, tokens.refreshToken);
}

function getStoredTokens(): StoredTokens | null {
  const idToken = localStorage.getItem(STORAGE_KEYS.idToken);
  const accessToken = localStorage.getItem(STORAGE_KEYS.accessToken);
  const refreshToken = localStorage.getItem(STORAGE_KEYS.refreshToken);

  if (!idToken || !accessToken || !refreshToken) return null;
  return { idToken, accessToken, refreshToken };
}

function clearStoredTokens(): void {
  localStorage.removeItem(STORAGE_KEYS.idToken);
  localStorage.removeItem(STORAGE_KEYS.accessToken);
  localStorage.removeItem(STORAGE_KEYS.refreshToken);
}

// ---------------------------------------------------------------------------
// JWT Helpers
// ---------------------------------------------------------------------------

function decodeJwtPayload(token: string): Record<string, any> {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return {};
  }
}

function isTokenExpired(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload.exp) return true;
  // Consider expired if less than 60 seconds remaining
  return Date.now() >= (payload.exp - 60) * 1000;
}

// ---------------------------------------------------------------------------
// Cognito API Calls
// ---------------------------------------------------------------------------

interface AuthResult {
  IdToken: string;
  AccessToken: string;
  RefreshToken?: string;
}

async function initiateAuth(username: string, password: string): Promise<AuthResult> {
  const config = getConfig();
  const endpoint = getCognitoEndpoint();

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
    },
    body: JSON.stringify({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: config.clientId,
      AuthParameters: {
        USERNAME: username,
        PASSWORD: password,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const message = (error as any).__type
      ? (error as any).message || 'Authentication failed'
      : 'Authentication failed';
    throw new Error(message);
  }

  const data = await response.json();

  // Handle NEW_PASSWORD_REQUIRED challenge
  if (data.ChallengeName === 'NEW_PASSWORD_REQUIRED') {
    throw new Error('Password change required. Please contact administrator.');
  }

  const result = data.AuthenticationResult;
  if (!result || !result.IdToken || !result.AccessToken) {
    throw new Error('Invalid authentication response');
  }

  return {
    IdToken: result.IdToken,
    AccessToken: result.AccessToken,
    RefreshToken: result.RefreshToken,
  };
}

async function refreshTokens(refreshToken: string): Promise<AuthResult> {
  const config = getConfig();
  const endpoint = getCognitoEndpoint();

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
    },
    body: JSON.stringify({
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      ClientId: config.clientId,
      AuthParameters: {
        REFRESH_TOKEN: refreshToken,
      },
    }),
  });

  if (!response.ok) {
    throw new Error('Token refresh failed');
  }

  const data = await response.json();
  const result = data.AuthenticationResult;
  if (!result || !result.IdToken || !result.AccessToken) {
    throw new Error('Invalid refresh response');
  }

  return {
    IdToken: result.IdToken,
    AccessToken: result.AccessToken,
    // Refresh token is not returned on refresh — keep existing
  };
}

// ---------------------------------------------------------------------------
// Login UI
// ---------------------------------------------------------------------------

let loginResolve: ((token: string) => void) | null = null;

function showLoginForm(): Promise<string> {
  return new Promise((resolve) => {
    loginResolve = resolve;

    // Remove existing login overlay if present
    const existing = document.getElementById('seraphim-login-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'seraphim-login-overlay';
    overlay.className = 'login-overlay';
    overlay.innerHTML = `
      <div class="login-container">
        <div class="login-logo">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <circle cx="20" cy="20" r="18" stroke="#6c8cff" stroke-width="2"/>
            <path d="M20 8 L20 32 M12 16 L20 8 L28 16" stroke="#6c8cff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <h1 class="login-title">SeraphimOS</h1>
        <p class="login-subtitle">Dashboard Authentication</p>
        <form id="seraphim-login-form" class="login-form">
          <div class="login-field">
            <label for="login-username">Username</label>
            <input type="text" id="login-username" name="username" autocomplete="username" required />
          </div>
          <div class="login-field">
            <label for="login-password">Password</label>
            <input type="password" id="login-password" name="password" autocomplete="current-password" required />
          </div>
          <div id="login-error" class="login-error" hidden></div>
          <button type="submit" class="login-button">Sign In</button>
        </form>
      </div>
    `;

    document.body.appendChild(overlay);

    const form = document.getElementById('seraphim-login-form') as HTMLFormElement;
    const errorEl = document.getElementById('login-error') as HTMLElement;
    const button = form.querySelector('button') as HTMLButtonElement;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = (document.getElementById('login-username') as HTMLInputElement).value.trim();
      const password = (document.getElementById('login-password') as HTMLInputElement).value;

      if (!username || !password) return;

      button.disabled = true;
      button.textContent = 'Signing in...';
      errorEl.hidden = true;

      try {
        const result = await initiateAuth(username, password);
        const tokens: StoredTokens = {
          idToken: result.IdToken,
          accessToken: result.AccessToken,
          refreshToken: result.RefreshToken || '',
        };
        storeTokens(tokens);
        hideLoginForm();
        if (loginResolve) {
          loginResolve(tokens.idToken);
          loginResolve = null;
        }
      } catch (err: any) {
        errorEl.textContent = err.message || 'Authentication failed';
        errorEl.hidden = false;
        button.disabled = false;
        button.textContent = 'Sign In';
      }
    });

    // Focus username field
    setTimeout(() => {
      (document.getElementById('login-username') as HTMLInputElement)?.focus();
    }, 100);
  });
}

function hideLoginForm(): void {
  const overlay = document.getElementById('seraphim-login-overlay');
  if (overlay) overlay.remove();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the current valid idToken. If the token is expired, attempts
 * a refresh. If refresh fails, shows the login form.
 */
export async function getAuthToken(): Promise<string> {
  const tokens = getStoredTokens();

  if (!tokens) {
    return showLoginForm();
  }

  // Token still valid
  if (!isTokenExpired(tokens.idToken)) {
    return tokens.idToken;
  }

  // Try refresh
  if (tokens.refreshToken) {
    try {
      const refreshed = await refreshTokens(tokens.refreshToken);
      const updated: StoredTokens = {
        idToken: refreshed.IdToken,
        accessToken: refreshed.AccessToken,
        refreshToken: tokens.refreshToken, // Keep existing refresh token
      };
      storeTokens(updated);
      return updated.idToken;
    } catch {
      // Refresh failed — clear and re-login
      clearStoredTokens();
      return showLoginForm();
    }
  }

  // No refresh token — re-login
  clearStoredTokens();
  return showLoginForm();
}

/**
 * Ensures the user is authenticated. Returns the valid idToken.
 * Shows login form if no valid session exists.
 */
export async function ensureAuthenticated(): Promise<string> {
  return getAuthToken();
}

/**
 * Clears all stored tokens and shows the login form.
 */
export function logout(): void {
  clearStoredTokens();
  showLoginForm();
}

/**
 * Force re-authentication (e.g., on 401 response).
 */
export async function reauthenticate(): Promise<string> {
  clearStoredTokens();
  return showLoginForm();
}
