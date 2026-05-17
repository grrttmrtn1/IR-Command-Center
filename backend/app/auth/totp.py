import base64
import hashlib
import secrets
import pyotp
import qrcode
import io


def generate_totp_secret() -> str:
    return pyotp.random_base32()


def get_totp_uri(secret: str, email: str, issuer: str = "IR Command Center") -> str:
    return pyotp.totp.TOTP(secret).provisioning_uri(name=email, issuer_name=issuer)


def generate_qr_code_b64(uri: str) -> str:
    img = qrcode.make(uri)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


def verify_totp(secret: str, code: str) -> bool:
    totp = pyotp.TOTP(secret)
    return totp.verify(code, valid_window=1)


def generate_backup_codes(count: int = 8) -> list[tuple[str, str]]:
    """Returns list of (plaintext_code, hashed_code)."""
    codes = []
    for _ in range(count):
        code = secrets.token_hex(4).upper()
        code_hash = hashlib.sha256(code.encode()).hexdigest()
        codes.append((code, code_hash))
    return codes


def verify_backup_code(code: str, code_hash: str) -> bool:
    return hashlib.sha256(code.encode()).hexdigest() == code_hash
