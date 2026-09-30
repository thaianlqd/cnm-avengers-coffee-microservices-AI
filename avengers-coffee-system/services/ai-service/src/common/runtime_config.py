"""Runtime configuration guards shared by AI service integrations."""
import os


def secret_with_dev_default(name: str, development_default: str) -> str:
    value = str(os.getenv(name) or "").strip()
    if value:
        return value
    environment = str(os.getenv("ENVIRONMENT") or os.getenv("NODE_ENV") or "").lower()
    if environment == "production":
        raise RuntimeError(f"Missing required production configuration: {name}")
    return development_default
