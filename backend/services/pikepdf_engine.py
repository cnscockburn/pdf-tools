"""pikepdf-based operations — primarily encryption/decryption."""
import io

import pikepdf


def encrypt(file_bytes: bytes, user_password: str, owner_password: str = "") -> bytes:
    """Encrypt a PDF with AES-256. owner_password defaults to user_password."""
    pdf = pikepdf.open(io.BytesIO(file_bytes))
    out = io.BytesIO()
    pdf.save(
        out,
        encryption=pikepdf.Encryption(
            user=user_password,
            owner=owner_password or user_password,
            R=6,  # AES-256
        ),
    )
    return out.getvalue()


def decrypt(file_bytes: bytes, password: str) -> bytes:
    """Remove password protection from a PDF."""
    try:
        pdf = pikepdf.open(io.BytesIO(file_bytes), password=password)
    except pikepdf.PasswordError:
        raise ValueError("Incorrect password.")
    out = io.BytesIO()
    pdf.save(out)
    return out.getvalue()
