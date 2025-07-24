import json
import base64
import boto3
import os
import sys
import re
from datetime import datetime
import time

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from logger_utils import create_logger
from rate_limiter import create_rate_limiter

s3 = boto3.client("s3")
textract = boto3.client("textract")
bedrock = boto3.client("bedrock-runtime", region_name="us-east-2")
dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table("ResumeMetadata")

MODEL_ID = 'arn:aws:bedrock:us-east-2:429744659578:inference-profile/us.anthropic.claude-3-haiku-20240307-v1:0'
BUCKET_NAME = 'resume-tailor-bucket.kp'


def clean_json_string(text):
    """Clean control characters from text that might break JSON parsing"""
    # Remove or replace common control characters that break JSON parsing
    # Keep newlines and tabs as they're valid in JSON strings when properly escaped
    cleaned = re.sub(r'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '', text)
    return cleaned


def lambda_handler(event, context):
    # Initialize logger
    logger = create_logger('process_master_resume')
    logger.log_function_start(event, context)
    
    try:
        logger.info("Parsing request body")
        body = json.loads(event["body"])
        claims = event.get('requestContext', {}).get('authorizer', {}).get('jwt', {}).get('claims', {})
        user_id = claims.get('sub')
        base64_file = body["file"]
        
        logger.info("Request parsed successfully", {
            'user_id': user_id,
            'file_size_bytes': len(base64_file) if base64_file else 0,
            'has_claims': bool(claims)
        })
        
        # Initialize rate limiter and check limits
        logger.info("Initializing rate limiter")
        rate_limiter = create_rate_limiter()
        identifier, user_type = rate_limiter.get_user_identifier(event, claims)
        
        logger.info("User identified", {
            'user_type': user_type,
            'identifier': identifier if not identifier.startswith('guest_') else 'guest_***'
        })
        
        # Check both Textract and Bedrock rate limits before processing
        logger.info("Checking Textract rate limits")
        textract_success, textract_count, textract_limit = rate_limiter.check_and_increment_usage(
            identifier, user_type, 'textract_requests'
        )
        
        logger.log_rate_limit_check(identifier, user_type, 'textract_requests', textract_success, textract_count, textract_limit)
        
        if not textract_success:
            logger.warning("Textract rate limit exceeded", {
                'current_count': textract_count,
                'limit': textract_limit
            })
            return {
                'statusCode': 429,
                'headers': {
                    'Content-Type': 'application/json',
                    'X-RateLimit-Limit': str(textract_limit),
                    'X-RateLimit-Remaining': '0',
                    'X-RateLimit-Reset': str(int(time.time()) + (24 * 3600))
                },
                'body': json.dumps({
                    'error': 'Daily Textract API limit exceeded',
                    'message': f'You have exceeded the daily limit of {textract_limit} document processing requests. Please try again tomorrow.',
                    'current_usage': textract_count,
                    'daily_limit': textract_limit,
                    'user_type': user_type
                })
            }
        
        logger.info("Checking Bedrock rate limits")
        bedrock_success, bedrock_count, bedrock_limit = rate_limiter.check_and_increment_usage(
            identifier, user_type, 'bedrock_requests'
        )
        
        logger.log_rate_limit_check(identifier, user_type, 'bedrock_requests', bedrock_success, bedrock_count, bedrock_limit)
        
        if not bedrock_success:
            logger.warning("Bedrock rate limit exceeded", {
                'current_count': bedrock_count,
                'limit': bedrock_limit
            })
            return {
                'statusCode': 429,
                'headers': {
                    'Content-Type': 'application/json',
                    'X-RateLimit-Limit': str(bedrock_limit),
                    'X-RateLimit-Remaining': '0',
                    'X-RateLimit-Reset': str(int(time.time()) + (24 * 3600))
                },
                'body': json.dumps({
                    'error': 'Daily Bedrock API limit exceeded',
                    'message': f'You have exceeded the daily limit of {bedrock_limit} AI processing requests. Please try again tomorrow.',
                    'current_usage': bedrock_count,
                    'daily_limit': bedrock_limit,
                    'user_type': user_type
                })
            }

        # Step 1: Upload PDF to S3
        logger.info("Uploading PDF to S3")
        s3_key = f"users/master/{user_id}.pdf"
        s3_start = time.time()
        s3.put_object(
            Bucket=BUCKET_NAME,
            Key=s3_key,
            Body=base64.b64decode(base64_file),
            ContentType="application/pdf",
            ContentDisposition="inline"
        )
        s3_upload_duration = (time.time() - s3_start) * 1000
        
        logger.info("PDF uploaded to S3 successfully", {
            'duration_ms': round(s3_upload_duration, 2),
            's3_key': s3_key,
            'bucket': BUCKET_NAME
        })

        # Step 2: Start Textract job
        logger.info("Starting Textract document analysis job")
        textract_start = time.time()
        response = textract.start_document_text_detection(
            DocumentLocation={"S3Object": {"Bucket": BUCKET_NAME, "Name": s3_key}}
        )
        job_id = response["JobId"]
        
        logger.info("Textract job started", {
            'job_id': job_id,
            'bucket': BUCKET_NAME,
            's3_key': s3_key
        })

        # Poll for job completion
        max_retries = 20
        delay = 1  # seconds
        logger.info("Polling for Textract job completion", {
            'max_retries': max_retries,
            'delay_seconds': delay
        })
        
        for j in range(max_retries):
            result = textract.get_document_text_detection(JobId=job_id)
            status = result["JobStatus"]
            
            logger.info(f"Textract job status check {j+1}/{max_retries}", {
                'job_id': job_id,
                'status': status,
                'attempt': j+1
            })

            if status == "SUCCEEDED":
                break
            elif status in ("FAILED", "PARTIAL_SUCCESS"):
                logger.error("Textract job failed", {
                    'job_id': job_id,
                    'status': status,
                    'attempts': j+1
                })
                raise Exception(f"Textract job failed with status: {status}")
            time.sleep(delay)
        else:
            logger.error("Textract job timeout", {
                'job_id': job_id,
                'max_retries': max_retries,
                'total_wait_time_seconds': max_retries * delay
            })
            raise TimeoutError("Textract job did not finish in time.")
    
        textract_job_duration = (time.time() - textract_start) * 1000
        logger.info("Textract job completed successfully", {
            'job_id': job_id,
            'duration_ms': round(textract_job_duration, 2),
            'attempts': j+1
        })

        # Collect all pages
        logger.info("Collecting Textract results from all pages")
        all_blocks = []
        next_token = None
        page_count = 0
        
        while True:
            if next_token:
                page_result = textract.get_document_text_detection(JobId=job_id, NextToken=next_token)
            else:
                page_result = result

            all_blocks.extend(page_result["Blocks"])
            next_token = page_result.get("NextToken")
            page_count += 1
            
            logger.debug(f"Processed Textract result page {page_count}", {
                'blocks_in_page': len(page_result["Blocks"]),
                'has_next_token': bool(next_token)
            })
            
            if not next_token:
                break
        
        logger.info("All Textract results collected", {
            'total_pages': page_count,
            'total_blocks': len(all_blocks)
        })
            
        resume_text = "\n".join([b["Text"] for b in all_blocks if b["BlockType"] == "LINE"])
        
        logger.info("Resume text extracted from Textract results", {
            'text_length': len(resume_text),
            'line_blocks': len([b for b in all_blocks if b["BlockType"] == "LINE"])
        })

        # Step 3: Send to Claude to extract structured items
        logger.info("Preparing prompt for Bedrock AI analysis")
        prompt = f"""
Extract the following resume into structured JSON format.

Return a list of items like:
[
  {{
    "type": "experience" | "education" | "project" | "skills" | "certifications" | "userInfo",
    "title": "...",
    "organization": "...",
    "startDate": "...",
    "endDate": "...",
    "description": "..."
  }},
  ...
]

For the userInfo type, return the user's name as the title, then their email, phone number, location, and any urls provided liked github or linkedin in the description.

Do not return anything but the JSON list of items.

--- RESUME START ---
{resume_text}
--- RESUME END ---
"""

        logger.info("Starting Bedrock AI analysis", {
            'model_id': MODEL_ID,
            'prompt_length': len(prompt),
            'resume_text_length': len(resume_text)
        })

        bedrock_start = time.time()
        bedrock_response = bedrock.invoke_model(
            modelId=MODEL_ID,
            body=json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "messages": [
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                "max_tokens": 2048,
                "temperature": 0.3
            }),
            contentType="application/json",
            accept="application/json",
        )
        bedrock_duration = (time.time() - bedrock_start) * 1000

        logger.info("Bedrock AI analysis completed", {
            'duration_ms': round(bedrock_duration, 2)
        })

        output = json.loads(bedrock_response['body'].read())
        
        # Clean control characters before parsing JSON
        raw_text = output['content'][0]['text']
        cleaned_text = clean_json_string(raw_text)
        content = json.loads(cleaned_text)
        
        logger.info("AI analysis results processed", {
            'extracted_items_count': len(content) if isinstance(content, list) else 0,
            'content_type': type(content).__name__
        })

        # Step 4: Save to DynamoDB
        logger.info("Saving processed resume to DynamoDB")
        dynamodb_start = time.time()
        try:
            table.put_item(
                Item={
                    "resume_id": user_id,
                    "s3_key": s3_key,
                    "entries": content,
                    "updatedAt": datetime.now().isoformat()
                }
            )
            dynamodb_duration = (time.time() - dynamodb_start) * 1000
            logger.info("Resume saved to DynamoDB successfully", {
                'duration_ms': round(dynamodb_duration, 2),
                'table_name': 'ResumeMetadata',
                'user_id': user_id
            })
        except Exception as e:
            dynamodb_duration = (time.time() - dynamodb_start) * 1000
            logger.error("Failed to save resume to DynamoDB", {
                'duration_ms': round(dynamodb_duration, 2),
                'error': str(e),
                'table_name': 'ResumeMetadata',
                'user_id': user_id
            })
            return {
                "statusCode": 500,
                "body": json.dumps({"error": "Failed to save to DynamoDB", "details": str(e)})
            }

        logger.info("Master resume processing completed successfully", {
            'total_s3_duration_ms': round(s3_upload_duration, 2),
            'total_textract_duration_ms': round(textract_job_duration, 2),
            'total_bedrock_duration_ms': round(bedrock_duration, 2),
            'total_dynamodb_duration_ms': round(dynamodb_duration, 2),
            'extracted_items': len(content) if isinstance(content, list) else 0
        })

        return {
            "statusCode": 200,
            "headers": {
                "Content-Type": "application/json",
                "X-RateLimit-Textract-Limit": str(textract_limit),
                "X-RateLimit-Textract-Remaining": str(textract_limit - textract_count),
                "X-RateLimit-Bedrock-Limit": str(bedrock_limit),
                "X-RateLimit-Bedrock-Remaining": str(bedrock_limit - bedrock_count),
                "X-RateLimit-Reset": str(int(time.time()) + (24 * 3600))
            },
            "body": json.dumps({
                "s3Key": s3_key
            })
        }

    except json.JSONDecodeError as e:
        logger.error("Invalid JSON in request body", {'error': str(e)})
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "Invalid JSON in request body"})
        }
    except KeyError as e:
        logger.error("Missing required field in request", {'missing_field': str(e)})
        return {
            "statusCode": 400,
            "body": json.dumps({"error": f"Missing required field: {str(e)}"})
        }
    except Exception as e:
        logger.error("Unexpected error during master resume processing", {'error': str(e)})
        return {
            "statusCode": 500,
            "body": json.dumps({"error": f"Internal Server Error: {str(e)}"})
        }
