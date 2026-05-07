import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

/**
 * Props accepted by {@link ApiStack}.
 */
export interface ApiStackProps extends cdk.StackProps {
  /** Optional custom domain name for the API. */
  customDomainName?: string;
  /** Deployment stage — 'dev' uses DESTROY removal policies for easy teardown. */
  stage?: string;
}

/**
 * API and authentication stack for SeraphimOS.
 *
 * Provisions:
 * - Cognito User Pool with email sign-in and password policies
 * - Cognito User Pool Client for application access
 * - REST API Gateway with Cognito authorizer
 * - WebSocket API Gateway for real-time dashboard updates
 * - Access logging for both APIs
 *
 * Requirements: 6.1 (IPC messaging entry), 15.1 (IaC provisioning), 20.2 (short-lived token auth)
 */
export class ApiStack extends cdk.Stack {
  /** Cognito User Pool for SeraphimOS authentication. */
  public readonly userPool: cognito.UserPool;

  /** Cognito User Pool Client for application access. */
  public readonly userPoolClient: cognito.UserPoolClient;

  /** REST API Gateway for synchronous operations. */
  public readonly restApi: apigateway.RestApi;

  /** Cognito authorizer attached to the REST API. */
  public readonly cognitoAuthorizer: apigateway.CognitoUserPoolsAuthorizer;

  /** WebSocket API Gateway for real-time updates. */
  public readonly webSocketApi: apigatewayv2.CfnApi;

  /** WebSocket API stage. */
  public readonly webSocketStage: apigatewayv2.CfnStage;

  constructor(scope: Construct, id: string, props?: ApiStackProps) {
    super(scope, id, props);

    // ── Cognito User Pool ─────────────────────────────────────────────
    this.userPool = new cognito.UserPool(this, 'SeraphimUserPool', {
      userPoolName: 'seraphim-users',
      selfSignUpEnabled: false,
      signInAliases: {
        email: true,
        username: true,
      },
      autoVerify: {
        email: true,
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
        fullname: {
          required: false,
          mutable: true,
        },
      },
      customAttributes: {
        tenantId: new cognito.StringAttribute({ mutable: false }),
        role: new cognito.StringAttribute({ mutable: true }),
      },
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
        tempPasswordValidity: cdk.Duration.days(7),
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: props?.stage === 'dev' ? cdk.RemovalPolicy.DESTROY : cdk.RemovalPolicy.RETAIN,
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: {
        sms: false,
        otp: true,
      },
    });

    // ── Cognito User Pool Client ──────────────────────────────────────
    this.userPoolClient = this.userPool.addClient('SeraphimAppClient', {
      userPoolClientName: 'seraphim-app',
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      generateSecret: false,
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
      preventUserExistenceErrors: true,
    });

    // ── REST API Gateway ──────────────────────────────────────────────
    const restApiLogGroup = new logs.LogGroup(this, 'RestApiAccessLogs', {
      logGroupName: '/seraphim/api-gateway/rest',
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.restApi = new apigateway.RestApi(this, 'SeraphimRestApi', {
      restApiName: 'seraphim-api',
      description: 'SeraphimOS REST API — agent management, commands, and queries',
      deployOptions: {
        stageName: 'v1',
        throttlingBurstLimit: 100,
        throttlingRateLimit: 50,
        accessLogDestination: new apigateway.LogGroupLogDestination(restApiLogGroup),
        accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields({
          caller: true,
          httpMethod: true,
          ip: true,
          protocol: true,
          requestTime: true,
          resourcePath: true,
          responseLength: true,
          status: true,
          user: true,
        }),
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        metricsEnabled: true,
        tracingEnabled: true,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          'Content-Type',
          'Authorization',
          'X-Amz-Date',
          'X-Api-Key',
          'X-Amz-Security-Token',
          'X-Correlation-Id',
        ],
        maxAge: cdk.Duration.hours(1),
      },
      endpointTypes: [apigateway.EndpointType.REGIONAL],
    });

    // ── Cognito Authorizer ────────────────────────────────────────────
    this.cognitoAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(
      this,
      'SeraphimCognitoAuthorizer',
      {
        cognitoUserPools: [this.userPool],
        authorizerName: 'seraphim-cognito-authorizer',
        identitySource: 'method.request.header.Authorization',
      },
    );

    // Attach authorizer to the REST API
    this.cognitoAuthorizer._attachToApi(this.restApi);

    // ── Placeholder resource to demonstrate authorizer usage ──────────
    const healthResource = this.restApi.root.addResource('health');
    healthResource.addMethod(
      'GET',
      new apigateway.MockIntegration({
        integrationResponses: [
          {
            statusCode: '200',
            responseTemplates: {
              'application/json': JSON.stringify({ status: 'healthy' }),
            },
          },
        ],
        requestTemplates: {
          'application/json': '{"statusCode": 200}',
        },
      }),
      {
        methodResponses: [{ statusCode: '200' }],
      },
    );

    // Protected resource requiring Cognito auth
    const agentsResource = this.restApi.root.addResource('agents');
    agentsResource.addMethod(
      'GET',
      new apigateway.MockIntegration({
        integrationResponses: [
          {
            statusCode: '200',
            responseTemplates: {
              'application/json': JSON.stringify({ agents: [] }),
            },
          },
        ],
        requestTemplates: {
          'application/json': '{"statusCode": 200}',
        },
      }),
      {
        authorizer: this.cognitoAuthorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
        methodResponses: [{ statusCode: '200' }],
      },
    );

    // ── WebSocket API Gateway ─────────────────────────────────────────
    this.webSocketApi = new apigatewayv2.CfnApi(this, 'SeraphimWebSocketApi', {
      name: 'seraphim-websocket',
      protocolType: 'WEBSOCKET',
      routeSelectionExpression: '$request.body.action',
      description: 'SeraphimOS WebSocket API for real-time dashboard updates',
    });

    this.webSocketStage = new apigatewayv2.CfnStage(this, 'WebSocketStage', {
      apiId: this.webSocketApi.ref,
      stageName: 'v1',
      autoDeploy: true,
      defaultRouteSettings: {
        throttlingBurstLimit: 50,
        throttlingRateLimit: 25,
      },
    });

    // ── Outputs ───────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description: 'Cognito User Pool ID',
      exportName: 'SeraphimUserPoolId',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
      exportName: 'SeraphimUserPoolClientId',
    });

    new cdk.CfnOutput(this, 'RestApiUrl', {
      value: this.restApi.url,
      description: 'REST API Gateway URL',
      exportName: 'SeraphimRestApiUrl',
    });

    new cdk.CfnOutput(this, 'RestApiId', {
      value: this.restApi.restApiId,
      description: 'REST API Gateway ID',
      exportName: 'SeraphimRestApiId',
    });

    new cdk.CfnOutput(this, 'WebSocketApiId', {
      value: this.webSocketApi.ref,
      description: 'WebSocket API Gateway ID',
      exportName: 'SeraphimWebSocketApiId',
    });

    new cdk.CfnOutput(this, 'WebSocketApiEndpoint', {
      value: `wss://${this.webSocketApi.ref}.execute-api.${this.region}.amazonaws.com/v1`,
      description: 'WebSocket API endpoint URL',
      exportName: 'SeraphimWebSocketApiEndpoint',
    });
  }
}
