import boto3
import json
import os
import sys
import time

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from logger_utils import create_logger

s3 = boto3.client("s3")
BUCKET_NAME = 'resume-tailor-bucket.kp'


def lambda_handler(event, context):
    # Initialize logger
    logger = create_logger('get_tailored_resumes')
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
                "statusCode": 401,
                "body": json.dumps({"error": "Unauthorized: User ID not found"}),
            }
        
        logger.info("User authenticated successfully", {
            'user_id': user_id
        })
        
        prefix = f"users/tailored/{user_id}/"
        
        logger.info("Starting S3 file listing", {
            'bucket': BUCKET_NAME,
            'prefix': prefix
        })

        # List files in S3
        fileKeys = []
        files = []
        s3_list_start = time.time()
        
        paginator = s3.get_paginator("list_objects_v2")
        page_count = 0
        total_objects = 0
        
        for page in paginator.paginate(Bucket=BUCKET_NAME, Prefix=prefix):
            page_count += 1
            objects_in_page = len(page.get("Contents", []))
            total_objects += objects_in_page
            
            logger.debug(f"Processing S3 page {page_count}", {
                'objects_in_page': objects_in_page,
                'bucket': BUCKET_NAME,
                'prefix': prefix
            })
            
            for obj in page.get("Contents", []):
                fileKeys.append(obj["Key"])
        
        s3_list_duration = (time.time() - s3_list_start) * 1000
        
        logger.info("S3 file listing completed", {
            'duration_ms': round(s3_list_duration, 2),
            'total_pages': page_count,
            'total_files_found': len(fileKeys),
            'bucket': BUCKET_NAME
        })
        
        # Generate presigned URLs for each file
        logger.info("Generating presigned URLs for tailored resumes")
        url_generation_start = time.time()
        successful_urls = 0
        failed_urls = 0
        
        for key in fileKeys:
            try:
                url = s3.generate_presigned_url(
                    ClientMethod='get_object',
                    Params={
                        'Bucket': BUCKET_NAME,
                        'Key': key,
                        'ResponseContentDisposition': 'inline',
                        'ResponseContentType': 'application/pdf'

                    },
                    ExpiresIn=3600
                )

                files.append({"name": key.split("/")[3], "url": url})
                successful_urls += 1
                
            except Exception as e:
                failed_urls += 1
                logger.warning("Failed to generate presigned URL for file", {
                    'file_key': key,
                    'error': str(e)
                })
        
        url_generation_duration = (time.time() - url_generation_start) * 1000
        
        logger.info("Presigned URL generation completed", {
            'duration_ms': round(url_generation_duration, 2),
            'successful_urls': successful_urls,
            'failed_urls': failed_urls,
            'expires_in_seconds': 3600
        })
        
        logger.info("Tailored resumes retrieval completed successfully", {
            'total_s3_list_duration_ms': round(s3_list_duration, 2),
            'total_url_generation_duration_ms': round(url_generation_duration, 2),
            'files_returned': len(files),
            'user_id': user_id
        })

        return {
            "statusCode": 200,
            "body": json.dumps({
                "files": files,
            }),
        }

    except Exception as e:
        logger.error("Unexpected error retrieving tailored resumes", {'error': str(e)})
        return {
            "statusCode": 500,
            "body": json.dumps({"error": f"Internal Server Error: {str(e)}"}),
        }
