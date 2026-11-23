from app.core.crypto import (
    decrypt_pii,
    encrypt_pii,
    fingerprint_pii,
    mask_aadhaar,
    mask_bank_account,
    mask_bank_ifsc,
    mask_digits,
    mask_pan,
)


def test_encryption_round_trip() -> None:
    plaintext = "ABCDE1234F"
    encrypted = encrypt_pii(plaintext)
    assert encrypted is not None
    assert encrypted != plaintext
    assert encrypted.startswith("v1:")

    decrypted = decrypt_pii(encrypted)
    assert decrypted == plaintext


def test_encryption_with_context() -> None:
    tenant_a = "11111111-1111-1111-1111-111111111111"
    tenant_b = "22222222-2222-2222-2222-222222222222"
    plaintext = "555566667777"

    encrypted = encrypt_pii(plaintext, context=tenant_a)
    assert encrypted is not None

    # Decrypt with correct tenant context succeeds
    assert decrypt_pii(encrypted, context=tenant_a) == plaintext

    # Decrypt with mismatched tenant context fails
    assert decrypt_pii(encrypted, context=tenant_b) is None


def test_masking_pan() -> None:
    assert mask_pan("ABCDE1234F") == "XXXXX1234"
    assert mask_pan(None) is None
    assert mask_pan("") is None


def test_masking_aadhaar() -> None:
    assert mask_aadhaar("123456781234") == "XXXXXXXX1234"
    assert mask_aadhaar("1234 5678 1234") == "XXXXXXXX1234"
    assert mask_aadhaar(None) is None


def test_masking_bank_account() -> None:
    assert mask_bank_account("9876543210") == "XXXXXX3210"
    assert mask_bank_account(None) is None


def test_masking_bank_ifsc() -> None:
    assert mask_bank_ifsc("SBIN0001234") == "XXXXXXX1234"
    assert mask_bank_ifsc(None) is None


def test_masking_uan_and_esic() -> None:
    assert mask_digits("100012345678") == "XXXXXXXX5678"
    assert mask_digits("12345678901234567") == "XXXXXXXXXXXXX4567"
    assert mask_digits(None) is None


def test_fingerprint_is_stable_and_tenant_scoped() -> None:
    tenant_a = "11111111-1111-1111-1111-111111111111"
    tenant_b = "22222222-2222-2222-2222-222222222222"
    first = fingerprint_pii("100012345678", tenant_a)
    assert first is not None
    assert len(first) == 64
    assert first == fingerprint_pii("100012345678", tenant_a)
    assert first != fingerprint_pii("100012345678", tenant_b)
    assert fingerprint_pii(None, tenant_a) is None
