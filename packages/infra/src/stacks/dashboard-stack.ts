/**
 * CDK Stack — Dashboard Hosting
 *
 * S3 bucket for static assets, CloudFront distribution with HTTPS,
 * origin access control, and API Gateway as a secondary origin for `/api/*` routes.
 *
 * Requirements: 15.1
 */

import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';

/**
 * Props accepted by {@link DashboardStack}.
 */
export interface DashboardStackProps extends cdk.StackProps {
  /**
   * Optional REST API Gateway to use as a secondary CloudFront origin for `/api/*` routes.
   * Pass the RestApi construct directly to avoid token-parsing issues at synth time.
   */
  restApi?: apigateway.RestApi;
  /** Deployment stage — 'dev' uses DESTROY removal policies for easy teardown. */
  stage?: string;
}

/**
 * Dashboard hosting stack for SeraphimOS.
 *
 * Provisions:
 * - S3 bucket for static assets (encrypted, versioned, block public access)
 * - CloudFront distribution with HTTPS and origin access control
 * - SPA fallback (404 → /index.html)
 * - Optional API Gateway secondary origin for `/api/*` routes
 *
 * Requirements: 15.1
 */
export class DashboardStack extends cdk.Stack {
  /** S3 bucket hosting the dashboard static assets. */
  public readonly dashboardBucket: s3.Bucket;

  /** CloudFront distribution serving the dashboard. */
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props?: DashboardStackProps) {
    super(scope, id, props);

    // ── S3 Bucket for Dashboard Static Assets ─────────────────────────
    this.dashboardBucket = new s3.Bucket(this, 'DashboardBucket', {
      bucketName: `seraphim-dashboard-${this.account}-${this.region}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: props?.stage === 'dev' ? cdk.RemovalPolicy.DESTROY : cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: props?.stage === 'dev',
      versioned: true,
    });

    // ── Additional Behaviors (API Gateway origin) ─────────────────────
    const additionalBehaviors: Record<string, cloudfront.BehaviorOptions> = {};

    if (props?.restApi) {
      // Construct the API Gateway domain from the REST API ID and region.
      // Format: {api-id}.execute-api.{region}.amazonaws.com
      const apiDomain = `${props.restApi.restApiId}.execute-api.${this.region}.amazonaws.com`;
      const stageName = props.restApi.deploymentStage.stageName;

      const apiOrigin = new origins.HttpOrigin(apiDomain, {
        originPath: `/${stageName}`,
        protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
      });

      additionalBehaviors['/api/*'] = {
        origin: apiOrigin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      };
    }

    // ── CloudFront Distribution ───────────────────────────────────────
    this.distribution = new cloudfront.Distribution(this, 'DashboardDistribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.dashboardBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      additionalBehaviors,
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0),
        },
      ],
    });

    // ── Outputs ───────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'DashboardUrl', {
      value: `https://${this.distribution.distributionDomainName}`,
      description: 'Dashboard URL',
    });

    new cdk.CfnOutput(this, 'DashboardBucketName', {
      value: this.dashboardBucket.bucketName,
      description: 'Dashboard S3 bucket name',
    });
  }
}
