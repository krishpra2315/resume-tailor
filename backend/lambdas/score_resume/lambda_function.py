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
    return f"""You are a resume evaluator speaking directly to the candidate. Here is a job description:

                --- JOB DESCRIPTION START ---
                {job_description}
                --- JOB DESCRIPTION END ---

                And here is the candidate's resume:

                --- RESUME START ---
                {resume_text}
                --- RESUME END ---

                Score the resume from 0 to 100 based on how well it matches the job description, focusing on technical fit, relevant experience, clarity, and formatting. 
                - Things that add to the score are key words/skills in the resume that are also present in the job description.
                - Things that take away from the score are key words/skills in the resume that are not present in the job description.
                - When coming across these missing skills, specifically tell the candidate that they're missing them and what they can do to improve.
                - Also for example, if the job description is for a full time position and the candidate is not graduating from school, they probably aren't a good fit.
                - Make sure to provide specific examples of how the candidate's resume matches the job description.
                - Structure the comments as an array of 3 large strings and make sure to include at least one point of things they can improve on. 
                - Also refer to the candidate as "you" or "your" in the feedback.

                Respond in the following JSON format:

                {{
                "score": <numeric score>,
                "feedback": ["point 1", "point 2", "point 3"]
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
