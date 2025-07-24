import json
import boto3
import base64
import uuid
import os
import sys
import time

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from logger_utils import create_logger

s3 = boto3.client('s3')
BUCKET_NAME = 'resume-tailor-bucket.kp'


def lambda_handler(event, context):
    # Initialize logger
    logger = create_logger('upload_resume')
    logger.log_function_start(event, context)
    
    try:
        logger.info("Extracting user claims from request context")
        try:
            claims = event.get('requestContext', {}).get('authorizer', {}).get('jwt', {}).get('claims', {})
            user_id = claims.get('sub')

            if not user_id:
                logger.error("Missing user ID in claims", {
                    'has_request_context': 'requestContext' in event,
                    'has_authorizer': 'authorizer' in event.get('requestContext', {}),
                    'has_claims': bool(claims),
                    'claims_keys': list(claims.keys()) if claims else []
                })
                return {
                    'statusCode': 500,
                    'headers': {
                        'Content-Type': 'application/json'
                    },
                    'body': json.dumps({'error': 'Internal Server Error: User ID not found in request context'})
                }
            
            logger.info("User authenticated successfully", {
                'user_id': user_id,
                'has_claims': True
            })
            
        except Exception as e:
            logger.error("Error accessing authorization claims", {
                'error': str(e),
                'event_keys': list(event.keys()) if isinstance(event, dict) else str(type(event))
            })
            return {
                'statusCode': 500,
                'headers': {
                    'Content-Type': 'application/json'
                },
                'body': json.dumps({'error': 'Internal Server Error: Could not retrieve authorization claims'})
            }

        logger.info("Parsing request body")
        body = json.loads(event['body'])
        file_data = base64.b64decode(body['file'])
        
        # Determine upload type and S3 key
        if 'filename' in body:
            file_name = body['filename']
            s3_key = f"users/tailored/{user_id}/{file_name}" # filename only for tailored resumes
            upload_type = 'tailored'
            logger.info("Tailored resume upload detected", {
                'filename': file_name,
                'user_id': user_id
            })
        else:
            file_name = f"{uuid.uuid4()}.pdf"
            s3_key = f"users/uploads/{user_id}/{file_name}"
            upload_type = 'general'
            logger.info("General resume upload detected", {
                'generated_filename': file_name,
                'user_id': user_id
            })

        logger.info("File processing completed", {
            'upload_type': upload_type,
            'file_size_bytes': len(file_data),
            's3_key': s3_key,
            'bucket': BUCKET_NAME
        })

        # Upload to S3
        logger.info("Starting S3 upload")
        s3_start = time.time()
        s3.put_object(Bucket=BUCKET_NAME, Key=s3_key, Body=file_data)
        s3_duration = (time.time() - s3_start) * 1000
        
        logger.info("S3 upload completed successfully", {
            'duration_ms': round(s3_duration, 2),
            's3_key': s3_key,
            'bucket': BUCKET_NAME,
            'file_size_bytes': len(file_data)
        })

        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json'
            },
            'body': json.dumps({
                's3_key': s3_key
            })
        }

    except json.JSONDecodeError as e:
        logger.error("Invalid JSON in request body", {'error': str(e)})
        return {
            'statusCode': 400,
            'headers': {
                'Content-Type': 'application/json'
            },
            'body': json.dumps({'error': 'Invalid JSON in request body'})
        }
    except Exception as e:
        logger.error("Unexpected error during resume upload", {'error': str(e)})
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json'
            },
            'body': json.dumps({'error': f'Internal Server Error: {str(e)}'})
        }
