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
    """Clean control characters and introductory text that might break JSON parsing"""
    # Remove or replace common control characters that break JSON parsing
    # Keep newlines and tabs as they're valid in JSON strings when properly escaped
    cleaned = re.sub(r'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '', text)
    
    # Remove common introductory phrases the AI might add
    intro_phrases = [
        "Here is the enhanced resume with tailored content:",
        "Here is the tailored resume:",
        "Here are the enhanced resume items:",
        "The enhanced resume with tailored content:",
        "Enhanced resume:",
        "Tailored resume:",
    ]
    
    cleaned = cleaned.strip()
    
    # Remove any introductory text before the JSON
    for phrase in intro_phrases:
        if cleaned.lower().startswith(phrase.lower()):
            cleaned = cleaned[len(phrase):].strip()
            break
    
    # Find the first '[' or '{' to start JSON
    start_idx = -1
    for i, char in enumerate(cleaned):
        if char in ['[', '{']:
            start_idx = i
            break
    
    if start_idx > 0:
        cleaned = cleaned[start_idx:]
    
    return cleaned.strip()


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
        prompt = f"""Given the following job description and resume items, subtly enhance the content to better match the job requirements while maintaining professional resume formatting. Make minimal, strategic changes that highlight relevant skills naturally.

**Job Description:**
{job_description}

**Resume Items:**
{json.dumps(resume_entries, indent=2)}

**Instructions:**
* Keep ALL resume items - don't remove any entries
* NEVER modify education sections (degrees, courses, schools) - these are factual and objective
* PRESERVE exact formatting including newlines, spacing, and line breaks - do not collapse or change whitespace
* For skills sections: Keep as concise lists or brief phrases, NOT verbose paragraphs
* For experience descriptions: Make subtle keyword optimizations while maintaining the original tone and style
* AVOID adding explanatory phrases like "demonstrating strong skills in..." or "providing technical background in..."
* Keep the professional, concise resume format - no academic or verbose descriptions
* Only enhance what could realistically have been achieved in the original role/project
* Maintain the exact same JSON structure and field names
* Keep userInfo unchanged unless optimizing brief skills/summary sections

**What TO DO:**
* Subtly incorporate relevant keywords from the job description into existing descriptions
* Highlight aspects of achievements that align with job requirements
* Replace generic terms with more specific, relevant technical terms when appropriate
* Optimize bullet points to emphasize job-relevant accomplishments
* ACTIVELY ADD relevant skills, programming languages, frameworks, and tools from the job description to skills sections
* Add technical skills that would logically fit with the person's background and the target role
* Include relevant technologies, languages, and tools mentioned in the job posting

**What NOT TO DO:**
* Add verbose explanations or educational descriptions
* Change factual information (dates, organizations, degrees, course names)
* Turn concise skill lists into paragraph descriptions
* Add phrases that explicitly state what skills are being demonstrated
* Make changes that don't fit the original resume's style and tone
* Modify newlines, spacing, or formatting - preserve exact whitespace structure

**Output Format:**
For each resume item, return an object with this structure:
{{
  "original": {{ original resume item exactly as provided }},
  "tailored": {{ enhanced version with subtle, job-relevant optimizations }},
  "hasChanges": true/false
}}

**Critical Requirements:**
* Return a JSON array where each element has "original", "tailored", and "hasChanges" fields
* Keep all field names and structure identical between original and tailored versions
* Maintain professional resume formatting - concise, action-oriented, no verbose explanations
* Ensure the output is valid JSON
* RESPOND WITH ONLY THE JSON ARRAY - NO introductory text, concluding remarks, comments, or explanations
* Your response must start with '[' and end with ']'
* Do not add phrases like "Here is the enhanced resume" or any other text before the JSON
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
                "max_tokens": 8192,
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
        logger.info("Raw AI response", {
            'raw_text_preview': raw_text[:500] if raw_text else 'None',
            'raw_text_length': len(raw_text) if raw_text else 0,
            'raw_text_type': type(raw_text).__name__
        })
        
        cleaned_text = clean_json_string(raw_text)
        logger.info("Cleaned AI response", {
            'cleaned_text_preview': cleaned_text[:500] if cleaned_text else 'None',
            'cleaned_text_length': len(cleaned_text) if cleaned_text else 0,
            'cleaned_text_type': type(cleaned_text).__name__
        })
        
        tailored_resume = json.loads(cleaned_text)
        
        # Count items with changes
        changes_count = sum(1 for item in tailored_resume if item.get('hasChanges', False)) if isinstance(tailored_resume, list) else 0
        
        logger.info("Resume tailoring completed successfully", {
            'original_entries': len(resume_entries) if isinstance(resume_entries, list) else 0,
            'tailored_entries': len(tailored_resume) if isinstance(tailored_resume, list) else 0,
            'items_with_changes': changes_count,
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
