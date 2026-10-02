"""Evidence for choosing the wallet after Vietnamese accent normalization.

The conjunction ``vì`` and the noun ``ví`` both become ``vi``. A bare token
therefore cannot identify a payment method.
"""
import re


_WALLET_ACTION = re.compile(
    r"\b(?:thanh toan|tra|dung|chon|su dung)\s+(?:bang\s+)?vi(?:\s+(?:avengers|dien tu))?\b"
)
_WALLET_NOUN = re.compile(r"\bvi\s+(?:avengers|dien tu)\b")
_NEGATION = re.compile(r"\b(?:khong|ko|chua|dung)\s+(?:muon\s+)?$")


def resolve_wallet_payment_intent(normalized_text: str):
    """Return True for a choice, False for a negated choice, None if absent."""
    text = str(normalized_text or "")
    matches = list(_WALLET_ACTION.finditer(text))
    matches.extend(match for match in _WALLET_NOUN.finditer(text)
                   if not any(action.start() <= match.start() < action.end() for action in matches))
    if not matches:
        return None
    latest = max(matches, key=lambda match: match.start())
    prefix = text[:latest.start()]
    return not bool(_NEGATION.search(prefix))


def wallet_payment_evidence(normalized_text: str) -> bool:
    return resolve_wallet_payment_intent(normalized_text) is True
