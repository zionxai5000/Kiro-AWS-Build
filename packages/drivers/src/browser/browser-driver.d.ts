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
import type { DriverOperation, DriverResult, VerificationResult } from '@seraphim/core/types/driver.js';
import type { CredentialManager } from '@seraphim/core/interfaces/credential-manager.js';
export declare const BROWSER_ERROR_CODES: {
    readonly UNAUTHORIZED: "BROWSER_UNAUTHORIZED";
    readonly NOT_FOUND: "BROWSER_NOT_FOUND";
    readonly INVALID_PARAMS: "BROWSER_INVALID_PARAMS";
    readonly NAVIGATION_FAILED: "BROWSER_NAVIGATION_FAILED";
    readonly ELEMENT_NOT_FOUND: "BROWSER_ELEMENT_NOT_FOUND";
    readonly TIMEOUT: "BROWSER_TIMEOUT";
    readonly SCREENSHOT_FAILED: "BROWSER_SCREENSHOT_FAILED";
    readonly SCRIPT_ERROR: "BROWSER_SCRIPT_ERROR";
    readonly PAGE_CRASH: "BROWSER_PAGE_CRASH";
    readonly BROWSER_DISCONNECTED: "BROWSER_DISCONNECTED";
    readonly UNSUPPORTED_OPERATION: "BROWSER_UNSUPPORTED_OPERATION";
};
export type BrowserType = 'chromium' | 'firefox' | 'webkit';
export type BrowserPageStatus = 'loading' | 'ready' | 'error' | 'closed';
export interface BrowserPage {
    id: string;
    url: string;
    title: string;
    status: BrowserPageStatus;
    viewport: {
        width: number;
        height: number;
    };
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
export declare class BrowserDriver extends BaseDriver<BrowserDriverConfig> {
    private readonly credentialManager;
    readonly name = "browser";
    readonly version = "1.0.0";
    private _driverConfig;
    private readonly _completedOperations;
    private readonly _pages;
    constructor(credentialManager: CredentialManager);
    protected doConnect(config: BrowserDriverConfig): Promise<void>;
    protected doDisconnect(): Promise<void>;
    protected doExecute(operation: DriverOperation): Promise<DriverResult>;
    protected doVerify(operationId: string): Promise<VerificationResult>;
    private handleNavigate;
    private handleClick;
    private handleType;
    private handleScreenshot;
    private handleEvaluate;
    private handleWaitForSelector;
    private handleGetElement;
    private handleGetPageContent;
    /**
     * Login to a website using credentials from Credential Manager.
     * Retrieves site-specific credentials securely.
     */
    private handleLogin;
    private handleClosePage;
    private createOpId;
    private errorResult;
}
//# sourceMappingURL=browser-driver.d.ts.map