import json
import os
import boto3
import sys
import time

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from logger_utils import create_logger

BUCKET_NAME = 'resume-tailor-bucket.kp'
s3 = boto3.client('s3')
dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table("ResumeMetadata")


def lambda_handler(event, context):
    # Initialize logger
    logger = create_logger('get_master_resume')
    logger.log_function_start(event, context)
    
    try:
        logger.info("Extracting user claims from request context")
        claims = event.get('requestContext', {}).get('authorizer', {}).get('jwt', {}).get('claims', {})
        user_id = claims.get('sub')

        if not user_id:
            logger.error("Missing user ID in claims", {
                'has_claims': bool(claims),
                'claims_keys': list(claims.keys()) if claims else []
            })
            return {
                'statusCode': 401,
                'body': json.dumps({'error': 'Unauthorized: User ID not found in request context'})
            }
        
        logger.info("User authenticated successfully", {
            'user_id': user_id
        })
        
    except Exception as e:
        logger.error("Error extracting user claims", {'error': str(e)})
        return {
            'statusCode': 500,
            'body': json.dumps({'error': f'Internal Server Error: {str(e)}'})
        }  
        
    try:
        # Generate presigned URL for master resume PDF
        logger.info("Generating presigned URL for master resume", {
            'bucket': BUCKET_NAME,
            'file_key': f'users/master/{user_id}.pdf'
        })
        
        s3_start = time.time()
        url = s3.generate_presigned_url(
            ClientMethod='get_object',
            Params={
                'Bucket': BUCKET_NAME,
                'Key': f'users/master/{user_id}.pdf',
                'ResponseContentDisposition': 'inline',
                'ResponseContentType': 'application/pdf'

            },
            ExpiresIn=3600
        )
        s3_duration = (time.time() - s3_start) * 1000
        
        logger.info("Presigned URL generated successfully", {
            'duration_ms': round(s3_duration, 2),
            'expires_in_seconds': 3600
        })

        # Get master resume metadata from DynamoDB
        logger.info("Retrieving master resume metadata from DynamoDB", {
            'table_name': 'ResumeMetadata',
            'user_id': user_id
        })
        
        dynamodb_start = time.time()
        response = table.get_item(Key={'resume_id': user_id})
        dynamodb_duration = (time.time() - dynamodb_start) * 1000
        
        item = response.get('Item')

        if not item:
            logger.warning("Master resume metadata not found", {
                'user_id': user_id,
                'duration_ms': round(dynamodb_duration, 2)
            })
            return {
                'statusCode': 404,
                'body': json.dumps({'error': f'Master resume not found for user: {user_id}'}),
            }

        logger.info("Master resume metadata retrieved successfully", {
            'duration_ms': round(dynamodb_duration, 2),
            'has_entries': 'entries' in item,
            'entries_count': len(item.get('entries', [])) if item.get('entries') else 0
        })
        
        response_data = {
            'fileUrl': url,
            'resumeData': item.get('entries', [])
        }
        
        logger.info("Master resume retrieval completed successfully", {
            'total_s3_duration_ms': round(s3_duration, 2),
            'total_dynamodb_duration_ms': round(dynamodb_duration, 2),
            'entries_returned': len(item.get('entries', []))
        })

        return {
            'statusCode': 200,
            'body': json.dumps(response_data),
        }

    except Exception as e:
        logger.error("Unexpected error retrieving master resume", {'error': str(e)})
        return {
            'statusCode': 500,
            'body': json.dumps({'error': f'Internal Server Error: {str(e)}'})
        }
