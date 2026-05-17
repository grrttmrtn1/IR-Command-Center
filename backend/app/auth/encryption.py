import base64
import json
import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from app.config import settings


def _get_key() -> bytes:
    key_hex = settings.encryption_key
    key_bytes = bytes.fromhex(key_hex) if len(key_hex) == 64 else key_hex.encode()[:32]
    return key_bytes[:32]


def encrypt(data: dict | str) -> str:
    key = _get_key()
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    plaintext = json.dumps(data).encode() if isinstance(data, dict) else data.encode()
    ciphertext = aesgcm.encrypt(nonce, plaintext, None)
    return base64.b64encode(nonce + ciphertext).decode()


def decrypt(encrypted: str) -> dict | str:
    key = _get_key()
    aesgcm = AESGCM(key)
    raw = base64.b64decode(encrypted)
    nonce, ciphertext = raw[:12], raw[12:]
    plaintext = aesgcm.decrypt(nonce, ciphertext, None).decode()
    try:
        return json.loads(plaintext)
    except json.JSONDecodeError:
        return plaintext
