import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";

export class ChatDynamoDBTables extends Construct {
  
  public readonly sessionsTable: dynamodb.Table;
  public readonly byUserIdIndex: string = "byUserId";

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.sessionsTable = new dynamodb.Table(this, "SessionsTable", {
      partitionKey: {
        name: "SessionId",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "UserId",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pointInTimeRecovery: true,
    });

    this.sessionsTable.addGlobalSecondaryIndex({
        indexName: this.byUserIdIndex,
        partitionKey: { 
            name: "UserId",
            type: dynamodb.AttributeType.STRING 
        },
    });
  }
}

export class RagDynamoDBTables extends Construct {

    public readonly workspacesTable: dynamodb.Table;
    public readonly documentsTable: dynamodb.Table;
    public readonly workspacesByObjectTypeIndexName: string ="by_object_type_idx";
    public readonly documentsByCompoundKeyIndexName: string ="by_compound_key_idx";
    public readonly documentsByStatusIndexName: string = "by_status_idx";

    constructor(scope: Construct, id: string) {
        super(scope, id);

        this.workspacesTable = new dynamodb.Table(this, "Workspaces", {
        partitionKey: {
            name: "workspace_id",
            type: dynamodb.AttributeType.STRING,
        },
        sortKey: {
            name: "object_type",
            type: dynamodb.AttributeType.STRING,
        },
        billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
        encryption: dynamodb.TableEncryption.AWS_MANAGED,
        pointInTimeRecovery: true,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        });

        this.workspacesTable.addGlobalSecondaryIndex({
        indexName: this.workspacesByObjectTypeIndexName,
        partitionKey: {
            name: "object_type",
            type: dynamodb.AttributeType.STRING,
        },
        sortKey: {
            name: "created_at",
            type: dynamodb.AttributeType.STRING,
        },
        });

        this.documentsTable = new dynamodb.Table(this, "Documents", {
            partitionKey: {
                name: "workspace_id",
                type: dynamodb.AttributeType.STRING,
            },
            sortKey: {
                name: "document_id",
                type: dynamodb.AttributeType.STRING,
            },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            encryption: dynamodb.TableEncryption.AWS_MANAGED,
            pointInTimeRecovery: true,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });

        this.documentsTable.addGlobalSecondaryIndex({
            indexName: this.documentsByCompoundKeyIndexName,
            partitionKey: {
                name: "workspace_id",
                type: dynamodb.AttributeType.STRING,
            },
            sortKey: {
                name: "compound_sort_key",
                type: dynamodb.AttributeType.STRING,
            },
        });

        this.documentsTable.addGlobalSecondaryIndex({
            indexName: this.documentsByStatusIndexName,
            partitionKey: {
                name: "status",
                type: dynamodb.AttributeType.STRING,
            },
            sortKey: {
                name: "document_type",
                type: dynamodb.AttributeType.STRING,
            },
        });
  }
}
