import json
import boto3
import base64
import uuid
import os

s3 = boto3.client('s3')
BUCKET_NAME = os.environ.get('BUCKET_NAME', 'resume-tailor-bucket.kp')

def lambda_handler(event, context):
    try:
        body = json.loads(event['body'])
        file_data = base64.b64decode(body['file'])
        file_name = f"{uuid.uuid4()}.pdf"
        s3_key = f"guest/{file_name}"

        s3.put_object(Bucket=BUCKET_NAME, Key=s3_key, Body=file_data)

        return {
            'statusCode': 200,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps({
                's3_key': s3_key
            })
        }

    except Exception as e:
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }
