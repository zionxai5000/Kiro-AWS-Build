"""Upload GitHub Actions secrets via the API using libsodium sealed-box encryption."""
import base64
import json
import os
import sys
import urllib.request

from nacl import encoding, public

REPO = "zionxai5000/Kiro-AWS-Build"

def encrypt(public_key: str, secret_value: str) -> str:
    pk = public.PublicKey(public_key.encode("utf-8"), encoding.Base64Encoder())
    sealed = public.SealedBox(pk)
    encrypted = sealed.encrypt(secret_value.encode("utf-8"))
    return base64.b64encode(encrypted).decode("utf-8")

def gh_request(method, path, token, body=None):
    url = f"https://api.github.com{path}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
    }
    data = json.dumps(body).encode("utf-8") if body else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        resp = urllib.request.urlopen(req)
        raw = resp.read().decode("utf-8")
        return resp.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode("utf-8")) if e.fp else None

def put_secret(token, public_key_id, public_key, name, value):
    encrypted = encrypt(public_key, value)
    code, body = gh_request(
        "PUT",
        f"/repos/{REPO}/actions/secrets/{name}",
        token,
        {"encrypted_value": encrypted, "key_id": public_key_id},
    )
    print(f"  {name}: {code}")
    if code >= 300:
        print(f"  body: {body}")

def main():
    token = sys.argv[1]
    secrets = {
        "AWS_ACCESS_KEY_ID": sys.argv[2],
        "AWS_SECRET_ACCESS_KEY": sys.argv[3],
    }

    code, pk = gh_request("GET", f"/repos/{REPO}/actions/secrets/public-key", token)
    if code != 200:
        print(f"Failed to fetch public key: {code} {pk}")
        sys.exit(1)
    print(f"public key id: {pk['key_id']}")
    for name, val in secrets.items():
        put_secret(token, pk["key_id"], pk["key"], name, val)

if __name__ == "__main__":
    main()
