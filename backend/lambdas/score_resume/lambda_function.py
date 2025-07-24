import json
import boto3
import uuid
import time
import os
import sys
import re
from datetime import datetime

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from logger_utils import create_logger
from rate_limiter import create_rate_limiter

textract = boto3.client('textract')
bedrock = boto3.client('bedrock-runtime', region_name='us-east-2')
dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('ResumeAnalysisResults')

MODEL_ID = 'arn:aws:bedrock:us-east-2:429744659578:inference-profile/us.anthropic.claude-3-haiku-20240307-v1:0'
BUCKET_NAME = 'resume-tailor-bucket.kp'

def clean_json_string(text):
    """Clean control characters from text that might break JSON parsing"""
    import unicodedata
    
    # First, normalize Unicode (handles various Unicode forms)
    text = unicodedata.normalize('NFKC', text)
    
    # Remove Unicode control characters and format characters
    cleaned = ''.join(char for char in text if unicodedata.category(char) not in ['Cc', 'Cf'])
    
    return cleaned.strip()

def format_prompt(resume_text, job_description):
    return f"""You are a highly critical and discerning Resume Evaluator. Your primary function is to rigorously assess a candidate's suitability for a specific job role by comparing their resume against the provided job description. You will speak directly to the candidate using "you" and "your".

Here is the job description:

--- JOB DESCRIPTION START ---
{job_description}
--- JOB DESCRIPTION END ---

And here is the candidate's resume:

--- RESUME START ---
{resume_text}
--- RESUME END ---

Your task is to analyze this resume against the job description and provide a detailed assessment. Return your response as a JSON object with the following structure:

{{
  "score": 85,
  "feedback": "Your detailed feedback here..."
}}

The score should be an integer from 0 to 100, where:
- 90-100: Exceptional fit with all key requirements and impressive relevant experience
- 80-89: Strong fit with most key requirements and good relevant experience
- 70-79: Good fit with some key requirements and reasonable relevant experience
- 60-69: Moderate fit with basic requirements and limited relevant experience
- 50-59: Weak fit with minimal requirements and little relevant experience
- Below 50: Poor fit with significant gaps in requirements

In your feedback, be direct and constructive. Address:
1. How well your experience aligns with the key requirements
2. Specific strengths that make you a good candidate
3. Areas where you fall short or have gaps
4. Specific improvements you could make to strengthen your candidacy
5. Any red flags or concerns about your background

Be honest and thorough in your assessment. Your goal is to provide valuable insights that help the candidate understand their fit for this role and how to improve their application."""

