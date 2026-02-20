# ruff: noqa: F821
# Vulture whitelist - items that appear unused but are actually entry points or fixtures

# Lambda handler entry points (called by AWS, appear unused locally)
handler  # backend/python/index.py

# pytest fixtures (called by pytest, not directly)
api_event  # backend/python_tests/conftest.py

# Lambda handler parameters required by AWS signature
context  # Lambda context parameter (required but often unused)

# Classmethod first parameter
cls  # @classmethod decorator requires cls parameter

# Logger class API methods (called dynamically, appear unused to vulture)
format  # StructuredLogFormatter.format override
debug  # StructuredLogger.debug
warn  # StructuredLogger.warn

# FastAPI route handlers (decorated with @app.get/post, appear unused to vulture)
analyze_text_sentiment  # backend/services/ml/app.py
analyze_batch_sentiment  # backend/services/ml/app.py
health_check  # backend/services/ml/app.py
root  # backend/services/ml/app.py
global_exception_handler  # backend/services/ml/app.py

# Pydantic validators (decorated, appear unused)
text_not_empty  # backend/services/ml/app.py
texts_not_empty  # backend/services/ml/app.py
