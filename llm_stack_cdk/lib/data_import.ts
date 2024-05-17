import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { ImportBucket } from "./s3";
export interface DataImportProps {
//     readonly config: SystemConfig;
//     readonly shared: Shared;
//     readonly auroraDatabase?: rds.DatabaseCluster;
//     readonly ragDynamoDBTables: RagDynamoDBTables;
//     readonly openSearchVector?: OpenSearchVector;
//     readonly kendraRetrieval?: KendraRetrieval;
//     readonly sageMakerRagModels?: SageMakerRagModels;
//     readonly workspacesTable: dynamodb.Table;
//     readonly documentsTable: dynamodb.Table;
//     readonly workspacesByObjectTypeIndexName: string;
//     readonly documentsByCompoundKeyIndexName: string;
}
  
export class DataImport extends Construct {
    
    public readonly importBucket:ImportBucket;


    // public readonly ingestionQueue: sqs.Queue;
    // public readonly fileImportWorkflow: sfn.StateMachine;
    // public readonly websiteCrawlingWorkflow: sfn.StateMachine;
    // public readonly rssIngestorFunction: lambda.Function;
    constructor(scope: Construct, id: string, props: DataImportProps) {
        super(scope, id);

        this.importBucket = new ImportBucket(this, "XXXXXXXXXXXX");
        // this.importBucket.uploadBucket.addEventNotification(
        //     s3.EventType.OBJECT_CREATED,
        //     new s3Notifications.SqsDestination(ingestionQueue)
        //   );
      
        // this.importBucket.uploadBucket.addEventNotification(
        //     s3.EventType.OBJECT_REMOVED,
        //     new s3Notifications.SqsDestination(ingestionQueue)
        //   );
        this.importBucket.uploadBucket.grantReadWrite(uploadHandler);
        this.importBucket.processingBucket.grantReadWrite(uploadHandler);
    }
}