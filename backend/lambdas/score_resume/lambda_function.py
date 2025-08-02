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

**CRITICAL FIRST STEP - Job Description Validation:**

Before evaluating the resume, you must first assess whether the provided job description is valid and substantive enough for meaningful evaluation. 

**Invalid Job Description Criteria:**
- Contains only a few words (less than 10 meaningful words)
- Lacks any specific job requirements, responsibilities, or role details
- Is just a job title without description (e.g., "Software Engineer", "Manager", "Sales")
- Contains nonsensical text, random words, or placeholder text
- Is clearly not a legitimate job posting

**If the job description is invalid:** Return a score of 0 and provide feedback explaining that a proper job description is required for accurate evaluation.

**If the job description is valid:** Proceed with the full evaluation below.

Your task is to score the resume on a scale of 0 to 100. A score of 0 indicates absolutely no match, disqualifying factors, or invalid job description, while 100 represents a perfect alignment. Be exacting in your evaluation.

**Scoring Rubric & Penalties (for valid job descriptions only):**

1.  **Fundamental Alignment (Weight: 40%)**:
    * **Industry/Role Match**: Is the resume's career trajectory and core skill set aligned with the industry and role described in the job description?
        * **Severe Mismatch**: If the resume is for a completely different field (e.g., a software engineering resume for a botany position), the score in this section should be 0, leading to a very low overall score (likely under 10). Clearly state this fundamental misalignment.
    * **Experience Level & Availability**:
        * If the job description specifies an experience level (e.g., "entry-level," "5+ years") and the resume clearly indicates a significant mismatch (e.g., a student resume for a senior role, or a senior executive resume for an explicitly entry-level role), penalize heavily.
        * If the job is full-time and the resume indicates the candidate is a student who is not graduating soon or otherwise not available for full-time work as implied by the JD, this is a critical mismatch. Penalize heavily and explain why.

2.  **Technical Fit & Key Skills (Weight: 30%)**:
    * **Presence of Required Skills**: Identify essential keywords, technologies, and skills explicitly mentioned in the job description.
        * For each **essential** skill from the JD *missing* in the resume, deduct significant points.
        * For skills present in the resume that *match* the JD, award points.
    * **Absence of Irrelevant Skills**:
        * Skills listed in the resume that are *not relevant* to the job description should **not** add to the score and may slightly detract if they create a sense of lack of focus for *this specific role*. Do not heavily penalize for extra skills unless they completely overshadow relevant ones.

3.  **Relevant Experience & Accomplishments (Weight: 20%)**:
    * Does the work history and project experience directly relate to the responsibilities and requirements outlined in the job description?
    * Are accomplishments quantified and do they demonstrate impact relevant to the target role?
    * Lack of directly relevant experience should result in a lower score in this section.

4.  **Clarity, Formatting, and Professionalism (Weight: 10%)**:
    * Is the resume easy to read, well-organized, and free of significant grammatical errors or typos?
    * Is the information presented in a professional manner?
    * While important, this should not salvage a resume that is a poor fit in terms of alignment, skills, or experience.

**Feedback Requirements:**

* For invalid job descriptions: Explain that a detailed job description with specific requirements, responsibilities, and qualifications is needed for accurate resume evaluation.
* For valid job descriptions: Provide specific examples from the resume that either support a good match or highlight a mismatch with the job description.
* When skills from the job description are missing in the resume, explicitly state these missing skills and suggest that you consider adding them if you have that experience.
* If penalizing for fundamental misalignments (like industry mismatch or availability issues), clearly explain this as the primary reason for a low score.
* Structure your comments as an array of 3 distinct, substantive string paragraphs.
* Ensure at least one actionable point of improvement is included, even for strong resumes. For very poor matches, the primary improvement point might be to seek roles more aligned with your current resume.

**Output Format:**

Respond *only* in the following JSON format WITHOUT the markdown formatting:

