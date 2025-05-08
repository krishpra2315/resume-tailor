import json
import base64
import boto3
import os
from datetime import datetime
import time

s3 = boto3.client("s3")
textract = boto3.client("textract")
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
        base64_file = body["file"]

        # Step 1: Upload PDF to S3
        s3_key = f"users/master/{user_id}.pdf"
        s3.put_object(
            Bucket=BUCKET_NAME,
            Key=s3_key,
            Body=base64.b64decode(base64_file),
            ContentType="application/pdf",
            ContentDisposition="inline"
        )

        response = textract.start_document_text_detection(
            DocumentLocation={"S3Object": {"Bucket": BUCKET_NAME, "Name": s3_key}}
        )
        job_id = response["JobId"]

        max_retries = 20
        delay = 1  # seconds
        for j in range(max_retries):
            result = textract.get_document_text_detection(JobId=job_id)
            status = result["JobStatus"]

            if status == "SUCCEEDED":
                break
            elif status in ("FAILED", "PARTIAL_SUCCESS"):
                raise Exception(f"Textract job failed with status: {status}")
            time.sleep(delay)
            print(f"Textract job {job_id} is {status}, attempt {j+1} of {max_retries}")
        else:
            raise TimeoutError("Textract job did not finish in time.")
    
        all_blocks = []
        next_token = None
        while True:
            if next_token:
                page_result = textract.get_document_text_detection(JobId=job_id, NextToken=next_token)
            else:
                page_result = result

            all_blocks.extend(page_result["Blocks"])
            next_token = page_result.get("NextToken")
            if not next_token:
                break
            
        resume_text = "\n".join([b["Text"] for b in all_blocks if b["BlockType"] == "LINE"])

        # Step 3: Send to Claude to extract structured items
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

        output = json.loads(bedrock_response['body'].read())
        content = json.loads(output['content'][0]['text'])

        try:
            table.put_item(
                Item={
                    "resume_id": user_id,
                    "s3_key": s3_key,
                    "entries": content,
                    "updatedAt": datetime.now().isoformat()
                }
            )
        except Exception as e:
            return {
                "statusCode": 500,
                "body": json.dumps({"Failed to save to DynamoDB": str(e)})
            }

        return {
            "statusCode": 200,
            "body": json.dumps({
                "s3Key": s3_key
            })
        }

    except Exception as e:
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)})
        }
