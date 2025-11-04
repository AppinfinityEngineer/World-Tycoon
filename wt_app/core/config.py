# wt_app/core/config.py
from __future__ import annotations
from typing import Set

from pydantic import Field, AliasChoices, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # --- existing fields (kept) ---
    secret_key: str = "change_me"                 # legacy; still read
    access_token_minutes: int = 60
    max_active_users: int = 100
    signups_open: bool = True
    admin_api_key: str = "dev-key"
    sqlite_url: str = "sqlite+aiosqlite:///./worldtycoon.db"

    # --- new fields (env-driven) ---
    jwt_secret: str = Field(
        default="",
        validation_alias=AliasChoices("WT_JWT_SECRET"),
    )
    admin_emails_raw: str = Field(
        default="",
        validation_alias=AliasChoices("WT_ADMIN_EMAILS"),
    )
    settings_hmac_key: str = Field(
        default="dev-hmac-change-me",
        validation_alias=AliasChoices("WT_SETTINGS_HMAC_KEY"),
    )

    # --- back-compat with your .env keys (lowercase present) ---
    wt_auto_tick_min: int = Field(
        default=5,
        validation_alias=AliasChoices("wt_auto_tick_min", "WT_AUTO_TICK_MIN"),
    )
    env: str = Field(
        default="dev",
        validation_alias=AliasChoices("env", "ENV"),
    )

    # Derived/normalized
    admin_emails: Set[str] = set()

    # pydantic-settings v2 config
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",   # ignore any future unknown .env keys instead of crashing
    )

    @model_validator(mode="after")
    def _normalize(self):
        # If WT_JWT_SECRET isn't set, fall back to legacy secret_key for JWT
        if not self.jwt_secret:
            self.jwt_secret = self.secret_key

        # Normalize admin emails
        if self.admin_emails_raw:
            self.admin_emails = {
                e.strip().lower() for e in self.admin_emails_raw.split(",") if e.strip()
            }
        else:
            self.admin_emails = set()

        return self


settings = Settings()