{{
"score": <numeric score between 0 and 100>,
"feedback": ["Detailed feedback point 1, including specific examples and direct address.", "Detailed feedback point 2, continuing the evaluation with actionable advice.", "Detailed feedback point 3, summarizing key strengths or critical areas for improvement based on the scoring rubric."]
}}
"""

def lambda_handler(event, context):
    # Initialize logger
    logger = create_logger('score_resume')
    logger.log_function_start(event, context)
    
    try:
        logger.info("Parsing request body")
        body = json.loads(event['body'])
        
        # Support both s3_key (PDF) and resume_text (direct text) input modes
        s3_key = body.get('s3_key')
        resume_text = body.get('resume_text')
        job_description = body['job_description']
        with_auth = body.get('with_auth', False)  # Default to False for backward compatibility
        
        # Validate that exactly one input method is provided
        if not s3_key and not resume_text:
            logger.error("Neither s3_key nor resume_text provided")
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'Either s3_key or resume_text must be provided'})
            }
        
        if s3_key and resume_text:
            logger.error("Both s3_key and resume_text provided")
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'Only one of s3_key or resume_text should be provided'})
            }
        
        # Validate that resume_text is not empty when provided
        if resume_text is not None and not resume_text.strip():
            logger.error("Empty resume_text provided")
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'resume_text cannot be empty'})
            }
        
        # Determine if this is a guest request based on s3_key or default to false for text input
        is_guest = s3_key.startswith('guest/') if s3_key else False
        use_textract = bool(s3_key)  # Only use Textract if we have an S3 key
        
        logger.info("Request parsed successfully", {
            's3_key': s3_key,
            'has_resume_text': bool(resume_text),
            'resume_text_length': len(resume_text) if resume_text else None,
            'use_textract': use_textract,
            'is_guest': is_guest,
            'with_auth': with_auth,
            'job_description_length': len(job_description)
        })
        
        # Initialize rate limiter
        logger.info("Initializing rate limiter")
        rate_limiter = create_rate_limiter()
        
        # Always use IP-based identification for score_resume
        # But apply different rate limits based on with_auth parameter
        source_ip = event.get('requestContext', {}).get('identity', {}).get('sourceIp', 'unknown')
        identifier = f"guest_{source_ip}"
        user_type = 'user' if with_auth else 'guest'
        
        logger.info("User identified", {
            'user_type': user_type,
            'identifier': 'guest_***',  # Always hide IP for privacy
            'with_auth': with_auth,
            'rate_limit_applied': f"{'user' if with_auth else 'guest'} limits"
        })
        
        # Check Textract rate limits only if we're using PDF processing
        textract_success, textract_count, textract_limit = True, 0, 0
        if use_textract:
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
                        'message': f'You have exceeded the daily limit of {int(textract_limit)} document processing requests. Please try again tomorrow.',
                        'current_usage': int(textract_count),
                        'daily_limit': int(textract_limit),
                        'user_type': user_type
                    })
                }
        else:
            logger.info("Skipping Textract rate limit check - using direct text input")
        
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
                    'message': f'You have exceeded the daily limit of {int(bedrock_limit)} AI processing requests. Please try again tomorrow.',
                    'current_usage': int(bedrock_count),
                    'daily_limit': int(bedrock_limit),
                    'user_type': user_type
                })
            }

        # Extract text from resume using Textract or use provided text
        textract_duration = 0
        if use_textract:
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
            
            logger.info("Resume text extracted from PDF", {
                'lines_count': len(lines),
                'resume_text_length': len(resume_text)
            })
        else:
            logger.info("Using provided resume text directly", {
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
            
            # Handle markdown code blocks (```json ... ```)
            if cleaned_text.strip().startswith('```'):
                # Find the first { and last } to extract just the JSON part
                start_idx = cleaned_text.find('{')
                end_idx = cleaned_text.rfind('}')
                if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
                    cleaned_text = cleaned_text[start_idx:end_idx+1]
            
            content = json.loads(cleaned_text)
        except json.JSONDecodeError as e:
            # Fallback attempts with different cleaning strategies
            try:
                # Attempt 2: More aggressive cleaning - only keep ASCII printable + newlines/tabs
                ascii_only = ''.join(c for c in raw_text if ord(c) < 128 and (c.isprintable() or c in '\n\t\r '))
                
                # Handle markdown code blocks for ASCII text too
                if ascii_only.strip().startswith('```'):
                    start_idx = ascii_only.find('{')
                    end_idx = ascii_only.rfind('}')
                    if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
                        ascii_only = ascii_only[start_idx:end_idx+1]
                
                content = json.loads(ascii_only)
                logger.info("Successfully parsed AI response using ASCII-only fallback")
            except json.JSONDecodeError:
                try:
                    # Attempt 3: Replace all problematic chars with spaces and fix JSON structure
                    safe_text = re.sub(r'[^\x20-\x7E\n\t\r]', ' ', raw_text)  # Keep only printable ASCII + whitespace
                    safe_text = re.sub(r'\s+', ' ', safe_text)  # Collapse multiple spaces
                    
                    # Handle markdown code blocks for safe text too
                    if safe_text.strip().startswith('```'):
                        start_idx = safe_text.find('{')
                        end_idx = safe_text.rfind('}')
                        if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
                            safe_text = safe_text[start_idx:end_idx+1]
                    
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
            'jobDescription': job_description,
            'score': score,
            'feedback': feedback,
            'createdAt': datetime.now().isoformat(),
        }
        
        # Store either S3 key (PDF mode) or resume text (text mode)
        if use_textract:
            item['resumeId'] = s3_key  # S3 key for PDF mode
            item['inputMode'] = 'pdf'
        else:
            item['resumeText'] = resume_text  # Direct text for text mode
            item['inputMode'] = 'text'

        if is_guest:
            item['ttl'] = int(time.time()) + 3600
            logger.info("Guest result will expire in 1 hour", {'ttl': item['ttl']})
        else:
            # Only extract user_id from s3_key if we have an s3_key (PDF mode)
            if s3_key:
                user_id = s3_key.split('/')[1]
                item['userId'] = user_id
                logger.info("Authenticated user result (no expiration)", {'user_id': user_id})
            else:
                # For direct text input mode, we don't have a user_id from s3_key
                # The result will still be saved but without a specific userId
                logger.info("Authenticated user result from text input (no s3_key user_id)")

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

        # Prepare response headers
        headers = {
            'Content-Type': 'application/json',
            'X-RateLimit-Bedrock-Limit': str(int(bedrock_limit)),
            'X-RateLimit-Bedrock-Remaining': str(int(bedrock_limit) - int(bedrock_count)),
            'X-RateLimit-Reset': str(int(time.time()) + (24 * 3600))
        }
        
        # Only include Textract headers if Textract was used
        if use_textract:
            headers['X-RateLimit-Textract-Limit'] = str(int(textract_limit))
            headers['X-RateLimit-Textract-Remaining'] = str(int(textract_limit) - int(textract_count))
        
        return {
            'statusCode': 200,
            'headers': headers,
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
