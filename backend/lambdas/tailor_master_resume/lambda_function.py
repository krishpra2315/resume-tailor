import json
import boto3
from boto3.dynamodb.conditions import Key
import os

s3 = boto3.client("s3")
bedrock = boto3.client("bedrock-runtime", region_name="us-east-2")
dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table("ResumeMetadata")

MODEL_ID = 'arn:aws:bedrock:us-east-2:429744659578:inference-profile/us.anthropic.claude-3-haiku-20240307-v1:0'
BUCKET_NAME = os.environ.get('BUCKET_NAME', '')
def lambda_handler(event, context):
    try:
        body = json.loads(event["body"])
        claims = event.get('requestContext', {}).get('authorizer', {}).get('jwt', {}).get('claims', {})
        user_id = claims.get('sub')
        job_description = body["jobDescription"]

        response = table.get_item(Key={"resume_id": user_id})
        if "Item" not in response or "entries" not in response["Item"]:
            return {
                "statusCode": 404,
                "body": json.dumps({"error": "Master resume not found for user."}),
            }

        resume_entries = response["Item"]["entries"]

        # Step 2: Prompt Claude
        prompt = f"""
You are a resume optimization assistant. Given a structured resume (as a list of JSON objects) and a job description, select the most relevant items (experience, education, projects, skills, certifications) that best match the job.

When it comes to skills, include each of the sections like languages, technologies, etc. but only include the specific skills from those sections that are relevant to the job.

Prioritize technical fit, clarity, and relevance. 

Format your output as another list of JSON objects very similar to the input list of JSON objects that will fit in 1-page on a pdf if they were displayed as text. Make sure you only return resume items that are relevant to the job description.
Make sure to include the userInfo item from the list and make sure it still fits on 1-page.

For reference, a one page resume on average has 5-6 items other than the userInfo and skills where each item has on avergae 3-4 lines of text.

Only return the resume items, no other text or comments.

--- JOB DESCRIPTION START ---
{job_description}
--- JOB DESCRIPTION END ---

--- USER RESUME ENTRIES (JSON LIST) ---
{json.dumps(resume_entries)}
"""

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

        output = json.loads(bedrock_response["body"].read())
        tailored_resume = json.loads(output["content"][0]["text"])

        return {
            "statusCode": 200,
            "body": json.dumps({"resumeItems": tailored_resume})
        }

    except Exception as e:
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)})
        }
