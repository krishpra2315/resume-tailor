import json
import sys
import os
import time

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from logger_utils import create_logger
from rate_limiter import create_rate_limiter


def lambda_handler(event, context):
    # Initialize logger
    logger = create_logger('get_usage_stats')
    logger.log_function_start(event, context)
    
    try:
        # Initialize rate limiter
        logger.info("Initializing rate limiter")
        rate_limiter = create_rate_limiter()
        
        # Extract user information
        claims = event.get('requestContext', {}).get('authorizer', {}).get('jwt', {}).get('claims', {})
        if claims and claims.get('sub'):
            # Authenticated user
            identifier, user_type = rate_limiter.get_user_identifier(event, claims)
            logger.info("Authenticated user identified", {
                'user_type': user_type,
                'user_id': claims.get('sub'),
                'has_claims': True
            })
        else:
            # Guest user
            identifier, user_type = rate_limiter.get_user_identifier(event)
            logger.info("Guest user identified", {
                'user_type': user_type,
                'identifier': 'guest_***',
                'has_claims': False
            })
        
        # Get usage stats for both services
        logger.info("Retrieving usage statistics for all services")
        
        bedrock_start = time.time()
        bedrock_count, bedrock_limit, _ = rate_limiter.get_usage_stats(identifier, 'bedrock_requests')
        bedrock_duration = (time.time() - bedrock_start) * 1000
        
        textract_start = time.time()
        textract_count, textract_limit, _ = rate_limiter.get_usage_stats(identifier, 'textract_requests')
        textract_duration = (time.time() - textract_start) * 1000
        
        logger.info("Usage statistics retrieved successfully", {
            'bedrock_current_usage': bedrock_count,
            'bedrock_limit': bedrock_limit,
            'bedrock_remaining': bedrock_limit - bedrock_count,
            'bedrock_usage_percentage': round((bedrock_count / bedrock_limit) * 100, 1) if bedrock_limit > 0 else 0,
            'textract_current_usage': textract_count,
            'textract_limit': textract_limit,
            'textract_remaining': textract_limit - textract_count,
            'textract_usage_percentage': round((textract_count / textract_limit) * 100, 1) if textract_limit > 0 else 0,
            'bedrock_query_duration_ms': round(bedrock_duration, 2),
            'textract_query_duration_ms': round(textract_duration, 2)
        })
        
        usage_data = {
            'user_type': user_type,
            'identifier': identifier.replace('guest_', 'guest_***') if identifier.startswith('guest_') else identifier,
            'bedrock': {
                'current_usage': bedrock_count,
                'daily_limit': bedrock_limit,
                'remaining': bedrock_limit - bedrock_count
            },
            'textract': {
                'current_usage': textract_count,
                'daily_limit': textract_limit,
                'remaining': textract_limit - textract_count
            },
            'reset_time': int(time.time()) + (24 * 3600)  # Next UTC midnight
        }
        
        logger.info("Usage stats response prepared successfully", {
            'total_query_duration_ms': round(bedrock_duration + textract_duration, 2)
        })
        
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'X-RateLimit-Bedrock-Limit': str(bedrock_limit),
                'X-RateLimit-Bedrock-Remaining': str(bedrock_limit - bedrock_count),
                'X-RateLimit-Textract-Limit': str(textract_limit),
                'X-RateLimit-Textract-Remaining': str(textract_limit - textract_count),
                'X-RateLimit-Reset': str(int(time.time()) + (24 * 3600))
            },
            'body': json.dumps(usage_data)
        }
        
    except Exception as e:
        logger.error("Unexpected error retrieving usage statistics", {'error': str(e)})
        return {
            'statusCode': 500,
            'body': json.dumps({'error': f'Internal Server Error: {str(e)}'})
        } 