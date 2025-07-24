#!/usr/bin/env python3
"""
AWS Lambda Deployment Script for Resume Tailor Application
Deploys all Lambda functions with rate limiting capabilities.

Usage:
    python deploy.py [--region us-east-2] [--bucket-name your-bucket] [--profile default]
"""

import os
import sys
import json
import zipfile
import argparse
import boto3
import tempfile
import shutil
from pathlib import Path
from botocore.exceptions import ClientError

class LambdaDeployer:
    def __init__(self, region='us-east-2', profile=None, bucket_name=None, role_arn=None):
        self.region = region
        self.profile = profile
        self.bucket_name = bucket_name
        self.role_arn = role_arn
        
        # Initialize AWS session
        if profile:
            self.session = boto3.Session(profile_name=profile, region_name=region)
        else:
            self.session = boto3.Session(region_name=region)
        
        self.lambda_client = self.session.client('lambda')
        self.dynamodb = self.session.resource('dynamodb')
        self.iam = self.session.client('iam')
        self.s3 = self.session.client('s3')
        
        # Lambda functions configuration
        self.lambda_functions = {
            'score_resume': {
                'description': 'Score resumes using Bedrock and Textract with rate limiting',
                'timeout': 300,
                'memory': 512,
                'environment': {
                    'BUCKET_NAME': bucket_name or ''
                }
            },
            'tailor_master_resume': {
                'description': 'Tailor master resume using Bedrock with rate limiting',
                'timeout': 180,
                'memory': 256,
                'environment': {
                    'BUCKET_NAME': bucket_name or ''
                }
            },
            'process_master_resume': {
                'description': 'Process master resume using Textract and Bedrock with rate limiting',
                'timeout': 300,
                'memory': 512,
                'environment': {
                    'BUCKET_NAME': bucket_name or ''
                }
            },
            'upload_resume': {
                'description': 'Upload resume for authenticated users',
                'timeout': 60,
                'memory': 256,
                'environment': {
                    'BUCKET_NAME': bucket_name or ''
                }
            },
            'upload_resume_guest': {
                'description': 'Upload resume for guest users',
                'timeout': 60,
                'memory': 256,
                'environment': {
                    'BUCKET_NAME': bucket_name or ''
                }
            },
            'get_tailored_resumes': {
                'description': 'Get tailored resumes for authenticated users',
                'timeout': 30,
                'memory': 256,
                'environment': {}
            },
            'get_master_resume': {
                'description': 'Get master resume for authenticated users',
                'timeout': 30,
                'memory': 256,
                'environment': {}
            },
            'get_score': {
                'description': 'Get resume score results',
                'timeout': 30,
                'memory': 256,
                'environment': {}
            },
            'get_usage_stats': {
                'description': 'Get API usage statistics with rate limiting info',
                'timeout': 30,
                'memory': 256,
                'environment': {}
            }
        }



    def get_existing_lambda_role(self):
        """Get the ARN of an existing Lambda execution role."""
        # Try common role names
        possible_roles = [
            'ResumeToilorLambdaRole',
            'ResumeToilerLambdaRole', 
            'lambda-execution-role',
            'LambdaExecutionRole'
        ]
        
        for role_name in possible_roles:
            try:
                role = self.iam.get_role(RoleName=role_name)
                role_arn = role['Role']['Arn']
                print(f"✅ Using existing role: {role_name}")
                print(f"   Role ARN: {role_arn}")
                return role_arn
            except ClientError:
                continue
        
        # If no role found, return None and let user know
        print("⚠️  No existing Lambda execution role found.")
        print("   Please create a role with the following permissions:")
        print("   - Lambda basic execution")
        print("   - DynamoDB read/write access")
        print("   - S3 read/write access") 
        print("   - Textract document processing")
        print("   - Bedrock model invocation")
        print()
        
        # Ask user for role ARN
        role_arn = input("Enter your Lambda execution role ARN: ").strip()
        if not role_arn:
            raise Exception("Lambda execution role ARN is required")
        
        return role_arn

    def package_lambda_function(self, function_name):
        """Package a Lambda function into a zip file."""
        lambda_dir = Path('lambdas') / function_name
        
        if not lambda_dir.exists():
            raise FileNotFoundError(f"Lambda directory not found: {lambda_dir}")
        
        # Create a temporary directory for packaging
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            
            # Copy all Python files to temp directory
            for py_file in lambda_dir.glob('*.py'):
                shutil.copy2(py_file, temp_path / py_file.name)
            
            # Create zip file
            zip_path = Path('deployments') / f'{function_name}.zip'
            zip_path.parent.mkdir(exist_ok=True)
            
            with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zip_file:
                for file_path in temp_path.rglob('*'):
                    if file_path.is_file():
                        arcname = file_path.relative_to(temp_path)
                        zip_file.write(file_path, arcname)
            
            print(f"📦 Packaged {function_name} -> {zip_path}")
            return zip_path

    def deploy_lambda_function(self, function_name, role_arn):
        """Deploy or update a Lambda function."""
        config = self.lambda_functions[function_name]
        zip_path = self.package_lambda_function(function_name)
        
        # Read the zip file
        with open(zip_path, 'rb') as zip_file:
            zip_content = zip_file.read()
        
        try:
            # Try to update existing function
            print(f"🔄 Updating function '{function_name}'...")
            
            # Update function code
            self.lambda_client.update_function_code(
                FunctionName=function_name,
                ZipFile=zip_content
            )
            
            # Update function configuration
            self.lambda_client.update_function_configuration(
                FunctionName=function_name,
                Description=config['description'],
                Timeout=config['timeout'],
                MemorySize=config['memory'],
                Environment={'Variables': config['environment']},
                Role=role_arn
            )
            
            print(f"✅ Function '{function_name}' updated successfully!")
            
        except ClientError as e:
            if e.response['Error']['Code'] == 'ResourceNotFoundException':
                # Create new function
                print(f"🔨 Creating function '{function_name}'...")
                
                response = self.lambda_client.create_function(
                    FunctionName=function_name,
                    Runtime='python3.9',
                    Role=role_arn,
                    Handler='lambda_function.lambda_handler',
                    Code={'ZipFile': zip_content},
                    Description=config['description'],
                    Timeout=config['timeout'],
                    MemorySize=config['memory'],
                    Environment={'Variables': config['environment']},
                    Tags={
                        'Application': 'Resume Tailor',
                        'Environment': 'Production'
                    }
                )
                
                print(f"✅ Function '{function_name}' created successfully!")
                print(f"   Function ARN: {response['FunctionArn']}")
            else:
                raise

    def deploy_all(self):
        """Deploy all components."""
        print("🚀 Starting Resume Tailor deployment...")
        print(f"   Region: {self.region}")
        print(f"   Profile: {self.profile or 'default'}")
        print(f"   Bucket: {self.bucket_name or 'not specified'}")
        print()
        
        try:
            # Step 1: Get IAM role
            if self.role_arn:
                print(f"🔐 Using provided role ARN: {self.role_arn}")
                role_arn = self.role_arn
            else:
                print("🔐 Finding Lambda execution role...")
                role_arn = self.get_existing_lambda_role()
            print()
            
            # Step 2: Deploy Lambda functions
            print("⚡ Deploying Lambda functions...")
            successful_deployments = 0
            failed_deployments = 0
            
            for function_name in self.lambda_functions.keys():
                try:
                    self.deploy_lambda_function(function_name, role_arn)
                    successful_deployments += 1
                except Exception as e:
                    print(f"❌ Failed to deploy {function_name}: {e}")
                    failed_deployments += 1
                    continue
            print()
            
            print("🎉 Lambda deployment completed!")
            print(f"   ✅ Successful: {successful_deployments}")
            print(f"   ❌ Failed: {failed_deployments}")
            print()
            print("📋 Next steps:")
            print("   1. Test your Lambda functions")
            print("   2. Update API Gateway endpoints if needed")
            print("   3. Monitor CloudWatch logs for any issues")
            
        except Exception as e:
            print(f"💥 Deployment failed: {e}")
            sys.exit(1)

