import json
import boto3
from boto3.dynamodb.conditions import Key
import os
import sys
import re
import time

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from logger_utils import create_logger
from rate_limiter import create_rate_limiter

s3 = boto3.client("s3")
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
    logger = create_logger('tailor_master_resume')
    logger.log_function_start(event, context)
    
    try:
        logger.info("Parsing request body")
        body = json.loads(event["body"])
        claims = event.get('requestContext', {}).get('authorizer', {}).get('jwt', {}).get('claims', {})
        user_id = claims.get('sub')
        job_description = body["jobDescription"]
        
        logger.info("Request parsed successfully", {
            'user_id': user_id,
            'job_description_length': len(job_description),
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
        
        # Check Bedrock rate limit before making the API call
        logger.info("Checking Bedrock rate limits")
        success, current_count, limit = rate_limiter.check_and_increment_usage(
            identifier, user_type, 'bedrock_requests'
        )
        
        logger.log_rate_limit_check(identifier, user_type, 'bedrock_requests', success, current_count, limit)
        
        if not success:
            logger.warning("Bedrock rate limit exceeded", {
                'current_count': current_count,
                'limit': limit
            })
            return {
                'statusCode': 429,
                'headers': {
                    'Content-Type': 'application/json',
                    'X-RateLimit-Limit': str(limit),
                    'X-RateLimit-Remaining': '0',
                    'X-RateLimit-Reset': str(int(time.time()) + (24 * 3600))
                },
                'body': json.dumps({
                    'error': 'Daily API limit exceeded',
                    'message': f'You have exceeded the daily limit of {limit} requests. Please try again tomorrow.',
                    'current_usage': current_count,
                    'daily_limit': limit,
                    'user_type': user_type
                })
            }

        # Get master resume from DynamoDB
        logger.info("Retrieving master resume from DynamoDB", {
            'table_name': 'ResumeMetadata',
            'user_id': user_id
        })
        
        dynamodb_start = time.time()
        response = table.get_item(Key={"resume_id": user_id})
        dynamodb_duration = (time.time() - dynamodb_start) * 1000
        
        if 'Item' not in response:
            logger.warning("No master resume found for user", {
                'user_id': user_id,
                'duration_ms': round(dynamodb_duration, 2)
            })
            return {
                'statusCode': 404,
                'body': json.dumps({'error': 'No master resume found. Please upload a master resume first.'})
            }
        
        resume_entries = response['Item']['entries']
        logger.info("Master resume retrieved successfully", {
            'duration_ms': round(dynamodb_duration, 2),
            'entries_count': len(resume_entries) if isinstance(resume_entries, list) else 0
        })

        # Prepare prompt for AI tailoring
        logger.info("Preparing prompt for resume tailoring")
        prompt = f"""Given the following job description and master resume items, select and return ONLY the most relevant items that best match the job requirements. You should be selective - typically return 60-80% of the original items, focusing on quality over quantity.

**Job Description:**
{job_description}

**Master Resume Items:**
{json.dumps(resume_entries, indent=2)}

**Instructions:**
* Select items that are most relevant to the job description
* Prioritize items that demonstrate skills, experience, or achievements directly related to the role
* Include essential items like userInfo, but be selective with experience, projects, and skills
* Return the EXACT same format and content for selected items - do not modify the text
* Order items by relevance (most relevant first)
* Ensure the output is valid JSON

**Critical Requirements:**
* If an item from the input is `{{ "type": "experience", "title": "Engineer", ... }}`, its selected counterpart in the output must also be `{{ "type": "experience", "title": "Engineer", ... }}`.
* Do **not** include any introductory text, concluding remarks, comments, or any explanations outside of the JSON structure itself.
"""

        logger.info("Starting Bedrock AI analysis for resume tailoring", {
            'model_id': MODEL_ID,
            'prompt_length': len(prompt),
            'master_resume_entries': len(resume_entries) if isinstance(resume_entries, list) else 0
        })

        bedrock_start = time.time()
        bedrock_response = bedrock.invoke_model(
            modelId=MODEL_ID,
            contentType="application/json",
            accept="application/json",
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
            })
        )
        bedrock_duration = (time.time() - bedrock_start) * 1000

        logger.info("Bedrock AI analysis completed", {
            'duration_ms': round(bedrock_duration, 2)
        })

        output = json.loads(bedrock_response["body"].read())
        
        # Clean control characters before parsing JSON
        raw_text = output["content"][0]["text"]
        cleaned_text = clean_json_string(raw_text)
        tailored_resume = json.loads(cleaned_text)
        
        logger.info("Resume tailoring completed successfully", {
            'original_entries': len(resume_entries) if isinstance(resume_entries, list) else 0,
            'tailored_entries': len(tailored_resume) if isinstance(tailored_resume, list) else 0,
            'reduction_percentage': round((1 - (len(tailored_resume) / len(resume_entries))) * 100, 1) if isinstance(resume_entries, list) and isinstance(tailored_resume, list) and len(resume_entries) > 0 else 0,
            'total_bedrock_duration_ms': round(bedrock_duration, 2),
            'total_dynamodb_duration_ms': round(dynamodb_duration, 2)
        })

        return {
            "statusCode": 200,
            "headers": {
                "Content-Type": "application/json",
                "X-RateLimit-Limit": str(limit),
                "X-RateLimit-Remaining": str(limit - current_count),
                "X-RateLimit-Reset": str(int(time.time()) + (24 * 3600))
            },
            "body": json.dumps({"resumeItems": tailored_resume})
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
        logger.error("Unexpected error during resume tailoring", {'error': str(e)})
        return {
            "statusCode": 500,
            "body": json.dumps({"error": f"Internal Server Error: {str(e)}"})
        }
