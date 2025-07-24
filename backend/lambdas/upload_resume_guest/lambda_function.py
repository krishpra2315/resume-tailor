import json
import boto3
import base64
import uuid
import os
import sys
import time

# Add the parent directory to sys.path to import rate_limiter and logger
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from logger_utils import create_logger
from rate_limiter import create_rate_limiter

s3 = boto3.client('s3')
BUCKET_NAME = 'resume-tailor-bucket.kp'


def lambda_handler(event, context):
    # Initialize logger
    logger = create_logger('upload_resume_guest')
    logger.log_function_start(event, context)
    
    try:
        logger.info("Parsing guest upload request")
        body = json.loads(event['body'])
        file_data = base64.b64decode(body['file'])
        file_name = f"{uuid.uuid4()}.pdf"
        s3_key = f"guest/{file_name}"

        logger.info("Guest upload request parsed successfully", {
            'file_size_bytes': len(file_data),
            'generated_filename': file_name,
            's3_key': s3_key,
            'bucket': BUCKET_NAME
        })

        # Upload to S3
        logger.info("Starting S3 upload for guest file")
        s3_start = time.time()
        s3.put_object(Bucket=BUCKET_NAME, Key=s3_key, Body=file_data)
        s3_duration = (time.time() - s3_start) * 1000
        
        logger.info("Guest file uploaded to S3 successfully", {
            'duration_ms': round(s3_duration, 2),
            's3_key': s3_key,
            'bucket': BUCKET_NAME,
            'file_size_bytes': len(file_data)
        })

        return {
            'statusCode': 200,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps({
                's3_key': s3_key
            })
        }

    except json.JSONDecodeError as e:
        logger.error("Invalid JSON in guest upload request body", {'error': str(e)})
        return {
            'statusCode': 400,
            'body': json.dumps({'error': 'Invalid JSON in request body'})
        }
    except Exception as e:
        logger.error("Unexpected error during guest resume upload", {'error': str(e)})
        return {
            'statusCode': 500,
            'body': json.dumps({'error': f'Internal Server Error: {str(e)}'})
        }
