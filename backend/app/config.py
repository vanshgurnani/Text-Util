import os


class Settings:
    app_name = os.getenv("APP_NAME", "Noteform API")
    environment = os.getenv("APP_ENV", "development")
    mongo_uri = os.getenv("MONGO_URI", "mongodb://localhost:27017")
    mongo_db = os.getenv("MONGO_DB", "noteform")
    jwt_secret = os.getenv("JWT_SECRET", "change-me-in-production")
    jwt_expiry_minutes = int(os.getenv("JWT_EXPIRY_MINUTES", "10080"))
    web_session_days = int(os.getenv("WEB_SESSION_DAYS", "7"))
    cookie_secure = os.getenv("COOKIE_SECURE", "false").lower() == "true"
    auth_rate_limit = int(os.getenv("AUTH_RATE_LIMIT", "30"))
    mcp_rate_limit = int(os.getenv("MCP_RATE_LIMIT", "120"))
    metrics_token = os.getenv("METRICS_TOKEN", "")
    cors_origins = [origin.strip() for origin in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",") if origin.strip()]
    mcp_api_key = os.getenv("MCP_API_KEY", "")
    mcp_user_id = os.getenv("MCP_USER_ID", "")
    mcp_token_scopes = tuple(scope for scope in os.getenv("MCP_TOKEN_SCOPES", "notes:read notes:write").split() if scope)
    mcp_public_url = os.getenv("MCP_PUBLIC_URL", "https://mcp.example.com/mcp").rstrip("/")

    @property
    def is_production(self) -> bool:
        return self.environment.lower() in {"production", "prod"}

    def validate(self) -> None:
        if self.is_production and self.jwt_secret in {"", "change-me-in-production", "local-development-secret-change-me"}:
            raise RuntimeError("JWT_SECRET must be set to a strong value in production")
        if self.is_production and not self.mcp_public_url.startswith("https://"):
            raise RuntimeError("MCP_PUBLIC_URL must use HTTPS in production")
        if self.is_production and not self.metrics_token:
            raise RuntimeError("METRICS_TOKEN must be set in production")


settings = Settings()