def lambda_handler(event, context):
    # Initialize logger
    logger = create_logger('score_resume')
    logger.log_function_start(event, context)
    
    try:
        logger.info("Parsing request body")
        body = json.loads(event['body'])
        s3_key = body['s3_key']
        job_description = body['job_description']
        is_guest = s3_key.startswith('guest/')
        
        logger.info("Request parsed successfully", {
            's3_key': s3_key,
            'is_guest': is_guest,
            'job_description_length': len(job_description)
        })
        
        # Initialize rate limiter
        logger.info("Initializing rate limiter")
        rate_limiter = create_rate_limiter()
        
        # Get user identifier and check rate limits
        if is_guest:
            identifier, user_type = rate_limiter.get_user_identifier(event)
        else:
            claims = event.get('requestContext', {}).get('authorizer', {}).get('jwt', {}).get('claims', {})
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

        # Extract text from resume using Textract
        logger.info("Starting Textract document analysis", {
            'bucket': BUCKET_NAME,
            's3_key': s3_key
        })
        
        textract_start = time.time()
        response = textract.detect_document_text(
            Document={
                'S3Object': {
                    'Bucket': BUCKET_NAME,
                    'Name': s3_key
                }
            }
        )
        textract_duration = (time.time() - textract_start) * 1000
        
        logger.info("Textract analysis completed", {
            'duration_ms': round(textract_duration, 2),
            'blocks_count': len(response['Blocks'])
        })

        lines = [item['Text'] for item in response['Blocks'] if item['BlockType'] == 'LINE']
        resume_text = "\n".join(lines)
        
        logger.info("Resume text extracted", {
            'lines_count': len(lines),
            'resume_text_length': len(resume_text)
        })

        prompt = format_prompt(resume_text, job_description)
        
        logger.info("Starting Bedrock AI analysis", {
            'model_id': MODEL_ID,
            'prompt_length': len(prompt)
        })

        bedrock_start = time.time()
        response = bedrock.invoke_model(
            modelId=MODEL_ID,
            body=json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "messages": [
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                "max_tokens": 1024,
                "temperature": 0.3,
            }),
            contentType='application/json',
            accept='application/json'
        )
        bedrock_duration = (time.time() - bedrock_start) * 1000
        
        logger.info("Bedrock analysis completed", {
            'duration_ms': round(bedrock_duration, 2)
        })
        
        resultId = str(uuid.uuid4())

        output = json.loads(response['body'].read())
        raw_text = output['content'][0]['text']
        
        logger.info("Raw AI response received", {
            'raw_text_length': len(raw_text),
            'raw_text_preview': raw_text[:200] + '...' if len(raw_text) > 200 else raw_text
        })
        
        try:
            # First attempt: Clean control characters before parsing JSON
            cleaned_text = clean_json_string(raw_text)
            content = json.loads(cleaned_text)
        except json.JSONDecodeError as e:
            # Fallback attempts with different cleaning strategies
            try:
                # Attempt 2: More aggressive cleaning - only keep ASCII printable + newlines/tabs
                ascii_only = ''.join(c for c in raw_text if ord(c) < 128 and (c.isprintable() or c in '\n\t\r '))
                content = json.loads(ascii_only)
                logger.info("Successfully parsed AI response using ASCII-only fallback")
            except json.JSONDecodeError:
                try:
                    # Attempt 3: Replace all problematic chars with spaces and fix JSON structure
                    safe_text = re.sub(r'[^\x20-\x7E\n\t\r]', ' ', raw_text)  # Keep only printable ASCII + whitespace
                    safe_text = re.sub(r'\s+', ' ', safe_text)  # Collapse multiple spaces
                    content = json.loads(safe_text)
                    logger.info("Successfully parsed AI response using safe ASCII replacement")
                except json.JSONDecodeError:
                    # Log the full raw text for debugging - temporarily disable truncation
                    error_pos = getattr(e, 'pos', 207) if hasattr(e, 'pos') else 207
                    start_pos = max(0, error_pos - 10)
                    end_pos = min(len(raw_text), error_pos + 10)
                    chars_around_error = raw_text[start_pos:end_pos]
                    
                    logger.error("Failed to parse AI response as JSON", {
                        'error': str(e),
                        'raw_text_full': raw_text,  # Full text without truncation
                        'cleaned_text_full': clean_json_string(raw_text),  # Full cleaned text
                        'ascii_only_text': ascii_only,
                        'safe_text': safe_text,
                        'raw_text_length': len(raw_text),
                        'cleaned_text_length': len(clean_json_string(raw_text)),
                        'error_position': error_pos,
                        'characters_around_error': chars_around_error,
                        'character_codes_around_error': [ord(c) for c in chars_around_error],
                        'bytes_around_error': chars_around_error.encode('unicode_escape').decode('ascii'),
                        'character_at_error_position': raw_text[error_pos] if error_pos < len(raw_text) else 'N/A',
                        'character_code_at_error': ord(raw_text[error_pos]) if error_pos < len(raw_text) else 'N/A'
                    })
                    raise Exception(f"Could not parse AI response as JSON: {str(e)}")
        
        # Convert score to integer if it's a decimal
        score = int(float(content['score']))
        feedback = content['feedback']
        
        logger.info("AI response parsed successfully", {
            'score': score,
            'feedback_length': len(feedback)
        })
        
        logger.info("AI analysis results processed", {
            'result_id': resultId,
            'score': score,
            'feedback_length': len(feedback)
        })
        
        item = {
            'resultId': resultId,
            'resumeId': s3_key,
            'jobDescription': job_description,
            'score': score,
            'feedback': feedback,
            'createdAt': datetime.now().isoformat(),
        }

        if is_guest:
            item['ttl'] = int(time.time()) + 3600
            logger.info("Guest result will expire in 1 hour", {'ttl': item['ttl']})
        else:
            user_id = s3_key.split('/')[1]
            item['userId'] = user_id
            logger.info("Authenticated user result (no expiration)", {'user_id': user_id})

        logger.info("Saving results to DynamoDB")
        dynamodb_start = time.time()
        try:
            table.put_item(Item=item)
            dynamodb_duration = (time.time() - dynamodb_start) * 1000
            logger.info("Results saved to DynamoDB successfully", {
                'duration_ms': round(dynamodb_duration, 2),
                'table_name': 'ResumeAnalysisResults'
            })
        except Exception as e:
            dynamodb_duration = (time.time() - dynamodb_start) * 1000
            logger.error("Failed to save to DynamoDB", {
                'duration_ms': round(dynamodb_duration, 2),
                'error': str(e),
                'table_name': 'ResumeAnalysisResults'
            })
            raise

        logger.info("Resume scoring completed successfully", {
            'total_textract_duration_ms': round(textract_duration, 2),
            'total_bedrock_duration_ms': round(bedrock_duration, 2),
            'total_dynamodb_duration_ms': round(dynamodb_duration, 2)
        })

        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'X-RateLimit-Textract-Limit': str(textract_limit),
                'X-RateLimit-Textract-Remaining': str(textract_limit - textract_count),
                'X-RateLimit-Bedrock-Limit': str(bedrock_limit),
                'X-RateLimit-Bedrock-Remaining': str(bedrock_limit - bedrock_count),
                'X-RateLimit-Reset': str(int(time.time()) + (24 * 3600))
            },
            'body': json.dumps({
                'resultId': resultId
            })
        }

    except json.JSONDecodeError as e:
        logger.error("Invalid JSON in request body", {'error': str(e)})
        return {
            'statusCode': 400,
            'body': json.dumps({'error': 'Invalid JSON in request body'})
        }
    except KeyError as e:
        logger.error("Missing required field in request", {'missing_field': str(e)})
        return {
            'statusCode': 400,
            'body': json.dumps({'error': f'Missing required field: {str(e)}'})
        }
    except Exception as e:  
        logger.error("Unexpected error during resume scoring", {'error': str(e)})
        return {
            'statusCode': 500,
            'body': json.dumps({'error': f'Internal Server Error: {str(e)}'})
        }
