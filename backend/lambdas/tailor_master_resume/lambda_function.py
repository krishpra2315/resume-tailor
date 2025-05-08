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

Your goal is to create a tailored 1-page resume that highlights the best possible fit with the job, but also fills the page with high-quality content.

When it comes to skills, include each of the sections (e.g., languages, technologies, tools) but only include specific skills from those sections that are relevant to the job. Do not include unrelated skills.

**IMPORTANT**:
- Prioritize relevance to the job description above all.
- However, if there are not enough highly relevant items to fill a page, include the next most related items to ensure the resume is a full page.
- Always include the `userInfo` and `skills` objects.
- Return a total of approximately 5-6 items **other than userInfo and skills**. Each item should average 4-5 lines of text.
- If you're uncertain whether to include an item, err on the side of including it to maintain resume fullness.
- Format your output as a list of JSON objects **with the same structure as the input list**, and do **not** include any explanatory text or comments.

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
