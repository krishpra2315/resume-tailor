import json
import boto3
import base64
import uuid
import os

s3 = boto3.client('s3')
BUCKET_NAME = os.environ.get('BUCKET_NAME', '')

def lambda_handler(event, context):
    try:
        try:
            claims = event.get('requestContext', {}).get('authorizer', {}).get('jwt', {}).get('claims', {})
            user_id = claims.get('sub')

            if not user_id:
                print("Error: 'sub' claim missing in requestContext.authorizer.claims")
                return {
                    'statusCode': 500,
                    'headers': {
                        'Content-Type': 'application/json'
                    },
                    'body': json.dumps({'error': 'Internal Server Error: User ID not found in request context'})
                }
            
        except Exception as e:
             print(f"Error accessing claims: {e}. Event: {json.dumps(event)}")
             return {
                 'statusCode': 500,
                 'headers': {
                     'Content-Type': 'application/json'
                 },
                 'body': json.dumps({'error': 'Internal Server Error: Could not retrieve authorization claims'})
             }

        body = json.loads(event['body'])
        file_data = base64.b64decode(body['file'])
        file_name = f"{uuid.uuid4()}.pdf"
        s3_key = f"users/uploads/{user_id}/{file_name}"

        s3.put_object(Bucket=BUCKET_NAME, Key=s3_key, Body=file_data)

        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json'
            },
            'body': json.dumps({
                's3_key': s3_key
            })
        }

    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json'
            },
            'body': json.dumps({'error': 'Internal Server Error'})
        }
