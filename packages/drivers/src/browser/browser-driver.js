"use strict";
/**
 * Browser Automation Driver — Playwright-based browser automation for services without APIs.
 *
 * Structural/mock implementation that defines the correct interface,
 * handles operation types, wires up to CredentialManager for site-specific
 * credentials, and implements browser automation operations using Playwright patterns.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.6
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrowserDriver = exports.BROWSER_ERROR_CODES = void 0;
const driver_js_1 = require("../base/driver.js");
// ---------------------------------------------------------------------------
// Error Codes
// ---------------------------------------------------------------------------
exports.BROWSER_ERROR_CODES = {
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
};
// ---------------------------------------------------------------------------
// Browser Driver
// ---------------------------------------------------------------------------
class BrowserDriver extends driver_js_1.BaseDriver {
    credentialManager;
    name = 'browser';
    version = '1.0.0';
    _driverConfig = null;
    _completedOperations = new Map();
    _pages = new Map();
    constructor(credentialManager) {
        // Browser operations may be slow; use longer delays
        super({ maxAttempts: 2, initialDelayMs: 3000 });
        this.credentialManager = credentialManager;
    }
    // =====================================================================
    // Lifecycle
    // =====================================================================
    async doConnect(config) {
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
    async doDisconnect() {
        this._driverConfig = null;
        this._completedOperations.clear();
        this._pages.clear();
    }
    // =====================================================================
    // Execute
    // =====================================================================
    async doExecute(operation) {
        const operationId = this.createOpId();
        if (!this._driverConfig) {
            return this.errorResult(operationId, exports.BROWSER_ERROR_CODES.BROWSER_DISCONNECTED, 'Driver is not connected', false);
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
                return this.errorResult(operationId, exports.BROWSER_ERROR_CODES.UNSUPPORTED_OPERATION, `Unsupported operation type: ${operation.type}`, false);
        }
    }
    async doVerify(operationId) {
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
    async handleNavigate(operation, operationId) {
        const { url, waitUntil } = operation.params;
        if (!url) {
            return this.errorResult(operationId, exports.BROWSER_ERROR_CODES.INVALID_PARAMS, 'url is required for navigate', false);
        }
        const pageId = `page-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const page = {
            id: pageId,
            url,
            title: `Page: ${url}`,
            status: 'ready',
            viewport: {
                width: this._driverConfig.viewportWidth,
                height: this._driverConfig.viewportHeight,
            },
            createdAt: new Date().toISOString(),
        };
        this._pages.set(pageId, page);
        const navigation = {
            pageId,
            url,
            status: 200,
            title: page.title,
            loadTimeMs: 0,
            navigatedAt: new Date().toISOString(),
        };
        const result = {
            success: true,
            data: navigation,
            retryable: false,
            operationId,
        };
        this._completedOperations.set(operationId, result);
        return result;
    }
    async handleClick(operation, operationId) {
        const { pageId, selector, button, clickCount } = operation.params;
        if (!pageId) {
            return this.errorResult(operationId, exports.BROWSER_ERROR_CODES.INVALID_PARAMS, 'pageId is required for click', false);
        }
        if (!selector) {
            return this.errorResult(operationId, exports.BROWSER_ERROR_CODES.INVALID_PARAMS, 'selector is required for click', false);
        }
        if (!this._pages.has(pageId)) {
            return this.errorResult(operationId, exports.BROWSER_ERROR_CODES.NOT_FOUND, `Page ${pageId} not found`, false);
        }
        const result = {
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
    async handleType(operation, operationId) {
        const { pageId, selector, text, delay } = operation.params;
        if (!pageId) {
            return this.errorResult(operationId, exports.BROWSER_ERROR_CODES.INVALID_PARAMS, 'pageId is required for type', false);
        }
        if (!selector) {
            return this.errorResult(operationId, exports.BROWSER_ERROR_CODES.INVALID_PARAMS, 'selector is required for type', false);
        }
        if (text === undefined) {
            return this.errorResult(operationId, exports.BROWSER_ERROR_CODES.INVALID_PARAMS, 'text is required for type', false);
        }
        if (!this._pages.has(pageId)) {
            return this.errorResult(operationId, exports.BROWSER_ERROR_CODES.NOT_FOUND, `Page ${pageId} not found`, false);
        }
        const result = {
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
    async handleScreenshot(operation, operationId) {
        const { pageId, path, format, fullPage } = operation.params;
        if (!pageId) {
            return this.errorResult(operationId, exports.BROWSER_ERROR_CODES.INVALID_PARAMS, 'pageId is required for screenshot', false);
        }
        const page = this._pages.get(pageId);
        if (!page) {
            return this.errorResult(operationId, exports.BROWSER_ERROR_CODES.NOT_FOUND, `Page ${pageId} not found`, false);
        }
        const screenshot = {
            pageId,
            path: path ?? `screenshot-${Date.now()}.png`,
            format: format ?? 'png',
            width: page.viewport.width,
            height: page.viewport.height,
            fullPage: fullPage ?? false,
            capturedAt: new Date().toISOString(),
        };
        const result = {
            success: true,
            data: screenshot,
            retryable: false,
            operationId,
        };
        this._completedOperations.set(operationId, result);
        return result;
    }
    async handleEvaluate(operation, operationId) {
        const { pageId, script } = operation.params;
        if (!pageId) {
            return this.errorResult(operationId, exports.BROWSER_ERROR_CODES.INVALID_PARAMS, 'pageId is required for evaluate', false);
        }
        if (!script) {
            return this.errorResult(operationId, exports.BROWSER_ERROR_CODES.INVALID_PARAMS, 'script is required for evaluate', false);
        }
        if (!this._pages.has(pageId)) {
            return this.errorResult(operationId, exports.BROWSER_ERROR_CODES.NOT_FOUND, `Page ${pageId} not found`, false);
        }
        const scriptResult = {
            pageId,
            result: null,
            executedAt: new Date().toISOString(),
        };
        const result = {
            success: true,
            data: scriptResult,
            retryable: false,
            operationId,
        };
        this._completedOperations.set(operationId, result);
        return result;
    }
    async handleWaitForSelector(operation, operationId) {
        const { pageId, selector, timeout, state } = operation.params;
        if (!pageId) {
            return this.errorResult(operationId, exports.BROWSER_ERROR_CODES.INVALID_PARAMS, 'pageId is required for waitForSelector', false);
        }
        if (!selector) {
            return this.errorResult(operationId, exports.BROWSER_ERROR_CODES.INVALID_PARAMS, 'selector is required for waitForSelector', false);
        }
        if (!this._pages.has(pageId)) {
            return this.errorResult(operationId, exports.BROWSER_ERROR_CODES.NOT_FOUND, `Page ${pageId} not found`, false);
        }
        const result = {
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
    async handleGetElement(operation, operationId) {
        const { pageId, selector } = operation.params;
        if (!pageId) {
            return this.errorResult(operationId, exports.BROWSER_ERROR_CODES.INVALID_PARAMS, 'pageId is required for getElement', false);
        }
        if (!selector) {
            return this.errorResult(operationId, exports.BROWSER_ERROR_CODES.INVALID_PARAMS, 'selector is required for getElement', false);
        }
        if (!this._pages.has(pageId)) {
            return this.errorResult(operationId, exports.BROWSER_ERROR_CODES.NOT_FOUND, `Page ${pageId} not found`, false);
        }
        const element = {
            selector,
            tagName: 'div',
            text: '',
            visible: true,
            attributes: {},
        };
        const result = {
            success: true,
            data: element,
            retryable: false,
            operationId,
        };
        this._completedOperations.set(operationId, result);
        return result;
    }
    async handleGetPageContent(operation, operationId) {
        const { pageId } = operation.params;
        if (!pageId) {
            return this.errorResult(operationId, exports.BROWSER_ERROR_CODES.INVALID_PARAMS, 'pageId is required for getPageContent', false);
        }
        const page = this._pages.get(pageId);
        if (!page) {
            return this.errorResult(operationId, exports.BROWSER_ERROR_CODES.NOT_FOUND, `Page ${pageId} not found`, false);
        }
        const result = {
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
    async handleLogin(operation, operationId) {
        const { pageId, site, usernameSelector, passwordSelector, submitSelector, credentialKey } = operation.params;
        if (!pageId) {
            return this.errorResult(operationId, exports.BROWSER_ERROR_CODES.INVALID_PARAMS, 'pageId is required for login', false);
        }
        if (!site) {
            return this.errorResult(operationId, exports.BROWSER_ERROR_CODES.INVALID_PARAMS, 'site is required for login', false);
        }
        if (!this._pages.has(pageId)) {
            return this.errorResult(operationId, exports.BROWSER_ERROR_CODES.NOT_FOUND, `Page ${pageId} not found`, false);
        }
        // Retrieve credentials from Credential Manager
        const key = credentialKey ?? 'credentials';
        const _credential = await this.credentialManager.getCredential(`browser-${site}`, key);
        if (!_credential) {
            return this.errorResult(operationId, exports.BROWSER_ERROR_CODES.UNAUTHORIZED, `Failed to retrieve credentials for site: ${site}`, false);
        }
        const result = {
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
    async handleClosePage(operation, operationId) {
        const { pageId } = operation.params;
        if (!pageId) {
            return this.errorResult(operationId, exports.BROWSER_ERROR_CODES.INVALID_PARAMS, 'pageId is required for closePage', false);
        }
        const page = this._pages.get(pageId);
        if (!page) {
            return this.errorResult(operationId, exports.BROWSER_ERROR_CODES.NOT_FOUND, `Page ${pageId} not found`, false);
        }
        this._pages.delete(pageId);
        const result = {
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
    createOpId() {
        return `browser-op-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    }
    errorResult(operationId, code, message, retryable, details) {
        return {
            success: false,
            error: { code, message, retryable, details },
            retryable,
            operationId,
        };
    }
}
exports.BrowserDriver = BrowserDriver;
//# sourceMappingURL=browser-driver.js.map