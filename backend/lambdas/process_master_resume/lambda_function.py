import json
import base64
import boto3
import os
from datetime import datetime

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

        # Step 2: Extract text with Textract
        textract_response = textract.detect_document_text(
            Document={"S3Object": {"Bucket": BUCKET_NAME, "Name": s3_key}}
        )

        lines = [b["Text"] for b in textract_response["Blocks"] if b["BlockType"] == "LINE"]
        resume_text = "\n".join(lines)

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
