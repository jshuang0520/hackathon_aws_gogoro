"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServerlessLlmAssistantStack = void 0;
const cdk = require("aws-cdk-lib");
// import * as sqs from 'aws-cdk-lib/aws-sqs';
const dynamodb = require("aws-cdk-lib/aws-dynamodb");
const iam = require("aws-cdk-lib/aws-iam");
const lambda = require("aws-cdk-lib/aws-lambda");
const path = require("path");
const ssm = require("aws-cdk-lib/aws-ssm");
const s3 = require("aws-cdk-lib/aws-s3");
const cognito = require("aws-cdk-lib/aws-cognito");
const apigateway = require("aws-cdk-lib/aws-apigateway");
const AGENT_DB_NAME = "AgentSQLDBandVectorStore";
class ServerlessLlmAssistantStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        // -----------------------------------------------------------------------
        // VPC Construct
        // Create subnets and VPC endpoints
        // const vpc = new Vpc(this, "Vpc");
        // -----------------------------------------------------------------------
        // Create relevant SSM parameters
        const parameters = this.node.tryGetContext("parameters") || {
            "bedrock_region": "us-west-2",
            "llm_model_id": "anthropic.claude-v2"
        };
        const BEDROCK_REGION = parameters["bedrock_region"];
        const LLM_MODEL_ID = parameters["llm_model_id"];
        // Note: the SSM parameters for Bedrock region and endpoint are used
        // to setup a boto3 bedrock client for programmatic access to Bedrock APIs.
        // Add an SSM parameter for the Bedrock region.
        const ssm_bedrock_region_parameter = new ssm.StringParameter(this, "ssmBedrockRegionParameter", {
            parameterName: "/AgenticLLMAssistantWorkshop/bedrock_region",
            // This is the default region.
            // The user can update it in parameter store.
            stringValue: BEDROCK_REGION,
        });
        // Add an SSM parameter for the llm model id.
        const ssm_llm_model_id_parameter = new ssm.StringParameter(this, "ssmLLMModelIDParameter", {
            parameterName: "/AgenticLLMAssistantWorkshop/llm_model_id",
            // This is the default region.
            // The user can update it in parameter store.
            stringValue: LLM_MODEL_ID,
        });
        // Placeholder for Lab 4, step 2.2 - Put the database resource definition here.
        // Placeholder Lab 4. Step 4.1 - configure sagemaker access to the database.
        // -----------------------------------------------------------------------
        // Add a DynamoDB table to store chat history per session id.
        // When you see a need for it, consider configuring autoscaling to the table
        // https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_dynamodb-readme.html#configure-autoscaling-for-your-table
        const ChatMessageHistoryTable = new dynamodb.Table(this, "ChatHistoryTable", {
            // consider activating the encryption by uncommenting the code below.
            // encryption: dynamodb.TableEncryption.AWS_MANAGED,
            partitionKey: {
                name: "SessionId",
                type: dynamodb.AttributeType.STRING,
            },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            // Considerations when choosing a table class
            // https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/WorkingWithTables.tableclasses.html
            tableClass: dynamodb.TableClass.STANDARD,
            // When moving to production, use cdk.RemovalPolicy.RETAIN instead
            // which will keep the database table when destroying the stack.
            // this avoids accidental deletion of user data.
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            encryption: dynamodb.TableEncryption.AWS_MANAGED
        });
        // -----------------------------------------------------------------------
        // Add AWS Lambda container and function to serve as the agent executor.
        const agent_executor_lambda = new lambda.DockerImageFunction(this, "LambdaAgentContainer", {
            code: lambda.DockerImageCode.fromImageAsset(path.join(__dirname, "lambda-functions/agent-executor-lambda-container"), {
                buildArgs: { "--platform": "linux/amd64" }
            }),
            description: "Lambda function with bedrock access created via CDK",
            timeout: cdk.Duration.minutes(5),
            memorySize: 2048,
            // vpc: vpc.vpc,
            environment: {
                BEDROCK_REGION_PARAMETER: ssm_bedrock_region_parameter.parameterName,
                LLM_MODEL_ID_PARAMETER: ssm_llm_model_id_parameter.parameterName,
                CHAT_MESSAGE_HISTORY_TABLE: ChatMessageHistoryTable.tableName,
                // AGENT_DB_SECRET_ID: AgentDB.secret?.secretArn as string
            },
        });
        // Placeholder Step 2.4 - grant Lambda permission to access db credentials
        // Allow Lambda to read SSM parameters.
        ssm_bedrock_region_parameter.grantRead(agent_executor_lambda);
        ssm_llm_model_id_parameter.grantRead(agent_executor_lambda);
        // Allow Lambda read/write access to the chat history DynamoDB table
        // to be able to read and update it as conversations progress.
        ChatMessageHistoryTable.grantReadWriteData(agent_executor_lambda);
        // Allow the Lambda function to use Bedrock
        agent_executor_lambda.role?.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonBedrockFullAccess'));
        // Save the Lambda ARN in an SSM parameter to simplify invoking the lambda
        // from a SageMaker notebook, without having to copy it manually.
        const agentLambdaNameParameter = new ssm.StringParameter(this, "AgentLambdaNameParameter", {
            parameterName: "/AgenticLLMAssistantWorkshop/AgentExecutorLambdaNameParameter",
            stringValue: agent_executor_lambda.functionName,
        });
        //------------------------------------------------------------------------
        // Create an S3 bucket for intermediate data staging
        // and allow SageMaker to read and write to it.
        const agent_data_bucket = new s3.Bucket(this, "AgentDataBucket", {
            // Warning, swith DESTROY to RETAIN to avoid accidental deletion
            // of important data.
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
        });
        // Save the bucket name as an SSM parameter to simplify using it in
        // SageMaker processing jobs without having to copy the name manually.
        const agentDataBucketParameter = new ssm.StringParameter(this, "AgentDataBucketParameter", {
            parameterName: "/AgenticLLMAssistantWorkshop/AgentDataBucketParameter",
            stringValue: agent_data_bucket.bucketName,
        });
        // -----------------------------------------------------------------------
        // Create a managed IAM policy to be attached to a SageMaker execution role
        // to allow the required permissions to retrieve the information to access the database.
        const SageMakerPostgresDBAccessIAMPolicy = new iam.ManagedPolicy(this, "sageMakerPostgresDBAccessIAMPolicy", {
            statements: [
                new iam.PolicyStatement({
                    actions: ["ssm:GetParameter"],
                    resources: [
                        ssm_bedrock_region_parameter.parameterArn,
                        ssm_llm_model_id_parameter.parameterArn,
                        agentLambdaNameParameter.parameterArn,
                        agentDataBucketParameter.parameterArn,
                    ],
                }),
                new iam.PolicyStatement({
                    // add permission to read and write to the data bucket
                    actions: [
                        "s3:GetObject",
                        "s3:PutObject",
                        "s3:DeleteObject",
                        "s3:ListBucket",
                    ],
                    resources: [
                        // Add permission to get only the data bucket
                        agent_data_bucket.bucketArn,
                        agent_data_bucket.arnForObjects("*"),
                    ],
                }),
                new iam.PolicyStatement({
                    // add permission to invoke the agent executor lambda function.
                    actions: ["lambda:InvokeFunction"],
                    resources: [
                        agent_executor_lambda.functionArn,
                    ]
                }),
            ],
        });
        // -----------------------------------------------------------------------
        // Create a new Cognito user pool
        // documentation: https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_cognito.UserPool.html
        const cognito_user_pool = new cognito.UserPool(this, "CognitoPool", {
            autoVerify: { email: true },
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            selfSignUpEnabled: true,
            signInCaseSensitive: false,
            signInAliases: {
                email: true,
                username: true
            },
            standardAttributes: {
                email: {
                    required: true,
                    mutable: false
                }
            }
        });
        // Add an app client to the user pool
        const pool_client = cognito_user_pool.addClient("NextJsAppClient", {
            oAuth: {
                flows: {
                    authorizationCodeGrant: true,
                },
                scopes: [cognito.OAuthScope.OPENID],
                callbackUrls: ["https://localhost:3000/"],
                logoutUrls: ["https://localhost:3000/"],
            },
        });
        // -------------------------------------------------------------------------
        // Add an Amazon API Gateway with AWS cognito auth and an AWS lambda as a backend
        const agent_api = new apigateway.RestApi(this, "AssistantApi", {
            restApiName: "assistant-api",
            description: "An API to invoke an LLM based agent which orchestrates using tools to answer user input questions.",
            defaultCorsPreflightOptions: {
                allowOrigins: apigateway.Cors.ALL_ORIGINS, // Change this to the specific origin of your app in production
                allowMethods: apigateway.Cors.ALL_METHODS,
                allowHeaders: ['Content-Type', 'Authorization']
            }
        });
        // https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_apigateway.CognitoUserPoolsAuthorizer.html
        const cognito_authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'ChatAuthorizer', {
            cognitoUserPools: [cognito_user_pool]
        });
        const agent_lambda_integration = new apigateway.LambdaIntegration(agent_executor_lambda, {
            proxy: false, // Set this to false to integrate with Lambda function directly
            integrationResponses: [{
                    statusCode: '200',
                    // Enable CORS for the Lambda Integration
                    responseParameters: {
                        'method.response.header.Access-Control-Allow-Headers': "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
                        'method.response.header.Access-Control-Allow-Origin': "'*'",
                        'method.response.header.Access-Control-Allow-Methods': "'POST,OPTIONS'",
                    },
                }]
        });
        agent_api.root.addMethod("POST", agent_lambda_integration, {
            // Enable CORS for the API
            methodResponses: [{
                    statusCode: '200',
                    responseParameters: {
                        'method.response.header.Access-Control-Allow-Headers': true,
                        'method.response.header.Access-Control-Allow-Origin': true,
                        'method.response.header.Access-Control-Allow-Methods': true,
                    },
                }],
            authorizer: cognito_authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO
        });
        // -----------------------------------------------------------------------
        // Add an SSM parameter to hold the cognito user pool id
        const cognito_user_pool_id_parameter = new ssm.StringParameter(this, "cognitoUserPoolParameter", {
            parameterName: "/AgenticLLMAssistantWorkshop/cognito_user_pool_id",
            stringValue: cognito_user_pool.userPoolId,
        });
        // Add an SSM parameter to hold the cognito user pool id
        const cognito_user_pool_client_id_parameter = new ssm.StringParameter(this, "cognitoUserPoolClientParameter", {
            parameterName: "/AgenticLLMAssistantWorkshop/cognito_user_pool_client_id",
            stringValue: pool_client.userPoolClientId,
        });
        // Add an SSM parameter to hold Rest API URL
        const agent_api_parameter = new ssm.StringParameter(this, "AgentAPIURLParameter", {
            parameterName: "/AgenticLLMAssistantWorkshop/agent_api",
            stringValue: agent_api.url
        });
        // -----------------------------------------------------------------------
        // stack outputs
        new cdk.CfnOutput(this, "sageMakerPostgresDBAccessIAMPolicyARN", {
            value: SageMakerPostgresDBAccessIAMPolicy.managedPolicyArn,
        });
        // Output the clientID
        new cdk.CfnOutput(this, "UserPoolClient", {
            value: pool_client.userPoolClientId,
        });
        new cdk.CfnOutput(this, "UserPoolId", {
            value: cognito_user_pool.userPoolId
        });
        new cdk.CfnOutput(this, "UserPoolProviderURL", {
            value: cognito_user_pool.userPoolProviderUrl
        });
        new cdk.CfnOutput(this, "EndpointURL", {
            value: agent_api.url
        });
    }
}
exports.ServerlessLlmAssistantStack = ServerlessLlmAssistantStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGxtX3N0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsibGxtX3N0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLG1DQUFtQztBQUVuQyw4Q0FBOEM7QUFDOUMscURBQXFEO0FBRXJELDJDQUEyQztBQUMzQyxpREFBaUQ7QUFDakQsNkJBQTZCO0FBRTdCLDJDQUEyQztBQUMzQyx5Q0FBeUM7QUFDekMsbURBQW1EO0FBQ25ELHlEQUF5RDtBQUl6RCxNQUFNLGFBQWEsR0FBRywwQkFBMEIsQ0FBQztBQUVqRCxNQUFhLDJCQUE0QixTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQ3hELFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBc0I7UUFDOUQsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsMEVBQTBFO1FBQzFFLGdCQUFnQjtRQUNoQixtQ0FBbUM7UUFDbkMsb0NBQW9DO1FBRXBDLDBFQUEwRTtRQUMxRSxpQ0FBaUM7UUFDakMsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsWUFBWSxDQUFDLElBQUk7WUFDMUQsZ0JBQWdCLEVBQUUsV0FBVztZQUM3QixjQUFjLEVBQUUscUJBQXFCO1NBQ3RDLENBQUM7UUFFRixNQUFNLGNBQWMsR0FBRyxVQUFVLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUNwRCxNQUFNLFlBQVksR0FBRyxVQUFVLENBQUMsY0FBYyxDQUFDLENBQUM7UUFFaEQsb0VBQW9FO1FBQ3BFLDJFQUEyRTtRQUUzRSwrQ0FBK0M7UUFDL0MsTUFBTSw0QkFBNEIsR0FBRyxJQUFJLEdBQUcsQ0FBQyxlQUFlLENBQzFELElBQUksRUFDSiwyQkFBMkIsRUFDM0I7WUFDRSxhQUFhLEVBQUUsNkNBQTZDO1lBQzVELDhCQUE4QjtZQUM5Qiw2Q0FBNkM7WUFDN0MsV0FBVyxFQUFFLGNBQWM7U0FDNUIsQ0FDRixDQUFDO1FBRUYsNkNBQTZDO1FBQzdDLE1BQU0sMEJBQTBCLEdBQUcsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUN4RCxJQUFJLEVBQ0osd0JBQXdCLEVBQ3hCO1lBQ0UsYUFBYSxFQUFFLDJDQUEyQztZQUMxRCw4QkFBOEI7WUFDOUIsNkNBQTZDO1lBQzdDLFdBQVcsRUFBRSxZQUFZO1NBQzFCLENBQ0YsQ0FBQztRQUVGLCtFQUErRTtRQUUvRSw0RUFBNEU7UUFFNUUsMEVBQTBFO1FBQzFFLDZEQUE2RDtRQUU3RCw0RUFBNEU7UUFDNUUsd0hBQXdIO1FBQ3hILE1BQU0sdUJBQXVCLEdBQUcsSUFBSSxRQUFRLENBQUMsS0FBSyxDQUNoRCxJQUFJLEVBQ0osa0JBQWtCLEVBQ2xCO1lBQ0UscUVBQXFFO1lBQ3JFLG9EQUFvRDtZQUNwRCxZQUFZLEVBQUU7Z0JBQ1osSUFBSSxFQUFFLFdBQVc7Z0JBQ2pCLElBQUksRUFBRSxRQUFRLENBQUMsYUFBYSxDQUFDLE1BQU07YUFDcEM7WUFDRCxXQUFXLEVBQUUsUUFBUSxDQUFDLFdBQVcsQ0FBQyxlQUFlO1lBQ2pELDZDQUE2QztZQUM3Qyx1R0FBdUc7WUFDdkcsVUFBVSxFQUFFLFFBQVEsQ0FBQyxVQUFVLENBQUMsUUFBUTtZQUN4QyxrRUFBa0U7WUFDbEUsZ0VBQWdFO1lBQ2hFLGdEQUFnRDtZQUNoRCxhQUFhLEVBQUUsR0FBRyxDQUFDLGFBQWEsQ0FBQyxPQUFPO1lBQ3hDLFVBQVUsRUFBRSxRQUFRLENBQUMsZUFBZSxDQUFDLFdBQVc7U0FDakQsQ0FDRixDQUFDO1FBRUYsMEVBQTBFO1FBQzFFLHdFQUF3RTtRQUN4RSxNQUFNLHFCQUFxQixHQUFHLElBQUksTUFBTSxDQUFDLG1CQUFtQixDQUMxRCxJQUFJLEVBQ0osc0JBQXNCLEVBQ3RCO1lBQ0UsSUFBSSxFQUFFLE1BQU0sQ0FBQyxlQUFlLENBQUMsY0FBYyxDQUN6QyxJQUFJLENBQUMsSUFBSSxDQUNQLFNBQVMsRUFDVCxrREFBa0QsQ0FDbkQsRUFDRDtnQkFDRSxTQUFTLEVBQUUsRUFBRSxZQUFZLEVBQUUsYUFBYSxFQUFFO2FBQzNDLENBQ0Y7WUFDRCxXQUFXLEVBQUUscURBQXFEO1lBQ2xFLE9BQU8sRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7WUFDaEMsVUFBVSxFQUFFLElBQUk7WUFDaEIsZ0JBQWdCO1lBQ2hCLFdBQVcsRUFBRTtnQkFDWCx3QkFBd0IsRUFBRSw0QkFBNEIsQ0FBQyxhQUFhO2dCQUNwRSxzQkFBc0IsRUFBRSwwQkFBMEIsQ0FBQyxhQUFhO2dCQUNoRSwwQkFBMEIsRUFBRSx1QkFBdUIsQ0FBQyxTQUFTO2dCQUM3RCwwREFBMEQ7YUFDM0Q7U0FDRixDQUNGLENBQUM7UUFFRiwwRUFBMEU7UUFFMUUsdUNBQXVDO1FBQ3ZDLDRCQUE0QixDQUFDLFNBQVMsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO1FBQzlELDBCQUEwQixDQUFDLFNBQVMsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO1FBRTVELG9FQUFvRTtRQUNwRSw4REFBOEQ7UUFDOUQsdUJBQXVCLENBQUMsa0JBQWtCLENBQUMscUJBQXFCLENBQUMsQ0FBQztRQUVsRSwyQ0FBMkM7UUFDM0MscUJBQXFCLENBQUMsSUFBSSxFQUFFLGdCQUFnQixDQUMxQyxHQUFHLENBQUMsYUFBYSxDQUFDLHdCQUF3QixDQUFDLHlCQUF5QixDQUFDLENBQ3RFLENBQUM7UUFFRiwwRUFBMEU7UUFDMUUsaUVBQWlFO1FBQ2pFLE1BQU0sd0JBQXdCLEdBQUcsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUN0RCxJQUFJLEVBQ0osMEJBQTBCLEVBQzFCO1lBQ0UsYUFBYSxFQUFFLCtEQUErRDtZQUM5RSxXQUFXLEVBQUUscUJBQXFCLENBQUMsWUFBWTtTQUNoRCxDQUNGLENBQUM7UUFFRiwwRUFBMEU7UUFDMUUsb0RBQW9EO1FBQ3BELCtDQUErQztRQUMvQyxNQUFNLGlCQUFpQixHQUFHLElBQUksRUFBRSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsaUJBQWlCLEVBQUU7WUFDL0QsZ0VBQWdFO1lBQ2hFLHFCQUFxQjtZQUNyQixhQUFhLEVBQUUsR0FBRyxDQUFDLGFBQWEsQ0FBQyxPQUFPO1lBQ3hDLGlCQUFpQixFQUFFLElBQUk7U0FDeEIsQ0FBQyxDQUFDO1FBRUgsbUVBQW1FO1FBQ25FLHNFQUFzRTtRQUN0RSxNQUFNLHdCQUF3QixHQUFHLElBQUksR0FBRyxDQUFDLGVBQWUsQ0FDdEQsSUFBSSxFQUNKLDBCQUEwQixFQUMxQjtZQUNFLGFBQWEsRUFBRSx1REFBdUQ7WUFDdEUsV0FBVyxFQUFFLGlCQUFpQixDQUFDLFVBQVU7U0FDMUMsQ0FDRixDQUFDO1FBRUYsMEVBQTBFO1FBQzFFLDJFQUEyRTtRQUMzRSx3RkFBd0Y7UUFDeEYsTUFBTSxrQ0FBa0MsR0FBRyxJQUFJLEdBQUcsQ0FBQyxhQUFhLENBQzlELElBQUksRUFDSixvQ0FBb0MsRUFDcEM7WUFDRSxVQUFVLEVBQUU7Z0JBQ1YsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDO29CQUN0QixPQUFPLEVBQUUsQ0FBQyxrQkFBa0IsQ0FBQztvQkFDN0IsU0FBUyxFQUFFO3dCQUNULDRCQUE0QixDQUFDLFlBQVk7d0JBQ3pDLDBCQUEwQixDQUFDLFlBQVk7d0JBQ3ZDLHdCQUF3QixDQUFDLFlBQVk7d0JBQ3JDLHdCQUF3QixDQUFDLFlBQVk7cUJBQ3RDO2lCQUNGLENBQUM7Z0JBQ0YsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDO29CQUN0QixzREFBc0Q7b0JBQ3RELE9BQU8sRUFBRTt3QkFDUCxjQUFjO3dCQUNkLGNBQWM7d0JBQ2QsaUJBQWlCO3dCQUNqQixlQUFlO3FCQUNoQjtvQkFDRCxTQUFTLEVBQUU7d0JBQ1QsNkNBQTZDO3dCQUM3QyxpQkFBaUIsQ0FBQyxTQUFTO3dCQUMzQixpQkFBaUIsQ0FBQyxhQUFhLENBQUMsR0FBRyxDQUFDO3FCQUNyQztpQkFDRixDQUFDO2dCQUNGLElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQztvQkFDdEIsK0RBQStEO29CQUMvRCxPQUFPLEVBQUUsQ0FBQyx1QkFBdUIsQ0FBQztvQkFDbEMsU0FBUyxFQUFFO3dCQUNULHFCQUFxQixDQUFDLFdBQVc7cUJBQ2xDO2lCQUNGLENBQUM7YUFDSDtTQUNGLENBQ0YsQ0FBQztRQUVGLDBFQUEwRTtRQUMxRSxpQ0FBaUM7UUFDakMsbUdBQW1HO1FBQ25HLE1BQU0saUJBQWlCLEdBQUcsSUFBSSxPQUFPLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxhQUFhLEVBQUU7WUFDbEUsVUFBVSxFQUFFLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRTtZQUMzQixhQUFhLEVBQUUsR0FBRyxDQUFDLGFBQWEsQ0FBQyxPQUFPO1lBQ3hDLGlCQUFpQixFQUFFLElBQUk7WUFDdkIsbUJBQW1CLEVBQUUsS0FBSztZQUMxQixhQUFhLEVBQUU7Z0JBQ2IsS0FBSyxFQUFFLElBQUk7Z0JBQ1gsUUFBUSxFQUFFLElBQUk7YUFDZjtZQUNELGtCQUFrQixFQUFFO2dCQUNsQixLQUFLLEVBQUU7b0JBQ0wsUUFBUSxFQUFFLElBQUk7b0JBQ2QsT0FBTyxFQUFFLEtBQUs7aUJBQ2Y7YUFDRjtTQUNGLENBQUMsQ0FBQztRQUVILHFDQUFxQztRQUNyQyxNQUFNLFdBQVcsR0FBRyxpQkFBaUIsQ0FBQyxTQUFTLENBQzdDLGlCQUFpQixFQUNqQjtZQUNFLEtBQUssRUFBRTtnQkFDTCxLQUFLLEVBQUU7b0JBQ0wsc0JBQXNCLEVBQUUsSUFBSTtpQkFDN0I7Z0JBQ0QsTUFBTSxFQUFFLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUM7Z0JBQ25DLFlBQVksRUFBRSxDQUFDLHlCQUF5QixDQUFDO2dCQUN6QyxVQUFVLEVBQUUsQ0FBQyx5QkFBeUIsQ0FBQzthQUN4QztTQUNGLENBQ0YsQ0FBQztRQUVGLDRFQUE0RTtRQUM1RSxpRkFBaUY7UUFFakYsTUFBTSxTQUFTLEdBQUcsSUFBSSxVQUFVLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxjQUFjLEVBQUU7WUFDN0QsV0FBVyxFQUFFLGVBQWU7WUFDNUIsV0FBVyxFQUNULG9HQUFvRztZQUN0RywyQkFBMkIsRUFBRTtnQkFDM0IsWUFBWSxFQUFFLFVBQVUsQ0FBQyxJQUFJLENBQUMsV0FBVyxFQUFFLCtEQUErRDtnQkFDMUcsWUFBWSxFQUFFLFVBQVUsQ0FBQyxJQUFJLENBQUMsV0FBVztnQkFDekMsWUFBWSxFQUFFLENBQUMsY0FBYyxFQUFFLGVBQWUsQ0FBQzthQUNoRDtTQUNGLENBQUMsQ0FBQztRQUVILHlHQUF5RztRQUN6RyxNQUFNLGtCQUFrQixHQUFHLElBQUksVUFBVSxDQUFDLDBCQUEwQixDQUFDLElBQUksRUFBRSxnQkFBZ0IsRUFBRTtZQUMzRixnQkFBZ0IsRUFBRSxDQUFDLGlCQUFpQixDQUFDO1NBQ3RDLENBQUMsQ0FBQztRQUVILE1BQU0sd0JBQXdCLEdBQUcsSUFBSSxVQUFVLENBQUMsaUJBQWlCLENBQUMscUJBQXFCLEVBQUU7WUFDdkYsS0FBSyxFQUFFLEtBQUssRUFBRSwrREFBK0Q7WUFDN0Usb0JBQW9CLEVBQUUsQ0FBQztvQkFDckIsVUFBVSxFQUFFLEtBQUs7b0JBQ2pCLHlDQUF5QztvQkFDekMsa0JBQWtCLEVBQUU7d0JBQ2xCLHFEQUFxRCxFQUFFLHdFQUF3RTt3QkFDL0gsb0RBQW9ELEVBQUUsS0FBSzt3QkFDM0QscURBQXFELEVBQUUsZ0JBQWdCO3FCQUN4RTtpQkFDRixDQUFDO1NBQ0gsQ0FBQyxDQUFDO1FBRUgsU0FBUyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQ3RCLE1BQU0sRUFDTix3QkFBd0IsRUFDeEI7WUFDRSwwQkFBMEI7WUFDMUIsZUFBZSxFQUFFLENBQUM7b0JBQ2hCLFVBQVUsRUFBRSxLQUFLO29CQUNqQixrQkFBa0IsRUFBRTt3QkFDbEIscURBQXFELEVBQUUsSUFBSTt3QkFDM0Qsb0RBQW9ELEVBQUUsSUFBSTt3QkFDMUQscURBQXFELEVBQUUsSUFBSTtxQkFDNUQ7aUJBQ0YsQ0FBQztZQUNGLFVBQVUsRUFBRSxrQkFBa0I7WUFDOUIsaUJBQWlCLEVBQUUsVUFBVSxDQUFDLGlCQUFpQixDQUFDLE9BQU87U0FDeEQsQ0FDRixDQUFDO1FBRUYsMEVBQTBFO1FBQzFFLHdEQUF3RDtRQUN4RCxNQUFNLDhCQUE4QixHQUFHLElBQUksR0FBRyxDQUFDLGVBQWUsQ0FDNUQsSUFBSSxFQUNKLDBCQUEwQixFQUMxQjtZQUNFLGFBQWEsRUFBRSxtREFBbUQ7WUFDbEUsV0FBVyxFQUFFLGlCQUFpQixDQUFDLFVBQVU7U0FDMUMsQ0FDRixDQUFDO1FBRUYsd0RBQXdEO1FBQ3hELE1BQU0scUNBQXFDLEdBQUcsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUNuRSxJQUFJLEVBQ0osZ0NBQWdDLEVBQ2hDO1lBQ0UsYUFBYSxFQUFFLDBEQUEwRDtZQUN6RSxXQUFXLEVBQUUsV0FBVyxDQUFDLGdCQUFnQjtTQUMxQyxDQUNGLENBQUM7UUFFRiw0Q0FBNEM7UUFDNUMsTUFBTSxtQkFBbUIsR0FBRyxJQUFJLEdBQUcsQ0FBQyxlQUFlLENBQ2pELElBQUksRUFDSixzQkFBc0IsRUFDdEI7WUFDRSxhQUFhLEVBQUUsd0NBQXdDO1lBQ3ZELFdBQVcsRUFBRSxTQUFTLENBQUMsR0FBRztTQUMzQixDQUNGLENBQUM7UUFFRiwwRUFBMEU7UUFDMUUsZ0JBQWdCO1FBRWhCLElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsdUNBQXVDLEVBQUU7WUFDL0QsS0FBSyxFQUFFLGtDQUFrQyxDQUFDLGdCQUFnQjtTQUMzRCxDQUFDLENBQUM7UUFFSCxzQkFBc0I7UUFDdEIsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxnQkFBZ0IsRUFBRTtZQUN4QyxLQUFLLEVBQUUsV0FBVyxDQUFDLGdCQUFnQjtTQUNwQyxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLFlBQVksRUFBRTtZQUNwQyxLQUFLLEVBQUUsaUJBQWlCLENBQUMsVUFBVTtTQUNwQyxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLHFCQUFxQixFQUFFO1lBQzdDLEtBQUssRUFBRSxpQkFBaUIsQ0FBQyxtQkFBbUI7U0FDN0MsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxhQUFhLEVBQUU7WUFDckMsS0FBSyxFQUFFLFNBQVMsQ0FBQyxHQUFHO1NBQ3JCLENBQUMsQ0FBQztJQUVMLENBQUM7Q0FDRjtBQS9VRCxrRUErVUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG4vLyBpbXBvcnQgKiBhcyBzcXMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXNxcyc7XG5pbXBvcnQgKiBhcyBkeW5hbW9kYiBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWR5bmFtb2RiXCI7XG5pbXBvcnQgKiBhcyBlYzIgZnJvbSBcImF3cy1jZGstbGliL2F3cy1lYzJcIjtcbmltcG9ydCAqIGFzIGlhbSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWlhbVwiO1xuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtbGFtYmRhXCI7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gXCJwYXRoXCI7XG5pbXBvcnQgKiBhcyByZHMgZnJvbSBcImF3cy1jZGstbGliL2F3cy1yZHNcIjtcbmltcG9ydCAqIGFzIHNzbSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLXNzbVwiO1xuaW1wb3J0ICogYXMgczMgZnJvbSBcImF3cy1jZGstbGliL2F3cy1zM1wiO1xuaW1wb3J0ICogYXMgY29nbml0byBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY29nbml0byc7XG5pbXBvcnQgKiBhcyBhcGlnYXRld2F5IGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtYXBpZ2F0ZXdheVwiO1xuXG5pbXBvcnQgeyBWcGMgfSBmcm9tIFwiLi92cGMtc3RhY2tcIjtcblxuY29uc3QgQUdFTlRfREJfTkFNRSA9IFwiQWdlbnRTUUxEQmFuZFZlY3RvclN0b3JlXCI7XG5cbmV4cG9ydCBjbGFzcyBTZXJ2ZXJsZXNzTGxtQXNzaXN0YW50U3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wcz86IGNkay5TdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIFZQQyBDb25zdHJ1Y3RcbiAgICAvLyBDcmVhdGUgc3VibmV0cyBhbmQgVlBDIGVuZHBvaW50c1xuICAgIC8vIGNvbnN0IHZwYyA9IG5ldyBWcGModGhpcywgXCJWcGNcIik7XG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIENyZWF0ZSByZWxldmFudCBTU00gcGFyYW1ldGVyc1xuICAgIGNvbnN0IHBhcmFtZXRlcnMgPSB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dChcInBhcmFtZXRlcnNcIikgfHwge1xuICAgICAgXCJiZWRyb2NrX3JlZ2lvblwiOiBcInVzLXdlc3QtMlwiLFxuICAgICAgXCJsbG1fbW9kZWxfaWRcIjogXCJhbnRocm9waWMuY2xhdWRlLXYyXCJcbiAgICB9O1xuXG4gICAgY29uc3QgQkVEUk9DS19SRUdJT04gPSBwYXJhbWV0ZXJzW1wiYmVkcm9ja19yZWdpb25cIl07XG4gICAgY29uc3QgTExNX01PREVMX0lEID0gcGFyYW1ldGVyc1tcImxsbV9tb2RlbF9pZFwiXTtcblxuICAgIC8vIE5vdGU6IHRoZSBTU00gcGFyYW1ldGVycyBmb3IgQmVkcm9jayByZWdpb24gYW5kIGVuZHBvaW50IGFyZSB1c2VkXG4gICAgLy8gdG8gc2V0dXAgYSBib3RvMyBiZWRyb2NrIGNsaWVudCBmb3IgcHJvZ3JhbW1hdGljIGFjY2VzcyB0byBCZWRyb2NrIEFQSXMuXG5cbiAgICAvLyBBZGQgYW4gU1NNIHBhcmFtZXRlciBmb3IgdGhlIEJlZHJvY2sgcmVnaW9uLlxuICAgIGNvbnN0IHNzbV9iZWRyb2NrX3JlZ2lvbl9wYXJhbWV0ZXIgPSBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcihcbiAgICAgIHRoaXMsXG4gICAgICBcInNzbUJlZHJvY2tSZWdpb25QYXJhbWV0ZXJcIixcbiAgICAgIHtcbiAgICAgICAgcGFyYW1ldGVyTmFtZTogXCIvQWdlbnRpY0xMTUFzc2lzdGFudFdvcmtzaG9wL2JlZHJvY2tfcmVnaW9uXCIsXG4gICAgICAgIC8vIFRoaXMgaXMgdGhlIGRlZmF1bHQgcmVnaW9uLlxuICAgICAgICAvLyBUaGUgdXNlciBjYW4gdXBkYXRlIGl0IGluIHBhcmFtZXRlciBzdG9yZS5cbiAgICAgICAgc3RyaW5nVmFsdWU6IEJFRFJPQ0tfUkVHSU9OLFxuICAgICAgfVxuICAgICk7XG5cbiAgICAvLyBBZGQgYW4gU1NNIHBhcmFtZXRlciBmb3IgdGhlIGxsbSBtb2RlbCBpZC5cbiAgICBjb25zdCBzc21fbGxtX21vZGVsX2lkX3BhcmFtZXRlciA9IG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKFxuICAgICAgdGhpcyxcbiAgICAgIFwic3NtTExNTW9kZWxJRFBhcmFtZXRlclwiLFxuICAgICAge1xuICAgICAgICBwYXJhbWV0ZXJOYW1lOiBcIi9BZ2VudGljTExNQXNzaXN0YW50V29ya3Nob3AvbGxtX21vZGVsX2lkXCIsXG4gICAgICAgIC8vIFRoaXMgaXMgdGhlIGRlZmF1bHQgcmVnaW9uLlxuICAgICAgICAvLyBUaGUgdXNlciBjYW4gdXBkYXRlIGl0IGluIHBhcmFtZXRlciBzdG9yZS5cbiAgICAgICAgc3RyaW5nVmFsdWU6IExMTV9NT0RFTF9JRCxcbiAgICAgIH1cbiAgICApO1xuXG4gICAgLy8gUGxhY2Vob2xkZXIgZm9yIExhYiA0LCBzdGVwIDIuMiAtIFB1dCB0aGUgZGF0YWJhc2UgcmVzb3VyY2UgZGVmaW5pdGlvbiBoZXJlLlxuXG4gICAgLy8gUGxhY2Vob2xkZXIgTGFiIDQuIFN0ZXAgNC4xIC0gY29uZmlndXJlIHNhZ2VtYWtlciBhY2Nlc3MgdG8gdGhlIGRhdGFiYXNlLlxuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBBZGQgYSBEeW5hbW9EQiB0YWJsZSB0byBzdG9yZSBjaGF0IGhpc3RvcnkgcGVyIHNlc3Npb24gaWQuXG5cbiAgICAvLyBXaGVuIHlvdSBzZWUgYSBuZWVkIGZvciBpdCwgY29uc2lkZXIgY29uZmlndXJpbmcgYXV0b3NjYWxpbmcgdG8gdGhlIHRhYmxlXG4gICAgLy8gaHR0cHM6Ly9kb2NzLmF3cy5hbWF6b24uY29tL2Nkay9hcGkvdjIvZG9jcy9hd3MtY2RrLWxpYi5hd3NfZHluYW1vZGItcmVhZG1lLmh0bWwjY29uZmlndXJlLWF1dG9zY2FsaW5nLWZvci15b3VyLXRhYmxlXG4gICAgY29uc3QgQ2hhdE1lc3NhZ2VIaXN0b3J5VGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUoXG4gICAgICB0aGlzLFxuICAgICAgXCJDaGF0SGlzdG9yeVRhYmxlXCIsXG4gICAgICB7XG4gICAgICAgIC8vIGNvbnNpZGVyIGFjdGl2YXRpbmcgdGhlIGVuY3J5cHRpb24gYnkgdW5jb21tZW50aW5nIHRoZSBjb2RlIGJlbG93LlxuICAgICAgICAvLyBlbmNyeXB0aW9uOiBkeW5hbW9kYi5UYWJsZUVuY3J5cHRpb24uQVdTX01BTkFHRUQsXG4gICAgICAgIHBhcnRpdGlvbktleToge1xuICAgICAgICAgIG5hbWU6IFwiU2Vzc2lvbklkXCIsXG4gICAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcsXG4gICAgICAgIH0sXG4gICAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgICAgIC8vIENvbnNpZGVyYXRpb25zIHdoZW4gY2hvb3NpbmcgYSB0YWJsZSBjbGFzc1xuICAgICAgICAvLyBodHRwczovL2RvY3MuYXdzLmFtYXpvbi5jb20vYW1hem9uZHluYW1vZGIvbGF0ZXN0L2RldmVsb3Blcmd1aWRlL1dvcmtpbmdXaXRoVGFibGVzLnRhYmxlY2xhc3Nlcy5odG1sXG4gICAgICAgIHRhYmxlQ2xhc3M6IGR5bmFtb2RiLlRhYmxlQ2xhc3MuU1RBTkRBUkQsXG4gICAgICAgIC8vIFdoZW4gbW92aW5nIHRvIHByb2R1Y3Rpb24sIHVzZSBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4gaW5zdGVhZFxuICAgICAgICAvLyB3aGljaCB3aWxsIGtlZXAgdGhlIGRhdGFiYXNlIHRhYmxlIHdoZW4gZGVzdHJveWluZyB0aGUgc3RhY2suXG4gICAgICAgIC8vIHRoaXMgYXZvaWRzIGFjY2lkZW50YWwgZGVsZXRpb24gb2YgdXNlciBkYXRhLlxuICAgICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgICBlbmNyeXB0aW9uOiBkeW5hbW9kYi5UYWJsZUVuY3J5cHRpb24uQVdTX01BTkFHRURcbiAgICAgIH1cbiAgICApO1xuXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBBZGQgQVdTIExhbWJkYSBjb250YWluZXIgYW5kIGZ1bmN0aW9uIHRvIHNlcnZlIGFzIHRoZSBhZ2VudCBleGVjdXRvci5cbiAgICBjb25zdCBhZ2VudF9leGVjdXRvcl9sYW1iZGEgPSBuZXcgbGFtYmRhLkRvY2tlckltYWdlRnVuY3Rpb24oXG4gICAgICB0aGlzLFxuICAgICAgXCJMYW1iZGFBZ2VudENvbnRhaW5lclwiLFxuICAgICAge1xuICAgICAgICBjb2RlOiBsYW1iZGEuRG9ja2VySW1hZ2VDb2RlLmZyb21JbWFnZUFzc2V0KFxuICAgICAgICAgIHBhdGguam9pbihcbiAgICAgICAgICAgIF9fZGlybmFtZSxcbiAgICAgICAgICAgIFwibGFtYmRhLWZ1bmN0aW9ucy9hZ2VudC1leGVjdXRvci1sYW1iZGEtY29udGFpbmVyXCJcbiAgICAgICAgICApLFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIGJ1aWxkQXJnczogeyBcIi0tcGxhdGZvcm1cIjogXCJsaW51eC9hbWQ2NFwiIH1cbiAgICAgICAgICB9XG4gICAgICAgICksXG4gICAgICAgIGRlc2NyaXB0aW9uOiBcIkxhbWJkYSBmdW5jdGlvbiB3aXRoIGJlZHJvY2sgYWNjZXNzIGNyZWF0ZWQgdmlhIENES1wiLFxuICAgICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgICAgbWVtb3J5U2l6ZTogMjA0OCxcbiAgICAgICAgLy8gdnBjOiB2cGMudnBjLFxuICAgICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICAgIEJFRFJPQ0tfUkVHSU9OX1BBUkFNRVRFUjogc3NtX2JlZHJvY2tfcmVnaW9uX3BhcmFtZXRlci5wYXJhbWV0ZXJOYW1lLFxuICAgICAgICAgIExMTV9NT0RFTF9JRF9QQVJBTUVURVI6IHNzbV9sbG1fbW9kZWxfaWRfcGFyYW1ldGVyLnBhcmFtZXRlck5hbWUsXG4gICAgICAgICAgQ0hBVF9NRVNTQUdFX0hJU1RPUllfVEFCTEU6IENoYXRNZXNzYWdlSGlzdG9yeVRhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgICAvLyBBR0VOVF9EQl9TRUNSRVRfSUQ6IEFnZW50REIuc2VjcmV0Py5zZWNyZXRBcm4gYXMgc3RyaW5nXG4gICAgICAgIH0sXG4gICAgICB9XG4gICAgKTtcblxuICAgIC8vIFBsYWNlaG9sZGVyIFN0ZXAgMi40IC0gZ3JhbnQgTGFtYmRhIHBlcm1pc3Npb24gdG8gYWNjZXNzIGRiIGNyZWRlbnRpYWxzXG5cbiAgICAvLyBBbGxvdyBMYW1iZGEgdG8gcmVhZCBTU00gcGFyYW1ldGVycy5cbiAgICBzc21fYmVkcm9ja19yZWdpb25fcGFyYW1ldGVyLmdyYW50UmVhZChhZ2VudF9leGVjdXRvcl9sYW1iZGEpO1xuICAgIHNzbV9sbG1fbW9kZWxfaWRfcGFyYW1ldGVyLmdyYW50UmVhZChhZ2VudF9leGVjdXRvcl9sYW1iZGEpO1xuXG4gICAgLy8gQWxsb3cgTGFtYmRhIHJlYWQvd3JpdGUgYWNjZXNzIHRvIHRoZSBjaGF0IGhpc3RvcnkgRHluYW1vREIgdGFibGVcbiAgICAvLyB0byBiZSBhYmxlIHRvIHJlYWQgYW5kIHVwZGF0ZSBpdCBhcyBjb252ZXJzYXRpb25zIHByb2dyZXNzLlxuICAgIENoYXRNZXNzYWdlSGlzdG9yeVRhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShhZ2VudF9leGVjdXRvcl9sYW1iZGEpO1xuXG4gICAgLy8gQWxsb3cgdGhlIExhbWJkYSBmdW5jdGlvbiB0byB1c2UgQmVkcm9ja1xuICAgIGFnZW50X2V4ZWN1dG9yX2xhbWJkYS5yb2xlPy5hZGRNYW5hZ2VkUG9saWN5KFxuICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdBbWF6b25CZWRyb2NrRnVsbEFjY2VzcycpXG4gICAgKTtcblxuICAgIC8vIFNhdmUgdGhlIExhbWJkYSBBUk4gaW4gYW4gU1NNIHBhcmFtZXRlciB0byBzaW1wbGlmeSBpbnZva2luZyB0aGUgbGFtYmRhXG4gICAgLy8gZnJvbSBhIFNhZ2VNYWtlciBub3RlYm9vaywgd2l0aG91dCBoYXZpbmcgdG8gY29weSBpdCBtYW51YWxseS5cbiAgICBjb25zdCBhZ2VudExhbWJkYU5hbWVQYXJhbWV0ZXIgPSBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcihcbiAgICAgIHRoaXMsXG4gICAgICBcIkFnZW50TGFtYmRhTmFtZVBhcmFtZXRlclwiLFxuICAgICAge1xuICAgICAgICBwYXJhbWV0ZXJOYW1lOiBcIi9BZ2VudGljTExNQXNzaXN0YW50V29ya3Nob3AvQWdlbnRFeGVjdXRvckxhbWJkYU5hbWVQYXJhbWV0ZXJcIixcbiAgICAgICAgc3RyaW5nVmFsdWU6IGFnZW50X2V4ZWN1dG9yX2xhbWJkYS5mdW5jdGlvbk5hbWUsXG4gICAgICB9XG4gICAgKTtcblxuICAgIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gQ3JlYXRlIGFuIFMzIGJ1Y2tldCBmb3IgaW50ZXJtZWRpYXRlIGRhdGEgc3RhZ2luZ1xuICAgIC8vIGFuZCBhbGxvdyBTYWdlTWFrZXIgdG8gcmVhZCBhbmQgd3JpdGUgdG8gaXQuXG4gICAgY29uc3QgYWdlbnRfZGF0YV9idWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsIFwiQWdlbnREYXRhQnVja2V0XCIsIHtcbiAgICAgIC8vIFdhcm5pbmcsIHN3aXRoIERFU1RST1kgdG8gUkVUQUlOIHRvIGF2b2lkIGFjY2lkZW50YWwgZGVsZXRpb25cbiAgICAgIC8vIG9mIGltcG9ydGFudCBkYXRhLlxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIGF1dG9EZWxldGVPYmplY3RzOiB0cnVlLFxuICAgIH0pO1xuXG4gICAgLy8gU2F2ZSB0aGUgYnVja2V0IG5hbWUgYXMgYW4gU1NNIHBhcmFtZXRlciB0byBzaW1wbGlmeSB1c2luZyBpdCBpblxuICAgIC8vIFNhZ2VNYWtlciBwcm9jZXNzaW5nIGpvYnMgd2l0aG91dCBoYXZpbmcgdG8gY29weSB0aGUgbmFtZSBtYW51YWxseS5cbiAgICBjb25zdCBhZ2VudERhdGFCdWNrZXRQYXJhbWV0ZXIgPSBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcihcbiAgICAgIHRoaXMsXG4gICAgICBcIkFnZW50RGF0YUJ1Y2tldFBhcmFtZXRlclwiLFxuICAgICAge1xuICAgICAgICBwYXJhbWV0ZXJOYW1lOiBcIi9BZ2VudGljTExNQXNzaXN0YW50V29ya3Nob3AvQWdlbnREYXRhQnVja2V0UGFyYW1ldGVyXCIsXG4gICAgICAgIHN0cmluZ1ZhbHVlOiBhZ2VudF9kYXRhX2J1Y2tldC5idWNrZXROYW1lLFxuICAgICAgfVxuICAgICk7XG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIENyZWF0ZSBhIG1hbmFnZWQgSUFNIHBvbGljeSB0byBiZSBhdHRhY2hlZCB0byBhIFNhZ2VNYWtlciBleGVjdXRpb24gcm9sZVxuICAgIC8vIHRvIGFsbG93IHRoZSByZXF1aXJlZCBwZXJtaXNzaW9ucyB0byByZXRyaWV2ZSB0aGUgaW5mb3JtYXRpb24gdG8gYWNjZXNzIHRoZSBkYXRhYmFzZS5cbiAgICBjb25zdCBTYWdlTWFrZXJQb3N0Z3Jlc0RCQWNjZXNzSUFNUG9saWN5ID0gbmV3IGlhbS5NYW5hZ2VkUG9saWN5KFxuICAgICAgdGhpcyxcbiAgICAgIFwic2FnZU1ha2VyUG9zdGdyZXNEQkFjY2Vzc0lBTVBvbGljeVwiLFxuICAgICAge1xuICAgICAgICBzdGF0ZW1lbnRzOiBbXG4gICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgYWN0aW9uczogW1wic3NtOkdldFBhcmFtZXRlclwiXSxcbiAgICAgICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgICAgICBzc21fYmVkcm9ja19yZWdpb25fcGFyYW1ldGVyLnBhcmFtZXRlckFybixcbiAgICAgICAgICAgICAgc3NtX2xsbV9tb2RlbF9pZF9wYXJhbWV0ZXIucGFyYW1ldGVyQXJuLFxuICAgICAgICAgICAgICBhZ2VudExhbWJkYU5hbWVQYXJhbWV0ZXIucGFyYW1ldGVyQXJuLFxuICAgICAgICAgICAgICBhZ2VudERhdGFCdWNrZXRQYXJhbWV0ZXIucGFyYW1ldGVyQXJuLFxuICAgICAgICAgICAgXSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAvLyBhZGQgcGVybWlzc2lvbiB0byByZWFkIGFuZCB3cml0ZSB0byB0aGUgZGF0YSBidWNrZXRcbiAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgXCJzMzpHZXRPYmplY3RcIixcbiAgICAgICAgICAgICAgXCJzMzpQdXRPYmplY3RcIixcbiAgICAgICAgICAgICAgXCJzMzpEZWxldGVPYmplY3RcIixcbiAgICAgICAgICAgICAgXCJzMzpMaXN0QnVja2V0XCIsXG4gICAgICAgICAgICBdLFxuICAgICAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgICAgIC8vIEFkZCBwZXJtaXNzaW9uIHRvIGdldCBvbmx5IHRoZSBkYXRhIGJ1Y2tldFxuICAgICAgICAgICAgICBhZ2VudF9kYXRhX2J1Y2tldC5idWNrZXRBcm4sXG4gICAgICAgICAgICAgIGFnZW50X2RhdGFfYnVja2V0LmFybkZvck9iamVjdHMoXCIqXCIpLFxuICAgICAgICAgICAgXSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAvLyBhZGQgcGVybWlzc2lvbiB0byBpbnZva2UgdGhlIGFnZW50IGV4ZWN1dG9yIGxhbWJkYSBmdW5jdGlvbi5cbiAgICAgICAgICAgIGFjdGlvbnM6IFtcImxhbWJkYTpJbnZva2VGdW5jdGlvblwiXSxcbiAgICAgICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgICAgICBhZ2VudF9leGVjdXRvcl9sYW1iZGEuZnVuY3Rpb25Bcm4sXG4gICAgICAgICAgICBdXG4gICAgICAgICAgfSksXG4gICAgICAgIF0sXG4gICAgICB9XG4gICAgKTtcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gQ3JlYXRlIGEgbmV3IENvZ25pdG8gdXNlciBwb29sXG4gICAgLy8gZG9jdW1lbnRhdGlvbjogaHR0cHM6Ly9kb2NzLmF3cy5hbWF6b24uY29tL2Nkay9hcGkvdjIvZG9jcy9hd3MtY2RrLWxpYi5hd3NfY29nbml0by5Vc2VyUG9vbC5odG1sXG4gICAgY29uc3QgY29nbml0b191c2VyX3Bvb2wgPSBuZXcgY29nbml0by5Vc2VyUG9vbCh0aGlzLCBcIkNvZ25pdG9Qb29sXCIsIHtcbiAgICAgIGF1dG9WZXJpZnk6IHsgZW1haWw6IHRydWUgfSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICBzZWxmU2lnblVwRW5hYmxlZDogdHJ1ZSxcbiAgICAgIHNpZ25JbkNhc2VTZW5zaXRpdmU6IGZhbHNlLFxuICAgICAgc2lnbkluQWxpYXNlczoge1xuICAgICAgICBlbWFpbDogdHJ1ZSxcbiAgICAgICAgdXNlcm5hbWU6IHRydWVcbiAgICAgIH0sXG4gICAgICBzdGFuZGFyZEF0dHJpYnV0ZXM6IHtcbiAgICAgICAgZW1haWw6IHtcbiAgICAgICAgICByZXF1aXJlZDogdHJ1ZSxcbiAgICAgICAgICBtdXRhYmxlOiBmYWxzZVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBBZGQgYW4gYXBwIGNsaWVudCB0byB0aGUgdXNlciBwb29sXG4gICAgY29uc3QgcG9vbF9jbGllbnQgPSBjb2duaXRvX3VzZXJfcG9vbC5hZGRDbGllbnQoXG4gICAgICBcIk5leHRKc0FwcENsaWVudFwiLFxuICAgICAge1xuICAgICAgICBvQXV0aDoge1xuICAgICAgICAgIGZsb3dzOiB7XG4gICAgICAgICAgICBhdXRob3JpemF0aW9uQ29kZUdyYW50OiB0cnVlLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgc2NvcGVzOiBbY29nbml0by5PQXV0aFNjb3BlLk9QRU5JRF0sXG4gICAgICAgICAgY2FsbGJhY2tVcmxzOiBbXCJodHRwczovL2xvY2FsaG9zdDozMDAwL1wiXSxcbiAgICAgICAgICBsb2dvdXRVcmxzOiBbXCJodHRwczovL2xvY2FsaG9zdDozMDAwL1wiXSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBBZGQgYW4gQW1hem9uIEFQSSBHYXRld2F5IHdpdGggQVdTIGNvZ25pdG8gYXV0aCBhbmQgYW4gQVdTIGxhbWJkYSBhcyBhIGJhY2tlbmRcblxuICAgIGNvbnN0IGFnZW50X2FwaSA9IG5ldyBhcGlnYXRld2F5LlJlc3RBcGkodGhpcywgXCJBc3Npc3RhbnRBcGlcIiwge1xuICAgICAgcmVzdEFwaU5hbWU6IFwiYXNzaXN0YW50LWFwaVwiLFxuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgIFwiQW4gQVBJIHRvIGludm9rZSBhbiBMTE0gYmFzZWQgYWdlbnQgd2hpY2ggb3JjaGVzdHJhdGVzIHVzaW5nIHRvb2xzIHRvIGFuc3dlciB1c2VyIGlucHV0IHF1ZXN0aW9ucy5cIixcbiAgICAgIGRlZmF1bHRDb3JzUHJlZmxpZ2h0T3B0aW9uczoge1xuICAgICAgICBhbGxvd09yaWdpbnM6IGFwaWdhdGV3YXkuQ29ycy5BTExfT1JJR0lOUywgLy8gQ2hhbmdlIHRoaXMgdG8gdGhlIHNwZWNpZmljIG9yaWdpbiBvZiB5b3VyIGFwcCBpbiBwcm9kdWN0aW9uXG4gICAgICAgIGFsbG93TWV0aG9kczogYXBpZ2F0ZXdheS5Db3JzLkFMTF9NRVRIT0RTLFxuICAgICAgICBhbGxvd0hlYWRlcnM6IFsnQ29udGVudC1UeXBlJywgJ0F1dGhvcml6YXRpb24nXVxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gaHR0cHM6Ly9kb2NzLmF3cy5hbWF6b24uY29tL2Nkay9hcGkvdjIvZG9jcy9hd3MtY2RrLWxpYi5hd3NfYXBpZ2F0ZXdheS5Db2duaXRvVXNlclBvb2xzQXV0aG9yaXplci5odG1sXG4gICAgY29uc3QgY29nbml0b19hdXRob3JpemVyID0gbmV3IGFwaWdhdGV3YXkuQ29nbml0b1VzZXJQb29sc0F1dGhvcml6ZXIodGhpcywgJ0NoYXRBdXRob3JpemVyJywge1xuICAgICAgY29nbml0b1VzZXJQb29sczogW2NvZ25pdG9fdXNlcl9wb29sXVxuICAgIH0pO1xuXG4gICAgY29uc3QgYWdlbnRfbGFtYmRhX2ludGVncmF0aW9uID0gbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oYWdlbnRfZXhlY3V0b3JfbGFtYmRhLCB7XG4gICAgICBwcm94eTogZmFsc2UsIC8vIFNldCB0aGlzIHRvIGZhbHNlIHRvIGludGVncmF0ZSB3aXRoIExhbWJkYSBmdW5jdGlvbiBkaXJlY3RseVxuICAgICAgaW50ZWdyYXRpb25SZXNwb25zZXM6IFt7XG4gICAgICAgIHN0YXR1c0NvZGU6ICcyMDAnLFxuICAgICAgICAvLyBFbmFibGUgQ09SUyBmb3IgdGhlIExhbWJkYSBJbnRlZ3JhdGlvblxuICAgICAgICByZXNwb25zZVBhcmFtZXRlcnM6IHtcbiAgICAgICAgICAnbWV0aG9kLnJlc3BvbnNlLmhlYWRlci5BY2Nlc3MtQ29udHJvbC1BbGxvdy1IZWFkZXJzJzogXCInQ29udGVudC1UeXBlLFgtQW16LURhdGUsQXV0aG9yaXphdGlvbixYLUFwaS1LZXksWC1BbXotU2VjdXJpdHktVG9rZW4nXCIsXG4gICAgICAgICAgJ21ldGhvZC5yZXNwb25zZS5oZWFkZXIuQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogXCInKidcIixcbiAgICAgICAgICAnbWV0aG9kLnJlc3BvbnNlLmhlYWRlci5BY2Nlc3MtQ29udHJvbC1BbGxvdy1NZXRob2RzJzogXCInUE9TVCxPUFRJT05TJ1wiLFxuICAgICAgICB9LFxuICAgICAgfV1cbiAgICB9KTtcblxuICAgIGFnZW50X2FwaS5yb290LmFkZE1ldGhvZChcbiAgICAgIFwiUE9TVFwiLFxuICAgICAgYWdlbnRfbGFtYmRhX2ludGVncmF0aW9uLFxuICAgICAge1xuICAgICAgICAvLyBFbmFibGUgQ09SUyBmb3IgdGhlIEFQSVxuICAgICAgICBtZXRob2RSZXNwb25zZXM6IFt7XG4gICAgICAgICAgc3RhdHVzQ29kZTogJzIwMCcsXG4gICAgICAgICAgcmVzcG9uc2VQYXJhbWV0ZXJzOiB7XG4gICAgICAgICAgICAnbWV0aG9kLnJlc3BvbnNlLmhlYWRlci5BY2Nlc3MtQ29udHJvbC1BbGxvdy1IZWFkZXJzJzogdHJ1ZSxcbiAgICAgICAgICAgICdtZXRob2QucmVzcG9uc2UuaGVhZGVyLkFjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6IHRydWUsXG4gICAgICAgICAgICAnbWV0aG9kLnJlc3BvbnNlLmhlYWRlci5BY2Nlc3MtQ29udHJvbC1BbGxvdy1NZXRob2RzJzogdHJ1ZSxcbiAgICAgICAgICB9LFxuICAgICAgICB9XSxcbiAgICAgICAgYXV0aG9yaXplcjogY29nbml0b19hdXRob3JpemVyLFxuICAgICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPXG4gICAgICB9XG4gICAgKTtcblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gQWRkIGFuIFNTTSBwYXJhbWV0ZXIgdG8gaG9sZCB0aGUgY29nbml0byB1c2VyIHBvb2wgaWRcbiAgICBjb25zdCBjb2duaXRvX3VzZXJfcG9vbF9pZF9wYXJhbWV0ZXIgPSBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcihcbiAgICAgIHRoaXMsXG4gICAgICBcImNvZ25pdG9Vc2VyUG9vbFBhcmFtZXRlclwiLFxuICAgICAge1xuICAgICAgICBwYXJhbWV0ZXJOYW1lOiBcIi9BZ2VudGljTExNQXNzaXN0YW50V29ya3Nob3AvY29nbml0b191c2VyX3Bvb2xfaWRcIixcbiAgICAgICAgc3RyaW5nVmFsdWU6IGNvZ25pdG9fdXNlcl9wb29sLnVzZXJQb29sSWQsXG4gICAgICB9XG4gICAgKTtcblxuICAgIC8vIEFkZCBhbiBTU00gcGFyYW1ldGVyIHRvIGhvbGQgdGhlIGNvZ25pdG8gdXNlciBwb29sIGlkXG4gICAgY29uc3QgY29nbml0b191c2VyX3Bvb2xfY2xpZW50X2lkX3BhcmFtZXRlciA9IG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKFxuICAgICAgdGhpcyxcbiAgICAgIFwiY29nbml0b1VzZXJQb29sQ2xpZW50UGFyYW1ldGVyXCIsXG4gICAgICB7XG4gICAgICAgIHBhcmFtZXRlck5hbWU6IFwiL0FnZW50aWNMTE1Bc3Npc3RhbnRXb3Jrc2hvcC9jb2duaXRvX3VzZXJfcG9vbF9jbGllbnRfaWRcIixcbiAgICAgICAgc3RyaW5nVmFsdWU6IHBvb2xfY2xpZW50LnVzZXJQb29sQ2xpZW50SWQsXG4gICAgICB9XG4gICAgKTtcblxuICAgIC8vIEFkZCBhbiBTU00gcGFyYW1ldGVyIHRvIGhvbGQgUmVzdCBBUEkgVVJMXG4gICAgY29uc3QgYWdlbnRfYXBpX3BhcmFtZXRlciA9IG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKFxuICAgICAgdGhpcyxcbiAgICAgIFwiQWdlbnRBUElVUkxQYXJhbWV0ZXJcIixcbiAgICAgIHtcbiAgICAgICAgcGFyYW1ldGVyTmFtZTogXCIvQWdlbnRpY0xMTUFzc2lzdGFudFdvcmtzaG9wL2FnZW50X2FwaVwiLFxuICAgICAgICBzdHJpbmdWYWx1ZTogYWdlbnRfYXBpLnVybFxuICAgICAgfVxuICAgICk7XG5cbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIHN0YWNrIG91dHB1dHNcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwic2FnZU1ha2VyUG9zdGdyZXNEQkFjY2Vzc0lBTVBvbGljeUFSTlwiLCB7XG4gICAgICB2YWx1ZTogU2FnZU1ha2VyUG9zdGdyZXNEQkFjY2Vzc0lBTVBvbGljeS5tYW5hZ2VkUG9saWN5QXJuLFxuICAgIH0pO1xuXG4gICAgLy8gT3V0cHV0IHRoZSBjbGllbnRJRFxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwiVXNlclBvb2xDbGllbnRcIiwge1xuICAgICAgdmFsdWU6IHBvb2xfY2xpZW50LnVzZXJQb29sQ2xpZW50SWQsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCBcIlVzZXJQb29sSWRcIiwge1xuICAgICAgdmFsdWU6IGNvZ25pdG9fdXNlcl9wb29sLnVzZXJQb29sSWRcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwiVXNlclBvb2xQcm92aWRlclVSTFwiLCB7XG4gICAgICB2YWx1ZTogY29nbml0b191c2VyX3Bvb2wudXNlclBvb2xQcm92aWRlclVybFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJFbmRwb2ludFVSTFwiLCB7XG4gICAgICB2YWx1ZTogYWdlbnRfYXBpLnVybFxuICAgIH0pO1xuXG4gIH1cbn0iXX0=