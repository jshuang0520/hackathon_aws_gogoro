"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Vpc = void 0;
// Credit goes to -> https://github.com/aws-samples/aws-genai-llm-chatbot/blob/main/lib/vpc/index.ts
const ec2 = require("aws-cdk-lib/aws-ec2");
const constructs_1 = require("constructs");
class Vpc extends constructs_1.Construct {
    constructor(scope, id) {
        super(scope, id);
        const vpc = new ec2.Vpc(this, 'VPC', {
            maxAzs: 2,
            subnetConfiguration: [
                {
                    name: 'public',
                    subnetType: ec2.SubnetType.PUBLIC,
                },
                {
                    name: 'private',
                    subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
                },
                {
                    name: 'isolated',
                    subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
                },
            ],
        });
        // Create a VPC endpoint for S3.
        this.s3GatewayEndpoint = vpc.addGatewayEndpoint('S3GatewayEndpoint', {
            service: ec2.GatewayVpcEndpointAwsService.S3,
        });
        this.s3vpcEndpoint = vpc.addInterfaceEndpoint('S3InterfaceEndpoint', {
            service: ec2.InterfaceVpcEndpointAwsService.S3,
            open: true,
        });
        this.s3vpcEndpoint.node.addDependency(this.s3GatewayEndpoint);
        // Create a VPC endpoint for DynamoDB.
        this.dynamodbvpcEndpoint = vpc.addGatewayEndpoint('DynamoDBEndpoint', {
            service: ec2.GatewayVpcEndpointAwsService.DYNAMODB,
        });
        // Create VPC Endpoint for Secrets Manager
        this.secretsManagerVpcEndpoint = vpc.addInterfaceEndpoint('SecretsManagerEndpoint', {
            service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
            open: true,
        });
        this.vpc = vpc;
    }
}
exports.Vpc = Vpc;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidnBjLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidnBjLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLG9HQUFvRztBQUNwRywyQ0FBMkM7QUFDM0MsMkNBQXVDO0FBRXZDLE1BQWEsR0FBSSxTQUFRLHNCQUFTO0lBUWhDLFlBQVksS0FBZ0IsRUFBRSxFQUFVO1FBQ3RDLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsTUFBTSxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxLQUFLLEVBQUU7WUFDbkMsTUFBTSxFQUFFLENBQUM7WUFDVCxtQkFBbUIsRUFBRTtnQkFDbkI7b0JBQ0UsSUFBSSxFQUFFLFFBQVE7b0JBQ2QsVUFBVSxFQUFFLEdBQUcsQ0FBQyxVQUFVLENBQUMsTUFBTTtpQkFDbEM7Z0JBQ0Q7b0JBQ0UsSUFBSSxFQUFFLFNBQVM7b0JBQ2YsVUFBVSxFQUFFLEdBQUcsQ0FBQyxVQUFVLENBQUMsbUJBQW1CO2lCQUMvQztnQkFDRDtvQkFDRSxJQUFJLEVBQUUsVUFBVTtvQkFDaEIsVUFBVSxFQUFFLEdBQUcsQ0FBQyxVQUFVLENBQUMsZ0JBQWdCO2lCQUM1QzthQUNGO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsZ0NBQWdDO1FBQ2hDLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxHQUFHLENBQUMsa0JBQWtCLENBQUMsbUJBQW1CLEVBQUU7WUFDbkUsT0FBTyxFQUFFLEdBQUcsQ0FBQyw0QkFBNEIsQ0FBQyxFQUFFO1NBQzdDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxhQUFhLEdBQUcsR0FBRyxDQUFDLG9CQUFvQixDQUFDLHFCQUFxQixFQUFFO1lBQ25FLE9BQU8sRUFBRSxHQUFHLENBQUMsOEJBQThCLENBQUMsRUFBRTtZQUM5QyxJQUFJLEVBQUUsSUFBSTtTQUNYLENBQUMsQ0FBQztRQUNILElBQUksQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsQ0FBQztRQUU5RCxzQ0FBc0M7UUFDdEMsSUFBSSxDQUFDLG1CQUFtQixHQUFHLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxrQkFBa0IsRUFBRTtZQUNwRSxPQUFPLEVBQUUsR0FBRyxDQUFDLDRCQUE0QixDQUFDLFFBQVE7U0FDbkQsQ0FBQyxDQUFDO1FBRUgsMENBQTBDO1FBQzFDLElBQUksQ0FBQyx5QkFBeUIsR0FBRyxHQUFHLENBQUMsb0JBQW9CLENBQUMsd0JBQXdCLEVBQUU7WUFDbEYsT0FBTyxFQUFFLEdBQUcsQ0FBQyw4QkFBOEIsQ0FBQyxlQUFlO1lBQzNELElBQUksRUFBRSxJQUFJO1NBQ1gsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUM7SUFDakIsQ0FBQztDQUNGO0FBckRELGtCQXFEQyIsInNvdXJjZXNDb250ZW50IjpbIi8vIENyZWRpdCBnb2VzIHRvIC0+IGh0dHBzOi8vZ2l0aHViLmNvbS9hd3Mtc2FtcGxlcy9hd3MtZ2VuYWktbGxtLWNoYXRib3QvYmxvYi9tYWluL2xpYi92cGMvaW5kZXgudHNcbmltcG9ydCAqIGFzIGVjMiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWMyJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuXG5leHBvcnQgY2xhc3MgVnBjIGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgcHVibGljIHJlYWRvbmx5IHZwYzogZWMyLlZwYztcbiAgcHVibGljIHJlYWRvbmx5IHMzR2F0ZXdheUVuZHBvaW50OiBlYzIuSUdhdGV3YXlWcGNFbmRwb2ludDtcbiAgcHVibGljIHJlYWRvbmx5IHMzdnBjRW5kcG9pbnQ6IGVjMi5JR2F0ZXdheVZwY0VuZHBvaW50O1xuICBwdWJsaWMgcmVhZG9ubHkgZHluYW1vZGJ2cGNFbmRwb2ludDogZWMyLklHYXRld2F5VnBjRW5kcG9pbnQ7XG4gIHB1YmxpYyByZWFkb25seSBzZWNyZXRzTWFuYWdlclZwY0VuZHBvaW50OiBlYzIuSUludGVyZmFjZVZwY0VuZHBvaW50O1xuICBwdWJsaWMgcmVhZG9ubHkgYXBpR2F0ZXdheVZwY0VuZHBvaW50OiBlYzIuSUludGVyZmFjZVZwY0VuZHBvaW50O1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgY29uc3QgdnBjID0gbmV3IGVjMi5WcGModGhpcywgJ1ZQQycsIHtcbiAgICAgIG1heEF6czogMixcbiAgICAgIHN1Ym5ldENvbmZpZ3VyYXRpb246IFtcbiAgICAgICAge1xuICAgICAgICAgIG5hbWU6ICdwdWJsaWMnLFxuICAgICAgICAgIHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBVQkxJQyxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIG5hbWU6ICdwcml2YXRlJyxcbiAgICAgICAgICBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QUklWQVRFX1dJVEhfRUdSRVNTLFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgbmFtZTogJ2lzb2xhdGVkJyxcbiAgICAgICAgICBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QUklWQVRFX0lTT0xBVEVELFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBhIFZQQyBlbmRwb2ludCBmb3IgUzMuXG4gICAgdGhpcy5zM0dhdGV3YXlFbmRwb2ludCA9IHZwYy5hZGRHYXRld2F5RW5kcG9pbnQoJ1MzR2F0ZXdheUVuZHBvaW50Jywge1xuICAgICAgc2VydmljZTogZWMyLkdhdGV3YXlWcGNFbmRwb2ludEF3c1NlcnZpY2UuUzMsXG4gICAgfSk7XG5cbiAgICB0aGlzLnMzdnBjRW5kcG9pbnQgPSB2cGMuYWRkSW50ZXJmYWNlRW5kcG9pbnQoJ1MzSW50ZXJmYWNlRW5kcG9pbnQnLCB7XG4gICAgICBzZXJ2aWNlOiBlYzIuSW50ZXJmYWNlVnBjRW5kcG9pbnRBd3NTZXJ2aWNlLlMzLFxuICAgICAgb3BlbjogdHJ1ZSxcbiAgICB9KTtcbiAgICB0aGlzLnMzdnBjRW5kcG9pbnQubm9kZS5hZGREZXBlbmRlbmN5KHRoaXMuczNHYXRld2F5RW5kcG9pbnQpO1xuXG4gICAgLy8gQ3JlYXRlIGEgVlBDIGVuZHBvaW50IGZvciBEeW5hbW9EQi5cbiAgICB0aGlzLmR5bmFtb2RidnBjRW5kcG9pbnQgPSB2cGMuYWRkR2F0ZXdheUVuZHBvaW50KCdEeW5hbW9EQkVuZHBvaW50Jywge1xuICAgICAgc2VydmljZTogZWMyLkdhdGV3YXlWcGNFbmRwb2ludEF3c1NlcnZpY2UuRFlOQU1PREIsXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgVlBDIEVuZHBvaW50IGZvciBTZWNyZXRzIE1hbmFnZXJcbiAgICB0aGlzLnNlY3JldHNNYW5hZ2VyVnBjRW5kcG9pbnQgPSB2cGMuYWRkSW50ZXJmYWNlRW5kcG9pbnQoJ1NlY3JldHNNYW5hZ2VyRW5kcG9pbnQnLCB7XG4gICAgICBzZXJ2aWNlOiBlYzIuSW50ZXJmYWNlVnBjRW5kcG9pbnRBd3NTZXJ2aWNlLlNFQ1JFVFNfTUFOQUdFUixcbiAgICAgIG9wZW46IHRydWUsXG4gICAgfSk7XG5cbiAgICB0aGlzLnZwYyA9IHZwYztcbiAgfVxufSJdfQ==