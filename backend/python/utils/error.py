"""Error utilities for Lambda handlers."""


class APIError(Exception):
    """Custom API error with status code."""

    def __init__(self, message: str, status_code: int = 500):
        self.message = message
        self.status_code = status_code
        super().__init__(message)

    def __str__(self) -> str:
        return f"APIError({self.status_code}): {self.message}"
