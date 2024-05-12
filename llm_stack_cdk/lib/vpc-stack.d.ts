import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
export declare class Vpc extends Construct {
    readonly vpc: ec2.Vpc;
    readonly s3GatewayEndpoint: ec2.IGatewayVpcEndpoint;
    readonly s3vpcEndpoint: ec2.IGatewayVpcEndpoint;
    readonly dynamodbvpcEndpoint: ec2.IGatewayVpcEndpoint;
    readonly secretsManagerVpcEndpoint: ec2.IInterfaceVpcEndpoint;
    readonly apiGatewayVpcEndpoint: ec2.IInterfaceVpcEndpoint;
    constructor(scope: Construct, id: string);
}
