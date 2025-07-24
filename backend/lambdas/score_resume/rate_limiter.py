import boto3
import time
from datetime import datetime
from botocore.exceptions import ClientError

class RateLimiter:
    def __init__(self):
        self.dynamodb = boto3.resource('dynamodb')
        self.usage_table = self.dynamodb.Table('ApiUsageLimits')
        
        # Rate limit configurations
        self.LIMITS = {
            'guest': {
                'bedrock_requests': 5,    # 5 requests per day for guests
                'textract_requests': 10   # 10 textract requests per day for guests
            },
            'user': {
                'bedrock_requests': 50,   # 50 requests per day for authenticated users
                'textract_requests': 100  # 100 textract requests per day for authenticated users
            }
        }
    
    def get_user_identifier(self, event, claims=None):
        """
        Extract user identifier from the event.
        Returns tuple: (identifier, user_type)
        """
        if claims and claims.get('sub'):
            # Authenticated user
            return claims.get('sub'), 'user'
        else:
            # Guest user - use IP address as identifier
            source_ip = event.get('requestContext', {}).get('identity', {}).get('sourceIp', 'unknown')
            return f"guest_{source_ip}", 'guest'
    
    def check_and_increment_usage(self, identifier, user_type, service_name):
        """
        Check if user is within rate limits and increment usage count.
        Returns tuple: (success: bool, current_count: int, limit: int)
        """
        today_date = datetime.now().strftime('%Y-%m-%d')
        date_service_key = f"{today_date}#{service_name}"
        ttl_timestamp = int(time.time()) + (48 * 3600)  # 48 hours TTL
        
        # Get the appropriate limit
        limit = self.LIMITS.get(user_type, {}).get(service_name, 0)
        if limit == 0:
            raise ValueError(f"No limit configured for user_type: {user_type}, service: {service_name}")
        
        try:
            response = self.usage_table.update_item(
                Key={
                    'identifier': identifier,
                    'date_service': date_service_key
                },
                UpdateExpression="SET request_count = if_not_exists(request_count, :start) + :inc, #ttl = :ttl_val",
                ConditionExpression="attribute_not_exists(request_count) OR request_count < :limit",
                ExpressionAttributeNames={
                    '#ttl': 'ttl'
                },
                ExpressionAttributeValues={
                    ':inc': 1,
                    ':start': 0,
                    ':limit': limit,
                    ':ttl_val': ttl_timestamp
                },
                ReturnValues="UPDATED_NEW"
            )
            current_count = response['Attributes']['request_count']
            return True, current_count, limit
            
        except ClientError as e:
            if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
                # Limit exceeded - get current count for error message
                try:
                    response = self.usage_table.get_item(
                        Key={
                            'identifier': identifier,
                            'date_service': date_service_key
                        }
                    )
                    current_count = response.get('Item', {}).get('request_count', limit)
                except:
                    current_count = limit
                return False, current_count, limit
            else:
                # Other DynamoDB error - re-raise
                raise
    
    def get_usage_stats(self, identifier, service_name):
        """
        Get current usage stats for a user/service combination.
        Returns tuple: (current_count: int, limit: int, user_type: str)
        """
        today_date = datetime.now().strftime('%Y-%m-%d')
        date_service_key = f"{today_date}#{service_name}"
        
        # Determine user type from identifier
        user_type = 'guest' if identifier.startswith('guest_') else 'user'
        limit = self.LIMITS.get(user_type, {}).get(service_name, 0)
        
        try:
            response = self.usage_table.get_item(
                Key={
                    'identifier': identifier,
                    'date_service': date_service_key
                }
            )
            current_count = response.get('Item', {}).get('request_count', 0)
            return current_count, limit, user_type
        except:
            return 0, limit, user_type

# Convenience function for easy import
def create_rate_limiter():
    return RateLimiter() 