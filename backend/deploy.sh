#!/bin/bash

# Resume Tailor Deployment Script
# Simple wrapper around the Python deployment script

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
REGION="us-east-2"
PROFILE=""
BUCKET_NAME=""
ROLE_ARN=""
DRY_RUN=false

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to show usage
show_usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Deploy Resume Tailor Lambda functions to AWS

OPTIONS:
    -r, --region REGION        AWS region (default: us-east-2)
    -p, --profile PROFILE      AWS profile to use
    -b, --bucket BUCKET_NAME   S3 bucket name for file storage
    --role-arn ROLE_ARN       Lambda execution role ARN (will auto-detect if not provided)
    -d, --dry-run             Show what would be deployed without deploying
    -h, --help                Show this help message

EXAMPLES:
    # Deploy with default settings
    $0

    # Deploy to specific region with custom profile
    $0 --region us-west-2 --profile my-profile

    # Deploy with specific S3 bucket
    $0 --bucket my-resume-bucket

    # Dry run to see what would be deployed
    $0 --dry-run

PREREQUISITES:
    - AWS CLI configured with appropriate credentials
    - Python 3.7+ with boto3 installed
    - Appropriate IAM permissions for Lambda, DynamoDB, S3, etc.

EOF
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -r|--region)
            REGION="$2"
            shift 2
            ;;
        -p|--profile)
            PROFILE="$2"
            shift 2
            ;;
        -b|--bucket)
            BUCKET_NAME="$2"
            shift 2
            ;;
        --role-arn)
            ROLE_ARN="$2"
            shift 2
            ;;
        -d|--dry-run)
            DRY_RUN=true
            shift
            ;;
        -h|--help)
            show_usage
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    print_error "Python 3 is required but not installed"
    exit 1
fi

# Check if AWS CLI is configured (optional but recommended)
if command -v aws &> /dev/null; then
    if [ -n "$PROFILE" ]; then
        if ! aws configure list --profile "$PROFILE" &> /dev/null; then
            print_warning "AWS profile '$PROFILE' not found"
        fi
    fi
else
    print_warning "AWS CLI not found - make sure you have AWS credentials configured"
fi

# Build Python command
PYTHON_CMD="python3 deploy.py --region $REGION"

if [ -n "$PROFILE" ]; then
    PYTHON_CMD="$PYTHON_CMD --profile $PROFILE"
fi

if [ -n "$BUCKET_NAME" ]; then
    PYTHON_CMD="$PYTHON_CMD --bucket-name $BUCKET_NAME"
fi

if [ -n "$ROLE_ARN" ]; then
    PYTHON_CMD="$PYTHON_CMD --role-arn $ROLE_ARN"
fi

if [ "$DRY_RUN" = true ]; then
    PYTHON_CMD="$PYTHON_CMD --dry-run"
fi

# Show configuration
print_status "Resume Tailor Deployment Configuration:"
echo "  Region: $REGION"
echo "  Profile: ${PROFILE:-default}"
echo "  Bucket: ${BUCKET_NAME:-not specified}"
echo "  Role ARN: ${ROLE_ARN:-auto-detect}"
echo "  Dry Run: $DRY_RUN"
echo

# Ask for confirmation if not dry run
if [ "$DRY_RUN" = false ]; then
    read -p "Do you want to proceed with the deployment? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_status "Deployment cancelled"
        exit 0
    fi
    echo
fi

# Change to script directory
cd "$(dirname "$0")"

# Check if required files exist
if [ ! -f "deploy.py" ]; then
    print_error "deploy.py not found in current directory"
    exit 1
fi

if [ ! -d "lambdas" ]; then
    print_error "lambdas directory not found"
    exit 1
fi

# Run the deployment
print_status "Running deployment command: $PYTHON_CMD"
echo

if eval $PYTHON_CMD; then
    print_success "Deployment completed successfully!"
    
    if [ "$DRY_RUN" = false ]; then
        echo
        print_status "Useful commands:"
        echo "  # View deployment logs:"
        echo "  aws logs describe-log-groups --log-group-name-prefix '/aws/lambda/' --region $REGION"
        echo
        echo "  # Test a function:"
        echo "  aws lambda invoke --function-name get_usage_stats --region $REGION output.json"
        echo
        echo "  # Monitor DynamoDB table:"
        echo "  aws dynamodb describe-table --table-name ApiUsageLimits --region $REGION"
    fi
else
    print_error "Deployment failed!"
    exit 1
fi 