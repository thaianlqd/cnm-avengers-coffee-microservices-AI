"""Evidence for choosing the wallet after Vietnamese accent normalization.

The conjunction ``vì`` and the noun ``ví`` both become ``vi``. A bare token
therefore cannot identify a payment method.
"""
import re


def wallet_payment_evidence(normalized_text: str) -> bool:
    text = str(normalized_text or "")
    return bool(re.search(
        r"\bvi\s+(?:avengers|dien tu)\b"
        r"|\b(?:thanh toan|tra|dung|chon|su dung)\s+(?:bang\s+)?vi\b",
        text,
    ))
