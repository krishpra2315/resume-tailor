# Resume Tailor Deployment Guide

This guide explains how to deploy the Resume Tailor application with rate limiting to AWS.

## 🚀 Quick Start

### Prerequisites

1. **AWS CLI configured** with appropriate credentials
2. **Python 3.7+** with `boto3` installed
3. **Lambda execution role** with appropriate permissions (will auto-detect or you can specify)
4. **IAM permissions** for:
   - Lambda (create, update, invoke)
   - IAM (read roles - for auto-detection)

### Simple Deployment

```bash
# Navigate to backend directory
cd backend

# Deploy with default settings (will auto-detect role)
./deploy.sh

# Or specify your S3 bucket and/or role ARN
./deploy.sh --bucket your-resume-bucket-name --role-arn arn:aws:iam::123456789012:role/LambdaRole
```

### Advanced Deployment Options

```bash
# Deploy to specific region with custom profile
./deploy.sh --region us-west-2 --profile my-aws-profile

# Specify Lambda execution role ARN directly
./deploy.sh --role-arn arn:aws:iam::123456789012:role/MyLambdaRole

# Dry run to see what would be deployed
./deploy.sh --dry-run

# Full customization
./deploy.sh --region us-east-1 --profile production --bucket my-bucket --role-arn arn:aws:iam::123456789012:role/LambdaRole
```

## 📋 What Gets Deployed

### Lambda Functions

| Function                | Description               | Memory | Timeout | Rate Limited          |
| ----------------------- | ------------------------- | ------ | ------- | --------------------- |
| `score_resume`          | Score resumes using AI    | 512MB  | 300s    | ✅ Textract + Bedrock |
| `tailor_master_resume`  | Tailor resumes with AI    | 256MB  | 180s    | ✅ Bedrock            |
| `process_master_resume` | Process uploaded resumes  | 512MB  | 300s    | ✅ Textract + Bedrock |
| `upload_resume`         | Upload for auth users     | 256MB  | 60s     | ❌                    |
| `upload_resume_guest`   | Upload for guests         | 256MB  | 60s     | ❌                    |
| `get_tailored_resumes`  | Retrieve tailored resumes | 256MB  | 30s     | ❌                    |
| `get_master_resume`     | Retrieve master resume    | 256MB  | 30s     | ❌                    |
| `get_score`             | Retrieve scoring results  | 256MB  | 30s     | ❌                    |
| `get_usage_stats`       | Get usage statistics      | 256MB  | 30s     | ❌                    |

## 🔧 Configuration

### Environment Variables

The deployment script automatically sets these environment variables:

- `BUCKET_NAME`: Your S3 bucket for file storage

### Rate Limits (Current Configuration)

```python
# Guest users (identified by IP)
'guest': {
    'bedrock_requests': 5,     # 5 AI requests per day
    'textract_requests': 10    # 10 document processing per day
},

# Authenticated users (identified by user ID)
'user': {
    'bedrock_requests': 50,    # 50 AI requests per day
    'textract_requests': 100   # 100 document processing per day
}
```

## 🛠️ Manual Deployment (Python)

If you prefer to use the Python script directly:

```bash
cd backend

# Install dependencies
pip install boto3

# Deploy with Python
python3 deploy.py --bucket-name your-bucket

# Other options
python3 deploy.py --region us-west-2 --profile my-profile --bucket-name my-bucket
```

## 📊 Post-Deployment Verification

### 1. Check DynamoDB Table

```bash
aws dynamodb describe-table --table-name ApiUsageLimits --region us-east-2
```

### 2. Test Lambda Function

```bash
# Test the usage stats function
aws lambda invoke \
    --function-name get_usage_stats \
    --region us-east-2 \
    response.json

cat response.json
```

### 3. View CloudWatch Logs

```bash
# List log groups
aws logs describe-log-groups \
    --log-group-name-prefix '/aws/lambda/' \
    --region us-east-2

# View specific function logs
aws logs describe-log-streams \
    --log-group-name '/aws/lambda/score_resume' \
    --region us-east-2
```

## 🔄 Updates and Redeployment

To update your Lambda functions:

```bash
# Redeploy all functions
./deploy.sh

# The script will automatically update existing functions
```

## 🐛 Troubleshooting

### Common Issues

1. **Permission Denied**

   ```
   Error: User not authorized to perform action
   ```

   **Solution**: Ensure your AWS credentials have the required IAM permissions

2. **Bucket Not Found**

   ```
   Error: The specified bucket does not exist
   ```

   **Solution**: Create the S3 bucket first or use `--bucket-name` parameter

3. **Region Mismatch**

   ```
   Error: Invalid region specified
   ```

   **Solution**: Use a valid AWS region with `--region` parameter

4. **Rate Limiter Import Error**
   ```
   Error: Unable to import module 'rate_limiter'
   ```
   **Solution**: Ensure `rate_limiter.py` is copied to each Lambda directory

### Debug Mode

Enable verbose logging by setting environment variable:

```bash
export AWS_DEFAULT_OUTPUT=json
./deploy.sh --dry-run  # See what would be deployed
```

## 📁 File Structure After Deployment

```
backend/
├── deploy.py              # Main deployment script
├── deploy.sh              # Shell wrapper script
├── deployments/           # Generated Lambda zip files
│   ├── score_resume.zip
│   ├── tailor_master_resume.zip
│   └── ...
└── lambdas/
    ├── score_resume/
    │   ├── lambda_function.py
    │   └── rate_limiter.py    # Local copy
    ├── tailor_master_resume/
    │   ├── lambda_function.py
    │   └── rate_limiter.py    # Local copy
    └── ...
```

## 🔐 Security Considerations

1. **IAM Permissions**: The deployment creates minimal required permissions
2. **Rate Limiting**: Prevents API abuse and cost overruns
3. **IP-based Guest Tracking**: Guests identified by IP address
4. **TTL Cleanup**: Old rate limit data automatically removed

## 💰 Cost Optimization

The deployment includes several cost optimization features:

- **On-demand DynamoDB**: Pay only for what you use
- **TTL cleanup**: Automatic data deletion prevents storage costs
- **Rate limiting**: Prevents unexpected Bedrock/Textract charges
- **Right-sized Lambda**: Memory allocation optimized per function

## 📞 Support

If you encounter issues:

1. Check CloudWatch logs for error details
2. Verify IAM permissions
3. Ensure all prerequisite services are available in your region
4. Review the rate limiting configuration in `rate_limiter.py`
