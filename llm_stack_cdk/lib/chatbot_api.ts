import * as sns from "aws-cdk-lib/aws-sns";
import { Construct } from "constructs";
import * as appsync from "aws-cdk-lib/aws-appsync";
import { S3Buckets } from "./s3_cdk";
import { ChatDynamoDBTables } from "./dynamodb-tables";


export interface ChatBotApiProps {
    // readonly shared: Shared;
    // readonly config: SystemConfig;
    // readonly ragEngines?: RagEngines;
    // readonly userPool: cognito.UserPool;
    // readonly modelsParameter: ssm.StringParameter;
    // readonly models: SageMakerModelEndpoint[];
  }

export class ChatBotApi extends Construct {
    public readonly messagesTopic: sns.Topic;

    public readonly chatTable: ChatDynamoDBTables;

    public readonly buckets_stack: S3Buckets;

    public readonly graphqlApi: appsync.GraphqlApi;
  
    constructor(scope: Construct, id: string, props: ChatBotApiProps) {
      super(scope, id);  
      this.chatTable = new DynamoDBTables(this, "ChatDynamoDBTables");
      this.buckets_stack = new S3Buckets(this, "ChatBuckets");
    }
}