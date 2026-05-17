from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://ircc:password@db:5432/ircc"
    redis_url: str = "redis://redis:6379/0"
    secret_key: str = "dev-secret-key-change-in-production-minimum-32-chars"
    encryption_key: str = "dev-encrypt-key-change-in-production32"
    upload_dir: str = "/var/uploads"
    cors_origins: str = "http://localhost"
    debug: bool = False

    # JWT
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7

    # Rate limiting
    rate_limit_per_minute: int = 100
    api_key_rate_limit_per_minute: int = 1000

    # File uploads
    max_upload_size_mb: int = 100

    # SMTP (optional)
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "ircc@yourcompany.com"

    # S3 (optional)
    s3_endpoint: str = ""
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_bucket: str = "ircc-uploads"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",")]

    class Config:
        env_file = ".env"


settings = Settings()
