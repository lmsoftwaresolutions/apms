from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://apms_app:apms_app@localhost:5432/apms"
    database_url_migrate: str = "postgresql+asyncpg://apms:apms@localhost:5432/apms"
    jwt_secret: str = "dev-only-change-me"
    jwt_ttl_minutes: int = 480
    cors_origins: str = "http://localhost:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()
