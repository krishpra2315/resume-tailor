import boto3
import json
import os

s3 = boto3.client("s3")
BUCKET_NAME = os.environ.get('BUCKET_NAME', '')

def lambda_handler(event, context):
    claims = event.get('requestContext', {}).get('authorizer', {}).get('jwt', {}).get('claims', {})
    user_id = claims.get('sub')
    prefix = f"users/tailored/{user_id}/"

    try:
        fileKeys = []
        files = []
        paginator = s3.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=BUCKET_NAME, Prefix=prefix):
            for obj in page.get("Contents", []):
                fileKeys.append(obj["Key"])
        
        for key in fileKeys:
            url = s3.generate_presigned_url(
                ClientMethod='get_object',
                Params={
                    'Bucket': BUCKET_NAME,
                    'Key': key,
                    'ResponseContentDisposition': 'inline',
                    'ResponseContentType': 'application/pdf'

                },
                ExpiresIn=3600
            )

            files.append({"name": key.split("/")[3], "url": url})

        return {
            "statusCode": 200,
            "body": json.dumps({
                "files": files,
            }),
        }

    except Exception as e:
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)}),
        }
