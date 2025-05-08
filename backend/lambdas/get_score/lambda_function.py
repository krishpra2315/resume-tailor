import json
import boto3
from boto3.dynamodb.conditions import Key
import os
import base64

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table("ResumeAnalysisResults")
s3 = boto3.client('s3')

BUCKET_NAME = os.environ.get('BUCKET_NAME', '')
def lambda_handler(event, context):
    try:
        query_parameters = event.get('queryStringParameters', {})
        if not query_parameters or 'resultId' not in query_parameters:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'resultId is required in query parameters'})
            }
        result_id = query_parameters['resultId']
        
        response = table.get_item(Key={'resultId': result_id})
        item = response.get('Item')

        if not item:
            return {
                'statusCode': 404,
                'body': json.dumps({'error': f'Result not found for resultId: {result_id}'}),
            }

        try:
            url = s3.generate_presigned_url(
                ClientMethod='get_object',
                Params={
                    'Bucket': BUCKET_NAME,
                    'Key': item['resumeId'],
                    'ResponseContentDisposition': 'inline',
                    'ResponseContentType': 'application/pdf'

                },
                ExpiresIn=3600
            )

        except Exception as e:
            return {
                'statusCode': 404,
                'body': json.dumps({'error': f'Error retrieving file from S3: {str(e)}'}),
            }

       

        return {
            'statusCode': 200,
            'body': json.dumps({
                'resultId': result_id,
                'fileContent': url,
                'jobDescription': item.get('jobDescription', ''),
                'score': str(item['score']),
                'feedback': item['feedback']
            }),
        }

    except Exception as e:
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)}),
        }
