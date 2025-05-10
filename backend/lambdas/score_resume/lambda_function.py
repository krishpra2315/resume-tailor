import json
import boto3
import uuid
import time
import os
from datetime import datetime

textract = boto3.client('textract')
bedrock = boto3.client('bedrock-runtime', region_name='us-east-2')
dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('ResumeAnalysisResults')

MODEL_ID = 'arn:aws:bedrock:us-east-2:429744659578:inference-profile/us.anthropic.claude-3-haiku-20240307-v1:0'
BUCKET_NAME = os.environ.get('BUCKET_NAME', '')

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

Your task is to score the resume on a scale of 0 to 100. A score of 0 indicates absolutely no match or disqualifying factors, while 100 represents a perfect alignment. Be exacting in your evaluation.

**Scoring Rubric & Penalties:**

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

* Provide specific examples from the resume that either support a good match or highlight a mismatch with the job description.
* When skills from the job description are missing in the resume, explicitly state these missing skills and suggest that you consider adding them if you have that experience.
* If penalizing for fundamental misalignments (like industry mismatch or availability issues), clearly explain this as the primary reason for a low score.
* Structure your comments as an array of 3 distinct, substantive string paragraphs.
* Ensure at least one actionable point of improvement is included, even for strong resumes. For very poor matches, the primary improvement point might be to seek roles more aligned with your current resume.

**Output Format:**

Respond *only* in the following JSON format:

```json
{{
"score": <numeric score between 0 and 100>,
"feedback": ["Detailed feedback point 1, including specific examples and direct address.", "Detailed feedback point 2, continuing the evaluation with actionable advice.", "Detailed feedback point 3, summarizing key strengths or critical areas for improvement based on the scoring rubric."]
}}
            """

def lambda_handler(event, context):
    try:
        body = json.loads(event['body'])
        s3_key = body['s3_key']
        job_description = body['job_description']
        is_guest = s3_key.startswith('guest/')

        response = textract.detect_document_text(
            Document={
                'S3Object': {
                    'Bucket': BUCKET_NAME,
                    'Name': s3_key
                }
            }
        )

        lines = [item['Text'] for item in response['Blocks'] if item['BlockType'] == 'LINE']
        resume_text = "\n".join(lines)

        prompt = format_prompt(resume_text, job_description)

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
        
        resultId = str(uuid.uuid4())

        output = json.loads(response['body'].read())
        content = json.loads(output['content'][0]['text'])
        score = content['score']
        feedback = content['feedback']
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
        else:
            user_id = s3_key.split('/')[1]
            item['userId'] = user_id

        try:
            table.put_item(Item=item)
        except Exception as e:
            print(f"Error saving to DynamoDB: {e}")

    except Exception as e:  
        return {
            'statusCode': 500,
            'body': json.dumps({'error': f'Internal Server Error: {str(e)}'})
        }

    return {
        'statusCode': 200,
        'body': json.dumps({
            'resultId': resultId
        })
    }