def main():
    parser = argparse.ArgumentParser(description='Deploy Resume Tailor Lambda functions')
    parser.add_argument('--region', default='us-east-2', help='AWS region (default: us-east-2)')
    parser.add_argument('--profile', help='AWS profile to use (default: default profile)')
    parser.add_argument('--bucket-name', help='S3 bucket name for file storage')
    parser.add_argument('--role-arn', help='Lambda execution role ARN (will auto-detect if not provided)')
    parser.add_argument('--dry-run', action='store_true', help='Show what would be deployed without actually deploying')
    
    args = parser.parse_args()
    
    if args.dry_run:
        print("🔍 Dry run mode - showing what would be deployed:")
        deployer = LambdaDeployer(args.region, args.profile, args.bucket_name, args.role_arn)
        print(f"Region: {args.region}")
        print(f"Profile: {args.profile or 'default'}")
        print(f"Bucket: {args.bucket_name or 'not specified'}")
        print(f"Role ARN: {args.role_arn or 'auto-detect'}")
        print("Lambda functions to deploy:")
        for name, config in deployer.lambda_functions.items():
            print(f"  - {name}: {config['description']}")
        return
    
    # Change to backend directory
    script_dir = Path(__file__).parent
    os.chdir(script_dir)
    
    # Run deployment
    deployer = LambdaDeployer(args.region, args.profile, args.bucket_name, args.role_arn)
    deployer.deploy_all()

if __name__ == "__main__":
    main() 