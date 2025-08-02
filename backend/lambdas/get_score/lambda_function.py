import json
import boto3
from boto3.dynamodb.conditions import Key
import os
import base64
import sys
import time

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from logger_utils import create_logger

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table("ResumeAnalysisResults")
s3 = boto3.client('s3')

BUCKET_NAME = 'resume-tailor-bucket.kp'


def lambda_handler(event, context):
    # Initialize logger
    logger = create_logger('get_score')
    logger.log_function_start(event, context)
    
    try:
        logger.info("Extracting query parameters")
        query_parameters = event.get('queryStringParameters', {})
        if not query_parameters or 'resultId' not in query_parameters:
            logger.warning("Missing resultId in query parameters", {
                'has_query_params': bool(query_parameters),
                'query_param_keys': list(query_parameters.keys()) if query_parameters else []
            })
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'resultId is required in query parameters'})
            }
        
        result_id = query_parameters['resultId']
        logger.info("Query parameters extracted successfully", {
            'result_id': result_id
        })
        
        # Get result from DynamoDB
        logger.info("Retrieving analysis result from DynamoDB", {
            'table_name': 'ResumeAnalysisResults',
            'result_id': result_id
        })
        
        dynamodb_start = time.time()
        response = table.get_item(Key={'resultId': result_id})
        dynamodb_duration = (time.time() - dynamodb_start) * 1000
        
        item = response.get('Item')

        if not item:
            logger.warning("Analysis result not found", {
                'result_id': result_id,
                'duration_ms': round(dynamodb_duration, 2)
            })
            return {
                'statusCode': 404,
                'body': json.dumps({'error': f'Result not found for resultId: {result_id}'}),
            }

        input_mode = item.get('inputMode', 'pdf')  # Default to 'pdf' for backward compatibility
        
        logger.info("Analysis result retrieved successfully", {
            'result_id': result_id,
            'duration_ms': round(dynamodb_duration, 2),
            'has_score': 'score' in item,
            'has_feedback': 'feedback' in item,
            'has_resume_id': 'resumeId' in item,
            'has_resume_text': 'resumeText' in item,
            'input_mode': input_mode
        })

        # Handle different input modes
        s3_duration = 0
        if input_mode == 'text':
            # For text input mode, return the resume text directly
            logger.info("Using direct resume text for text input mode")
            file_content = item.get('resumeText', '')
        else:
            # For PDF mode, generate presigned URL for resume file
            logger.info("Generating presigned URL for resume file", {
                'bucket': BUCKET_NAME,
                'resume_id': item.get('resumeId', 'unknown')
            })
            
            s3_start = time.time()
            try:
                file_content = s3.generate_presigned_url(
                    ClientMethod='get_object',
                    Params={
                        'Bucket': BUCKET_NAME,
                        'Key': item['resumeId'],
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

            except Exception as e:
                s3_duration = (time.time() - s3_start) * 1000
                logger.error("Failed to generate presigned URL for resume file", {
                    'duration_ms': round(s3_duration, 2),
                    'error': str(e),
                    'bucket': BUCKET_NAME,
                    'resume_id': item.get('resumeId', 'unknown')
                })
                return {
                    'statusCode': 404,
                    'body': json.dumps({'error': f'Error retrieving file from S3: {str(e)}'}),
                }

        # Prepare response
        response_data = {
            'resultId': result_id,
            'fileContent': file_content,
            'jobDescription': item.get('jobDescription', ''),
            'score': str(item['score']),
            'feedback': item['feedback']
        }
        
        logger.info("Score retrieval completed successfully", {
            'total_dynamodb_duration_ms': round(dynamodb_duration, 2),
            'total_s3_duration_ms': round(s3_duration, 2),
            'score': item.get('score'),
            'feedback_length': len(item.get('feedback', '')) if item.get('feedback') else 0
        })

        return {
            'statusCode': 200,
            'body': json.dumps(response_data),
        }

    except Exception as e:
        logger.error("Unexpected error retrieving score analysis", {'error': str(e)})
        return {
            'statusCode': 500,
            'body': json.dumps({'error': f'Internal Server Error: {str(e)}'}),
        }
