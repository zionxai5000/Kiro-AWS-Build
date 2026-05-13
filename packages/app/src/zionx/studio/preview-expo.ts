/**
 * ZionX App Development Studio — Expo Preview Service (Maturity Level 2)
 *
 * Implements QR code generation for Expo Go or custom dev client connections,
 * enabling real-device preview of apps under development. Tracks device connections
 * and provides disconnect capabilities for session cleanup.
 *
 * Requirements: 42j.32
 */

// ---------------------------------------------------------------------------
// Device Info
// ---------------------------------------------------------------------------

export interface DeviceInfo {
  platform: string;
  model: string;
}

// ---------------------------------------------------------------------------
// QR Code Result
// ---------------------------------------------------------------------------

export interface QRCodeResult {
  qrCodeDataUrl: string;
  expoUrl: string;
}

// ---------------------------------------------------------------------------
// Connection Status
// ---------------------------------------------------------------------------

export interface ConnectionStatus {
  connected: boolean;
  deviceInfo?: DeviceInfo;
}

// ---------------------------------------------------------------------------
// Expo Preview Service Interface
// ---------------------------------------------------------------------------

export interface ExpoPreviewService {
  generateQRCode(sessionId: string): Promise<QRCodeResult>;
  getConnectionStatus(sessionId: string): Promise<ConnectionStatus>;
  disconnect(sessionId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// QR Code Generator Interface (injected dependency)
// ---------------------------------------------------------------------------

export interface QRCodeGenerator {
  toDataUrl(content: string): Promise<string>;
}

// ---------------------------------------------------------------------------
// Expo Dev Server Interface (injected dependency)
// ---------------------------------------------------------------------------

export interface ExpoDevServer {
  getExpoUrl(sessionId: string): Promise<string>;
  isDeviceConnected(sessionId: string): Promise<boolean>;
  getConnectedDeviceInfo(sessionId: string): Promise<DeviceInfo | null>;
  disconnectDevice(sessionId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface ExpoPreviewConfig {
  /** Base URL for the Expo dev server (e.g., exp://192.168.1.100:19000) */
  expoBaseUrl: string;
  /** Whether to use a custom dev client instead of Expo Go */
  useCustomDevClient: boolean;
  /** Custom dev client scheme (e.g., myapp://) */
  customScheme?: string;
}

const DEFAULT_CONFIG: ExpoPreviewConfig = {
  expoBaseUrl: 'exp://localhost:19000',
  useCustomDevClient: false,
};

// ---------------------------------------------------------------------------
// Default Implementation
// ---------------------------------------------------------------------------

/**
 * In-memory implementation of ExpoPreviewService.
 *
 * Delegates QR code generation and device connection tracking to injected
 * dependencies. The QR code encodes the Expo URL so that scanning it with
 * Expo Go (or a custom dev client) connects the device to the preview session.
 */
export class DefaultExpoPreviewService implements ExpoPreviewService {
  private readonly qrGenerator: QRCodeGenerator;
  private readonly devServer: ExpoDevServer;
  private readonly config: ExpoPreviewConfig;

  constructor(
    qrGenerator: QRCodeGenerator,
    devServer: ExpoDevServer,
    config: Partial<ExpoPreviewConfig> = {},
  ) {
    this.qrGenerator = qrGenerator;
    this.devServer = devServer;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate a QR code that encodes the Expo URL for the given session.
   * Scanning this QR code with Expo Go or a custom dev client connects
   * the device to the live preview.
   */
  async generateQRCode(sessionId: string): Promise<QRCodeResult> {
    const expoUrl = await this.buildExpoUrl(sessionId);
    const qrCodeDataUrl = await this.qrGenerator.toDataUrl(expoUrl);

    return { qrCodeDataUrl, expoUrl };
  }

  /**
   * Check whether a real device is currently connected to the preview session.
   * Returns device platform and model information when connected.
   */
  async getConnectionStatus(sessionId: string): Promise<ConnectionStatus> {
    const connected = await this.devServer.isDeviceConnected(sessionId);

    if (!connected) {
      return { connected: false };
    }

    const deviceInfo = await this.devServer.getConnectedDeviceInfo(sessionId);
    return {
      connected: true,
      deviceInfo: deviceInfo ?? undefined,
    };
  }

  /**
   * Disconnect the device from the preview session and clean up resources.
   */
  async disconnect(sessionId: string): Promise<void> {
    await this.devServer.disconnectDevice(sessionId);
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  private async buildExpoUrl(sessionId: string): Promise<string> {
    if (this.config.useCustomDevClient && this.config.customScheme) {
      // Custom dev client uses a custom URL scheme
      const baseUrl = await this.devServer.getExpoUrl(sessionId);
      return `${this.config.customScheme}${baseUrl.replace(/^exp:\/\//, '')}`;
    }

    return this.devServer.getExpoUrl(sessionId);
  }
}
