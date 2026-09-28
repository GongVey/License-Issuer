"""Independent PA1 verifier, following core/license.rs (no customer data or keys on disk)."""
import base64
import json
import sys
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey


def decode(value):
    assert '=' not in value
    raw = base64.urlsafe_b64decode(value + '=' * (-len(value) % 4))
    assert base64.urlsafe_b64encode(raw).decode().rstrip('=') == value
    return raw


def verify(code, public_key, machine):
    version, encoded, signature = code.strip().split('.')
    assert version == 'PA1'
    payload_bytes = decode(encoded)
    signature_bytes = decode(signature)
    assert len(signature_bytes) == 64
    Ed25519PublicKey.from_public_bytes(decode(public_key)).verify(signature_bytes, payload_bytes)
    payload = json.loads(payload_bytes)
    assert isinstance(payload['licenseId'], str) and payload['licenseId'].strip()
    assert isinstance(payload['edition'], str) and payload['edition'].strip()
    assert type(payload['issuedAt']) is int and -(2**63) <= payload['issuedAt'] < 2**63
    assert payload['machineFingerprint'] == machine
    return payload


data = json.load(sys.stdin)
payload = verify(data['code'], data['publicKey'], data['machine'])
for invalid_code, invalid_machine in [
    (data['tampered'], data['machine']),
    (data['code'], 'sha256:' + 'f' * 64),
    (data['wrongMessageSignature'], data['machine']),
]:
    try:
        verify(invalid_code, data['publicKey'], invalid_machine)
    except Exception:
        pass
    else:
        raise AssertionError('Invalid code accepted')
print(json.dumps(payload))
