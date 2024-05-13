import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';

export class S3Buckets extends Construct {

  public readonly filesBucket: s3.Bucket;
  public readonly userFeedbackBucket: s3.Bucket;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    // Get current AWS account ID
    const accountId = cdk.Stack.of(this).account;

    // Get current AWS region
    const region = cdk.Stack.of(this).region;

    const logsBucket = new s3.Bucket(this, `LogsBucket-${accountId}-${region}`, {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      enforceSSL: true,
    });

    this.filesBucket = new s3.Bucket(this, `FilesBucket-${accountId}-${region}`, {
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

    this.userFeedbackBucket = new s3.Bucket(this, `UserFeedbackBucket-${accountId}-${region}`, {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      enforceSSL: true,
      serverAccessLogsBucket: logsBucket,
    });
  }
}