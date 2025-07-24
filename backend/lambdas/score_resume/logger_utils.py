import json
import logging
import time
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, Optional

class ResumeTailorLogger:
    def __init__(self, function_name: str, correlation_id: Optional[str] = None):
        self.function_name = function_name
        self.correlation_id = correlation_id or str(uuid.uuid4())
        self.logger = logging.getLogger(function_name)
        self.logger.setLevel(logging.INFO)
        
        # Remove existing handlers to avoid duplication
        for handler in self.logger.handlers[:]:
            self.logger.removeHandler(handler)
        
        # Create console handler with JSON formatter
        handler = logging.StreamHandler()
        handler.setFormatter(self._get_json_formatter())
        self.logger.addHandler(handler)
        
        # Prevent propagation to avoid duplicate logs
        self.logger.propagate = False

    def _get_json_formatter(self):
        class JsonFormatter(logging.Formatter):
            def format(self, record):
                log_data = {
                    'timestamp': datetime.utcnow().isoformat() + 'Z',
                    'level': record.levelname,
                    'function_name': record.name,
                    'correlation_id': getattr(record, 'correlation_id', ''),
                    'message': record.getMessage(),
                    'line_number': record.lineno,
                    'file': record.filename
                }
                
                # Add extra fields if present
                if hasattr(record, 'extra_data'):
                    log_data.update(record.extra_data)
                
                if record.exc_info:
                    log_data['exception'] = self.formatException(record.exc_info)
                
                return json.dumps(log_data)
        
        return JsonFormatter()

    def _log(self, level: str, message: str, extra_data: Optional[Dict] = None):
        """Internal logging method"""
        record = getattr(self.logger, level.lower())
        extra = {
            'correlation_id': self.correlation_id,
            'extra_data': extra_data or {}
        }
        record(message, extra=extra)

    def _sanitize_data(self, data: Any) -> Any:
        """Sanitize sensitive data for logging"""
        if isinstance(data, dict):
            sanitized = {}
            for key, value in data.items():
                key_lower = key.lower()
                if any(sensitive in key_lower for sensitive in ['password', 'secret', 'token', 'key', 'auth']):
                    sanitized[key] = '***REDACTED***'
                elif key_lower == 'file' and isinstance(value, str) and len(value) > 100:
                    # Truncate large file contents
                    sanitized[key] = f"<FILE_CONTENT_SIZE:{len(value)}>"
                elif key_lower in ['raw_text_full', 'cleaned_text_full'] and isinstance(value, str):
                    # Don't truncate these debugging fields - we need full content
                    sanitized[key] = value
                else:
                    sanitized[key] = self._sanitize_data(value)
            return sanitized
        elif isinstance(data, list):
            return [self._sanitize_data(item) for item in data]
        elif isinstance(data, Decimal):
            # Convert Decimal to int if it's a whole number, otherwise float
            if data % 1 == 0:
                return int(data)
            else:
                return float(data)
        elif isinstance(data, str) and len(data) > 1000:
            return f"<TRUNCATED_STRING_SIZE:{len(data)}>"
        else:
            return data

    def info(self, message: str, extra_data: Optional[Dict] = None):
        """Log info message"""
        self._log('info', message, self._sanitize_data(extra_data))

    def debug(self, message: str, extra_data: Optional[Dict] = None):
        """Log debug message"""
        self._log('debug', message, self._sanitize_data(extra_data))

    def warning(self, message: str, extra_data: Optional[Dict] = None):
        """Log warning message"""
        self._log('warning', message, self._sanitize_data(extra_data))

    def error(self, message: str, extra_data: Optional[Dict] = None, exc_info: bool = True):
        """Log error message with exception info"""
        record = self.logger.error
        extra = {
            'correlation_id': self.correlation_id,
            'extra_data': self._sanitize_data(extra_data) or {}
        }
        record(message, extra=extra, exc_info=exc_info)

    def log_function_start(self, event: Dict, context: Any):
        """Log function start with sanitized input"""
        sanitized_event = self._sanitize_data(event)
        self.info("Function execution started", {
            'aws_request_id': context.aws_request_id,
            'function_version': context.function_version,
            'memory_limit': context.memory_limit_in_mb,
            'remaining_time_ms': context.get_remaining_time_in_millis(),
            'event_source': sanitized_event.get('requestContext', {}).get('requestId'),
            'user_agent': sanitized_event.get('requestContext', {}).get('identity', {}).get('userAgent'),
            'source_ip': sanitized_event.get('requestContext', {}).get('identity', {}).get('sourceIp'),
            'http_method': sanitized_event.get('httpMethod'),
            'path': sanitized_event.get('path'),
            'event_keys': list(sanitized_event.keys()) if isinstance(sanitized_event, dict) else str(type(sanitized_event))
        })

    def log_function_end(self, duration_ms: float, status_code: Optional[int] = None):
        """Log function end with execution metrics"""
        self.info("Function execution completed", {
            'execution_duration_ms': round(duration_ms, 2),
            'status_code': status_code,
            'performance_category': self._get_performance_category(duration_ms)
        })

    def _get_performance_category(self, duration_ms: float) -> str:
        """Categorize performance for monitoring"""
        if duration_ms < 1000:
            return 'fast'
        elif duration_ms < 5000:
            return 'normal'
        elif duration_ms < 15000:
            return 'slow'
        else:
            return 'very_slow'

    def log_aws_service_call(self, service: str, operation: str, params: Optional[Dict] = None):
        """Log AWS service calls"""
        self.info(f"AWS {service} call started", {
            'service': service,
            'operation': operation,
            'params_keys': list(params.keys()) if params else []
        })

    def log_aws_service_result(self, service: str, operation: str, duration_ms: float, success: bool, error: Optional[str] = None):
        """Log AWS service call results"""
        level = 'info' if success else 'error'
        message = f"AWS {service} call {'completed' if success else 'failed'}"
        extra_data = {
            'service': service,
            'operation': operation,
            'duration_ms': round(duration_ms, 2),
            'success': success
        }
        if error:
            extra_data['error'] = error
        
        getattr(self, level)(message, extra_data)

    def log_rate_limit_check(self, identifier: str, user_type: str, service_name: str, success: bool, current_count: int, limit: int):
        """Log rate limiting decisions"""
        level = 'info' if success else 'warning'
        message = f"Rate limit check {'passed' if success else 'failed'}"
        self._log(level, message, {
            'identifier': identifier if not identifier.startswith('guest_') else 'guest_***',
            'user_type': user_type,
            'service_name': service_name,
            'current_count': current_count,
            'limit': limit,
            'usage_percentage': round((current_count / limit) * 100, 1) if limit > 0 else 0
        })

def create_logger(function_name: str, correlation_id: Optional[str] = None) -> ResumeTailorLogger:
    """Factory function to create logger instances"""
    return ResumeTailorLogger(function_name, correlation_id) 