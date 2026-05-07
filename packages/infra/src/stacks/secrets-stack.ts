import * as cdk from 'aws-cdk-lib';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

/**
 * Describes a single external-service credential stored in Secrets Manager.
 */
interface ServiceCredentialConfig {
  /** Human-readable name used as the secret's logical ID suffix. */
  name: string;
  /** Description stored on the Secrets Manager secret. */
  description: string;
}

/**
 * All external service credentials that SeraphimOS requires.
 *
 * Each entry creates a Secrets Manager secret with a placeholder JSON value.
 * Real credentials are injected out-of-band (console / CLI) after deployment.
 */
const SERVICE_CREDENTIALS: ServiceCredentialConfig[] = [
  // App stores
  { name: 'AppStoreConnect', description: 'Apple App Store Connect API credentials' },
  { name: 'GooglePlay', description: 'Google Play Console service account credentials' },

  // Media & content
  { name: 'YouTube', description: 'YouTube Data API / OAuth credentials' },
  { name: 'HeyGen', description: 'HeyGen video generation API key' },
  { name: 'Rumble', description: 'Rumble upload / API credentials' },

  // Trading / prediction markets
  { name: 'Kalshi', description: 'Kalshi trading API credentials' },
  { name: 'Polymarket', description: 'Polymarket API credentials' },

  // Communication
  { name: 'Gmail', description: 'Gmail API OAuth credentials' },
  { name: 'Telegram', description: 'Telegram Bot API token' },
  { name: 'WhatsApp', description: 'WhatsApp Business API credentials' },
  { name: 'Discord', description: 'Discord Bot token and application credentials' },

  // Social media
  { name: 'Reddit', description: 'Reddit API OAuth credentials' },
  { name: 'X', description: 'X (Twitter) API credentials' },
  { name: 'Instagram', description: 'Instagram Graph API credentials' },
  { name: 'Facebook', description: 'Facebook / Meta API credentials' },
  { name: 'TikTok', description: 'TikTok API credentials' },

  // Developer tools
  { name: 'GitHub', description: 'GitHub API personal access token / app credentials' },
  { name: 'N8n', description: 'n8n webhook and API credentials' },

  // Revenue & payments
  { name: 'RevenueCat', description: 'RevenueCat API key' },
  { name: 'Stripe', description: 'Stripe API secret key and webhook signing secret' },
  { name: 'GoogleAds', description: 'Google Ads API credentials' },
  { name: 'Zeely', description: 'Zeely marketing platform API credentials' },

  // LLM providers
  { name: 'Anthropic', description: 'Anthropic (Claude) API key' },
  { name: 'OpenAI', description: 'OpenAI API key' },
];

/**
 * Secrets stack for SeraphimOS.
 *
 * Creates AWS Secrets Manager entries for every external service credential
 * the platform needs. Secrets are encrypted with a dedicated KMS key and
 * populated with placeholder JSON — real values are injected after deployment.
 *
 * Requirements: 20.1 (credentials in Secrets Manager, not in code)
 */
export class SecretsStack extends cdk.Stack {
  /** KMS key used to encrypt all secrets. */
  public readonly secretsEncryptionKey: kms.Key;

  /** Map of service name → Secrets Manager Secret for programmatic access. */
  public readonly secrets: Map<string, secretsmanager.Secret>;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ── KMS Key for Secrets ───────────────────────────────────────────
    this.secretsEncryptionKey = new kms.Key(this, 'SecretsEncryptionKey', {
      alias: 'seraphim/secrets',
      description: 'KMS key for SeraphimOS Secrets Manager encryption',
      enableKeyRotation: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ── Create a Secret for each external service ─────────────────────
    this.secrets = new Map();

    for (const svc of SERVICE_CREDENTIALS) {
      const secret = new secretsmanager.Secret(this, `${svc.name}Secret`, {
        secretName: `seraphim/${svc.name.toLowerCase()}`,
        description: svc.description,
        encryptionKey: this.secretsEncryptionKey,
        generateSecretString: {
          secretStringTemplate: JSON.stringify({
            apiKey: 'PLACEHOLDER',
            note: 'Replace with real credentials after deployment',
          }),
          generateStringKey: 'rotationToken',
        },
        removalPolicy: cdk.RemovalPolicy.RETAIN,
      });

      this.secrets.set(svc.name, secret);
    }

    // ── Outputs ───────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'SecretsKeyArn', {
      value: this.secretsEncryptionKey.keyArn,
      description: 'KMS key ARN used for secrets encryption',
      exportName: 'SeraphimSecretsKeyArn',
    });

    new cdk.CfnOutput(this, 'SecretCount', {
      value: String(SERVICE_CREDENTIALS.length),
      description: 'Number of external service secrets provisioned',
    });
  }
}
