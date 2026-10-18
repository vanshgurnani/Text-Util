import os


class Settings:
    app_name = os.getenv("APP_NAME", "Noteform API")
    mongo_uri = os.getenv("MONGO_URI", "mongodb://localhost:27017")
    mongo_db = os.getenv("MONGO_DB", "noteform")
    jwt_secret = os.getenv("JWT_SECRET", "change-me-in-production")
    jwt_expiry_minutes = int(os.getenv("JWT_EXPIRY_MINUTES", "10080"))
    cors_origins = [origin.strip() for origin in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",") if origin.strip()]
    mcp_api_key = os.getenv("MCP_API_KEY", "")
    mcp_user_id = os.getenv("MCP_USER_ID", "")


settings = Settings()
