import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';

export class ChatBucket extends Construct {

  public readonly filesBucket: s3.Bucket;
  public readonly userFeedbackBucket: s3.Bucket;

  constructor(scope: Construct, id: string) {
    super(scope, id);


    const logsBucket = new s3.Bucket(this, `LogsBucket`, {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      enforceSSL: true,
    });

    this.filesBucket = new s3.Bucket(this, `FilesBucket`, {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      transferAcceleration: true,
      enforceSSL: true,
      serverAccessLogsBucket: logsBucket,
      cors: [
        {
          allowedHeaders: ["*"],
          allowedMethods: [
            s3.HttpMethods.PUT,
            s3.HttpMethods.POST,
            s3.HttpMethods.GET,
            s3.HttpMethods.HEAD,
          ],
          allowedOrigins: ["*"],
          exposedHeaders: ["ETag"],
          maxAge: 3000,
        },
      ],
    });

    this.userFeedbackBucket = new s3.Bucket(this, `UserFeedbackBucket`, {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      enforceSSL: true,
      serverAccessLogsBucket: logsBucket,
    });
  }
}

export class ImportBucket extends Construct {

  public readonly uploadBucket: s3.Bucket;
  public readonly processingBucket: s3.Bucket;  

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const uploadLogsBucket = new s3.Bucket(this, "UploadLogsBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      enforceSSL: true,
    });

    this.uploadBucket = new s3.Bucket(this, "UploadBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      transferAcceleration: true,
      enforceSSL: true,
      serverAccessLogsBucket: uploadLogsBucket,
      cors: [
        {
          allowedHeaders: ["*"],
          allowedMethods: [
            s3.HttpMethods.PUT,
            s3.HttpMethods.POST,
            s3.HttpMethods.GET,
            s3.HttpMethods.HEAD,
          ],
          allowedOrigins: ["*"],
          exposedHeaders: ["ETag"],
          maxAge: 3000,
        },
      ],
    });

    const processingLogsBucket = new s3.Bucket(this, "ProcessingLogsBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      enforceSSL: true,
    });

    this.processingBucket = new s3.Bucket(this, "ProcessingBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      enforceSSL: true,
      serverAccessLogsBucket: processingLogsBucket,
    });
  }
}