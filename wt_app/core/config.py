from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    secret_key: str = "change_me"
    access_token_minutes: int = 60
    max_active_users: int = 100          # capacity before waitlist
    signups_open: bool = True            # set False to freeze signups
    admin_api_key: str = "dev-key"
    sqlite_url: str = "sqlite+aiosqlite:///./worldtycoon.db"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

settings = Settings()
