import json
import os
import boto3

BUCKET_NAME = os.environ.get('BUCKET_NAME', '')
s3 = boto3.client('s3')
dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table("ResumeMetadata")

def lambda_handler(event, context):
    try:
        claims = event.get('requestContext', {}).get('authorizer', {}).get('jwt', {}).get('claims', {})
        user_id = claims.get('sub')

        if not user_id:
            return {
                'statusCode': 401,
                'body': json.dumps({'error': 'Unauthorized: User ID not found in request context'})
            }
    except Exception as e:
        return {
            'statusCode': 500,
            'body': json.dumps({'error getting claims': str(e)})
        }  
        
    try:
        url = s3.generate_presigned_url(
            ClientMethod='get_object',
            Params={
                'Bucket': BUCKET_NAME,
                'Key': f'users/master/{user_id}.pdf',
                'ResponseContentDisposition': 'inline',
                'ResponseContentType': 'application/pdf'

            },
            ExpiresIn=3600
        )

        response = table.get_item(Key={'resume_id': user_id})
        item = response.get('Item')

        if not item:
            return {
                'statusCode': 404,
                'body': json.dumps({'error': f'Result not found for resumeId: {user_id}'}),
            }

    except Exception as e:
        return {
            'statusCode': 404,
            'body': json.dumps({'error': f'Error retrieving file from S3: {str(e)}'}),
        }
    
    return {
        'statusCode': 200,
        'body': json.dumps({
            'url': url,
            'entries': item['entries']
        })
    }
