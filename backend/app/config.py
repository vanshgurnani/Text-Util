import os


class Settings:
    app_name = os.getenv("APP_NAME", "NoteOS API")
    mongo_uri = os.getenv("MONGO_URI", "mongodb://localhost:27017")
    mongo_db = os.getenv("MONGO_DB", "noteform")
    jwt_secret = os.getenv("JWT_SECRET", "change-me-in-production")
    jwt_expiry_minutes = int(os.getenv("JWT_EXPIRY_MINUTES", "10080"))
    # Always permit the production Vercel frontend, local development, and Render frontend
    _default_origins = [
        "https://noteform-blush.vercel.app",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://noteform-1.onrender.com",
    ]
    _env_origins = [
        origin.strip().rstrip("/")
        for origin in os.getenv("CORS_ORIGINS", "").split(",")
        if origin.strip()
    ]
    cors_origins = list(dict.fromkeys([o.rstrip("/") for o in _default_origins] + _env_origins))
    cors_origin_regex = os.getenv("CORS_ORIGIN_REGEX", r"https://.*\.vercel\.app")
    mcp_api_key = os.getenv("MCP_API_KEY", "")
    mcp_user_id = os.getenv("MCP_USER_ID", "")
    mcp_public_url = os.getenv("MCP_PUBLIC_URL", "https://mcp.example.com/mcp").rstrip("/")


settings = Settings()
