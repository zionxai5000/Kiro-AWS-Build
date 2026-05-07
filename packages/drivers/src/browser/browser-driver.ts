/**
 * Browser Automation Driver — Playwright-based browser automation for services without APIs.
 *
 * Structural/mock implementation that defines the correct interface,
 * handles operation types, wires up to CredentialManager for site-specific
 * credentials, and implements browser automation operations using Playwright patterns.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.6
 */

import { BaseDriver } from '../base/driver.js';
import type {
  DriverOperation,
  DriverResult,
  VerificationResult,
} from '@seraphim/core/types/driver.js';
import type { CredentialManager } from '@seraphim/core/interfaces/credential-manager.js';

// ---------------------------------------------------------------------------
// Error Codes
// ---------------------------------------------------------------------------

export const BROWSER_ERROR_CODES = {
  UNAUTHORIZED: 'BROWSER_UNAUTHORIZED',
  NOT_FOUND: 'BROWSER_NOT_FOUND',
  INVALID_PARAMS: 'BROWSER_INVALID_PARAMS',
  NAVIGATION_FAILED: 'BROWSER_NAVIGATION_FAILED',
  ELEMENT_NOT_FOUND: 'BROWSER_ELEMENT_NOT_FOUND',
  TIMEOUT: 'BROWSER_TIMEOUT',
  SCREENSHOT_FAILED: 'BROWSER_SCREENSHOT_FAILED',
  SCRIPT_ERROR: 'BROWSER_SCRIPT_ERROR',
  PAGE_CRASH: 'BROWSER_PAGE_CRASH',
  BROWSER_DISCONNECTED: 'BROWSER_DISCONNECTED',
  UNSUPPORTED_OPERATION: 'BROWSER_UNSUPPORTED_OPERATION',
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BrowserType = 'chromium' | 'firefox' | 'webkit';

export type BrowserPageStatus = 'loading' | 'ready' | 'error' | 'closed';

export interface BrowserPage {
  id: string;
  url: string;
  title: string;
  status: BrowserPageStatus;
  viewport: { width: number; height: number };
  createdAt: string;
}

export interface BrowserScreenshot {
  pageId: string;
  path: string;
  format: 'png' | 'jpeg';
  width: number;
  height: number;
  fullPage: boolean;
  capturedAt: string;
}

export interface BrowserElementInfo {
  selector: string;
  tagName: string;
  text: string;
  visible: boolean;
  attributes: Record<string, string>;
}

export interface BrowserNavigationResult {
  pageId: string;
  url: string;
  status: number;
  title: string;
  loadTimeMs: number;
  navigatedAt: string;
}

export interface BrowserScriptResult {
  pageId: string;
  result: unknown;
  executedAt: string;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface BrowserDriverConfig {
  /** Browser type to use. Defaults to 'chromium'. */
  browserType?: BrowserType;
  /** Whether to run in headless mode. Defaults to true. */
  headless?: boolean;
  /** Default viewport width. Defaults to 1280. */
  viewportWidth?: number;
  /** Default viewport height. Defaults to 720. */
  viewportHeight?: number;
  /** Default navigation timeout in milliseconds. Defaults to 30000. */
  navigationTimeoutMs?: number;
  /** User agent string override. */
  userAgent?: string;
}

// ---------------------------------------------------------------------------
// Browser Driver
// ---------------------------------------------------------------------------

export class BrowserDriver extends BaseDriver<BrowserDriverConfig> {
  readonly name = 'browser';
  readonly version = '1.0.0';

  private _driverConfig: BrowserDriverConfig | null = null;
  private readonly _completedOperations = new Map<string, DriverResult>();
  private readonly _pages = new Map<string, BrowserPage>();

  constructor(private readonly credentialManager: CredentialManager) {
    // Browser operations may be slow; use longer delays
    super({ maxAttempts: 2, initialDelayMs: 3000 });
  }

  // =====================================================================
  // Lifecycle
  // =====================================================================

  protected async doConnect(config: BrowserDriverConfig): Promise<void> {
    this._driverConfig = {
      browserType: config.browserType ?? 'chromium',
      headless: config.headless ?? true,
      viewportWidth: config.viewportWidth ?? 1280,
      viewportHeight: config.viewportHeight ?? 720,
      navigationTimeoutMs: config.navigationTimeoutMs ?? 30000,
      userAgent: config.userAgent,
    };

    this.updateSessionData({
      provider: 'playwright',
      authenticated: true,
      browserType: this._driverConfig.browserType,
      headless: this._driverConfig.headless,
    });
  }

  protected async doDisconnect(): Promise<void> {
    this._driverConfig = null;
    this._completedOperations.clear();
    this._pages.clear();
  }

  // =====================================================================
  // Execute
  // =====================================================================

  protected async doExecute(operation: DriverOperation): Promise<DriverResult> {
    const operationId = this.createOpId();

    if (!this._driverConfig) {
      return this.errorResult(operationId, BROWSER_ERROR_CODES.BROWSER_DISCONNECTED, 'Driver is not connected', false);
    }

    switch (operation.type) {
      case 'navigate':
        return this.handleNavigate(operation, operationId);
      case 'click':
        return this.handleClick(operation, operationId);
      case 'type':
        return this.handleType(operation, operationId);
      case 'screenshot':
        return this.handleScreenshot(operation, operationId);
      case 'evaluate':
        return this.handleEvaluate(operation, operationId);
      case 'waitForSelector':
        return this.handleWaitForSelector(operation, operationId);
      case 'getElement':
        return this.handleGetElement(operation, operationId);
      case 'getPageContent':
        return this.handleGetPageContent(operation, operationId);
      case 'login':
        return this.handleLogin(operation, operationId);
      case 'closePage':
        return this.handleClosePage(operation, operationId);
      default:
        return this.errorResult(
          operationId,
          BROWSER_ERROR_CODES.UNSUPPORTED_OPERATION,
          `Unsupported operation type: ${operation.type}`,
          false,
        );
    }
  }

  protected async doVerify(operationId: string): Promise<VerificationResult> {
    const result = this._completedOperations.get(operationId);
    return {
      verified: result !== undefined,
      operationId,
      details: result ? { success: result.success } : undefined,
    };
  }

  // =====================================================================
  // Operation Handlers
  // =====================================================================

  private async handleNavigate(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { url, waitUntil } = operation.params as {
      url?: string;
      waitUntil?: string;
    };

    if (!url) {
      return this.errorResult(operationId, BROWSER_ERROR_CODES.INVALID_PARAMS, 'url is required for navigate', false);
    }

    const pageId = `page-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const page: BrowserPage = {
      id: pageId,
      url,
      title: `Page: ${url}`,
      status: 'ready',
      viewport: {
        width: this._driverConfig!.viewportWidth!,
        height: this._driverConfig!.viewportHeight!,
      },
      createdAt: new Date().toISOString(),
    };

    this._pages.set(pageId, page);

    const navigation: BrowserNavigationResult = {
      pageId,
      url,
      status: 200,
      title: page.title,
      loadTimeMs: 0,
      navigatedAt: new Date().toISOString(),
    };

    const result: DriverResult = {
      success: true,
      data: navigation,
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleClick(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { pageId, selector, button, clickCount } = operation.params as {
      pageId?: string;
      selector?: string;
      button?: string;
      clickCount?: number;
    };

    if (!pageId) {
      return this.errorResult(operationId, BROWSER_ERROR_CODES.INVALID_PARAMS, 'pageId is required for click', false);
    }
    if (!selector) {
      return this.errorResult(operationId, BROWSER_ERROR_CODES.INVALID_PARAMS, 'selector is required for click', false);
    }

    if (!this._pages.has(pageId)) {
      return this.errorResult(operationId, BROWSER_ERROR_CODES.NOT_FOUND, `Page ${pageId} not found`, false);
    }

    const result: DriverResult = {
      success: true,
      data: {
        pageId,
        selector,
        button: button ?? 'left',
        clickCount: clickCount ?? 1,
        clickedAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleType(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { pageId, selector, text, delay } = operation.params as {
      pageId?: string;
      selector?: string;
      text?: string;
      delay?: number;
    };

    if (!pageId) {
      return this.errorResult(operationId, BROWSER_ERROR_CODES.INVALID_PARAMS, 'pageId is required for type', false);
    }
    if (!selector) {
      return this.errorResult(operationId, BROWSER_ERROR_CODES.INVALID_PARAMS, 'selector is required for type', false);
    }
    if (text === undefined) {
      return this.errorResult(operationId, BROWSER_ERROR_CODES.INVALID_PARAMS, 'text is required for type', false);
    }

    if (!this._pages.has(pageId)) {
      return this.errorResult(operationId, BROWSER_ERROR_CODES.NOT_FOUND, `Page ${pageId} not found`, false);
    }

    const result: DriverResult = {
      success: true,
      data: {
        pageId,
        selector,
        textLength: text.length,
        typedAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleScreenshot(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { pageId, path, format, fullPage } = operation.params as {
      pageId?: string;
      path?: string;
      format?: string;
      fullPage?: boolean;
    };

    if (!pageId) {
      return this.errorResult(operationId, BROWSER_ERROR_CODES.INVALID_PARAMS, 'pageId is required for screenshot', false);
    }

    const page = this._pages.get(pageId);
    if (!page) {
      return this.errorResult(operationId, BROWSER_ERROR_CODES.NOT_FOUND, `Page ${pageId} not found`, false);
    }

    const screenshot: BrowserScreenshot = {
      pageId,
      path: path ?? `screenshot-${Date.now()}.png`,
      format: (format as 'png' | 'jpeg') ?? 'png',
      width: page.viewport.width,
      height: page.viewport.height,
      fullPage: fullPage ?? false,
      capturedAt: new Date().toISOString(),
    };

    const result: DriverResult = {
      success: true,
      data: screenshot,
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleEvaluate(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { pageId, script } = operation.params as {
      pageId?: string;
      script?: string;
    };

    if (!pageId) {
      return this.errorResult(operationId, BROWSER_ERROR_CODES.INVALID_PARAMS, 'pageId is required for evaluate', false);
    }
    if (!script) {
      return this.errorResult(operationId, BROWSER_ERROR_CODES.INVALID_PARAMS, 'script is required for evaluate', false);
    }

    if (!this._pages.has(pageId)) {
      return this.errorResult(operationId, BROWSER_ERROR_CODES.NOT_FOUND, `Page ${pageId} not found`, false);
    }

    const scriptResult: BrowserScriptResult = {
      pageId,
      result: null,
      executedAt: new Date().toISOString(),
    };

    const result: DriverResult = {
      success: true,
      data: scriptResult,
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleWaitForSelector(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { pageId, selector, timeout, state } = operation.params as {
      pageId?: string;
      selector?: string;
      timeout?: number;
      state?: string;
    };

    if (!pageId) {
      return this.errorResult(operationId, BROWSER_ERROR_CODES.INVALID_PARAMS, 'pageId is required for waitForSelector', false);
    }
    if (!selector) {
      return this.errorResult(operationId, BROWSER_ERROR_CODES.INVALID_PARAMS, 'selector is required for waitForSelector', false);
    }

    if (!this._pages.has(pageId)) {
      return this.errorResult(operationId, BROWSER_ERROR_CODES.NOT_FOUND, `Page ${pageId} not found`, false);
    }

    const result: DriverResult = {
      success: true,
      data: {
        pageId,
        selector,
        state: state ?? 'visible',
        found: true,
        resolvedAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleGetElement(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { pageId, selector } = operation.params as {
      pageId?: string;
      selector?: string;
    };

    if (!pageId) {
      return this.errorResult(operationId, BROWSER_ERROR_CODES.INVALID_PARAMS, 'pageId is required for getElement', false);
    }
    if (!selector) {
      return this.errorResult(operationId, BROWSER_ERROR_CODES.INVALID_PARAMS, 'selector is required for getElement', false);
    }

    if (!this._pages.has(pageId)) {
      return this.errorResult(operationId, BROWSER_ERROR_CODES.NOT_FOUND, `Page ${pageId} not found`, false);
    }

    const element: BrowserElementInfo = {
      selector,
      tagName: 'div',
      text: '',
      visible: true,
      attributes: {},
    };

    const result: DriverResult = {
      success: true,
      data: element,
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleGetPageContent(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { pageId } = operation.params as { pageId?: string };

    if (!pageId) {
      return this.errorResult(operationId, BROWSER_ERROR_CODES.INVALID_PARAMS, 'pageId is required for getPageContent', false);
    }

    const page = this._pages.get(pageId);
    if (!page) {
      return this.errorResult(operationId, BROWSER_ERROR_CODES.NOT_FOUND, `Page ${pageId} not found`, false);
    }

    const result: DriverResult = {
      success: true,
      data: {
        pageId,
        url: page.url,
        title: page.title,
        html: '',
        text: '',
        retrievedAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  /**
   * Login to a website using credentials from Credential Manager.
   * Retrieves site-specific credentials securely.
   */
  private async handleLogin(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { pageId, site, usernameSelector, passwordSelector, submitSelector, credentialKey } = operation.params as {
      pageId?: string;
      site?: string;
      usernameSelector?: string;
      passwordSelector?: string;
      submitSelector?: string;
      credentialKey?: string;
    };

    if (!pageId) {
      return this.errorResult(operationId, BROWSER_ERROR_CODES.INVALID_PARAMS, 'pageId is required for login', false);
    }
    if (!site) {
      return this.errorResult(operationId, BROWSER_ERROR_CODES.INVALID_PARAMS, 'site is required for login', false);
    }

    if (!this._pages.has(pageId)) {
      return this.errorResult(operationId, BROWSER_ERROR_CODES.NOT_FOUND, `Page ${pageId} not found`, false);
    }

    // Retrieve credentials from Credential Manager
    const key = credentialKey ?? 'credentials';
    const _credential = await this.credentialManager.getCredential(`browser-${site}`, key);
    if (!_credential) {
      return this.errorResult(operationId, BROWSER_ERROR_CODES.UNAUTHORIZED, `Failed to retrieve credentials for site: ${site}`, false);
    }

    const result: DriverResult = {
      success: true,
      data: {
        pageId,
        site,
        loggedIn: true,
        loginAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleClosePage(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { pageId } = operation.params as { pageId?: string };

    if (!pageId) {
      return this.errorResult(operationId, BROWSER_ERROR_CODES.INVALID_PARAMS, 'pageId is required for closePage', false);
    }

    const page = this._pages.get(pageId);
    if (!page) {
      return this.errorResult(operationId, BROWSER_ERROR_CODES.NOT_FOUND, `Page ${pageId} not found`, false);
    }

    this._pages.delete(pageId);

    const result: DriverResult = {
      success: true,
      data: {
        pageId,
        closed: true,
        closedAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  // =====================================================================
  // Helpers
  // =====================================================================

  private createOpId(): string {
    return `browser-op-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  private errorResult(
    operationId: string,
    code: string,
    message: string,
    retryable: boolean,
    details?: Record<string, unknown>,
  ): DriverResult {
    return {
      success: false,
      error: { code, message, retryable, details },
      retryable,
      operationId,
    };
  }
}
