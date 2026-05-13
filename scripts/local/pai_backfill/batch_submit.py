"""
Bedrock batch test — 100 products.

# @MX:NOTE: 권한 풀림 확인 후 첫 batch job. JSONL 생성 → S3 업로드 → CreateModelInvocationJob.
# @MX:NOTE: poll 은 별도 스크립트 (batch_poll.py). 결과 DB upsert 는 batch_apply.py.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import os
import sys
import time
from pathlib import Path
from typing import Optional

import boto3
import httpx
from PIL import Image

ENV_PATH = Path(__file__).parent.parent.parent.parent / ".env.local"
if ENV_PATH.exists():
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        v = v.strip().strip('"').strip("'")
        if k.strip() and k.strip() not in os.environ:
            os.environ[k.strip()] = v

MODEL_ID = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
ANTHROPIC_VERSION = "bedrock-2023-05-31"
BUCKET = "kiko-pai-batch"
ROLE_ARN = "arn:aws:iam::389068786328:role/BedrockBatchPaiRole"
REGION = "us-east-1"
RESIZE_MAX = 512
JPEG_QUALITY = 85

PG_URL = os.environ["DB_URL"]
PG_TOKEN = os.environ["DB_TOKEN"]


def load_prompts() -> tuple[str, str, str]:
    pt = Path(__file__).parent / "prompt.txt"
    text = pt.read_text(encoding="utf-8")
    sys_start = text.index("SYSTEM PROMPT (Claude messages.system):") + len(
        "SYSTEM PROMPT (Claude messages.system):"
    )
    user_start = text.index("USER PROMPT (sent with image):")
    sys_section = text[sys_start:user_start]
    user_section = text[user_start + len("USER PROMPT (sent with image):") :]
    sys_clean = "\n".join(
        l for l in sys_section.splitlines() if not l.startswith("===")
    ).strip()
    user_clean = "\n".join(
        l for l in user_section.splitlines() if not l.startswith("===")
    ).strip()
    ph = hashlib.sha256((sys_clean + "\n" + user_clean).encode()).hexdigest()[:16]
    return sys_clean, user_clean, ph


def fetch_products(n: int) -> list[dict]:
    """기존 PAI 가 없거나 v1 인 products 중 image_url 있는 것 n 개."""
    headers = {
        "Authorization": f"Bearer {PG_TOKEN}",
        "Accept-Profile": "public",
    }
    with httpx.Client(timeout=30, headers=headers) as http:
        resp = http.get(
            f"{PG_URL}/products",
            params={
                "select": "id,name,image_url",
                "image_url": "not.is.null",
                "limit": str(n * 2),
                "order": "created_at.desc",
            },
        )
        resp.raise_for_status()
        rows = resp.json()
    return [r for r in rows if r.get("image_url")][:n]


def download_b64(http: httpx.Client, url: str) -> Optional[str]:
    try:
        r = http.get(url)
        r.raise_for_status()
        img = Image.open(io.BytesIO(r.content)).convert("RGB")
        img.thumbnail((RESIZE_MAX, RESIZE_MAX), Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=JPEG_QUALITY, optimize=True)
        return base64.b64encode(buf.getvalue()).decode("ascii")
    except (httpx.HTTPError, OSError, ValueError):
        return None


def build_record(pid: str, b64: str, sys_p: str, user_p: str) -> dict:
    return {
        "recordId": pid[:64],
        "modelInput": {
            "anthropic_version": ANTHROPIC_VERSION,
            "max_tokens": 700,
            "temperature": 0.0,
            "system": sys_p,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": "image/jpeg",
                                "data": b64,
                            },
                        },
                        {"type": "text", "text": user_p},
                    ],
                }
            ],
        },
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=100)
    args = ap.parse_args()

    sys_p, user_p, ph = load_prompts()
    print(f"[init] prompt_hash={ph}")

    products = fetch_products(args.n * 2)
    print(f"[init] {len(products)} products fetched (target {args.n} OK)")

    jsonl_path = Path(f"/tmp/pai-batch-{args.n}.jsonl")
    map_path = Path(f"/tmp/pai-batch-{args.n}-map.json")

    http = httpx.Client(timeout=60)
    pid_map = {}
    n_ok = 0
    with jsonl_path.open("w", encoding="utf-8") as f:
        for i, p in enumerate(products, 1):
            if n_ok >= args.n:
                break
            pid = p["id"]
            name = (p.get("name") or "")[:40]
            print(f"  [{i} · ok={n_ok}/{args.n}] {pid[:8]} · {name}", flush=True)
            b64 = download_b64(http, p["image_url"])
            if not b64:
                print(f"    ❌ download failed", flush=True)
                continue
            rec = build_record(pid, b64, sys_p, user_p)
            f.write(json.dumps(rec) + "\n")
            pid_map[pid[:64]] = {"product_id": pid, "name": p.get("name")}
            n_ok += 1
    http.close()

    map_path.write_text(json.dumps(pid_map, ensure_ascii=False, indent=2))
    size_mb = jsonl_path.stat().st_size / 1024 / 1024
    print(f"\n[jsonl] {n_ok} records · {size_mb:.1f} MB → {jsonl_path}")

    if n_ok < 100:
        print(f"[fatal] Bedrock batch 최소 100건 필요. 현재 {n_ok}. 중단.", file=sys.stderr)
        return 2

    ts = time.strftime("%Y%m%dT%H%M%S")
    s3_key_in = f"input/pai-{ts}.jsonl"
    s3_key_out = f"output/pai-{ts}/"

    session = boto3.Session(profile_name="kiko.ai", region_name=REGION)
    s3 = session.client("s3")
    print(f"[s3] upload → s3://{BUCKET}/{s3_key_in}")
    s3.upload_file(str(jsonl_path), BUCKET, s3_key_in)

    bedrock = session.client("bedrock")
    job_name = f"pai-test-{ts}"
    print(f"[bedrock] CreateModelInvocationJob → {job_name}")
    try:
        resp = bedrock.create_model_invocation_job(
            jobName=job_name,
            roleArn=ROLE_ARN,
            modelId=MODEL_ID,
            inputDataConfig={
                "s3InputDataConfig": {
                    "s3Uri": f"s3://{BUCKET}/{s3_key_in}",
                    "s3InputFormat": "JSONL",
                }
            },
            outputDataConfig={
                "s3OutputDataConfig": {"s3Uri": f"s3://{BUCKET}/{s3_key_out}"}
            },
        )
        job_arn = resp["jobArn"]
        print(f"\n✅ Job submitted")
        print(f"   jobArn   : {job_arn}")
        print(f"   jobName  : {job_name}")
        print(f"   input    : s3://{BUCKET}/{s3_key_in}")
        print(f"   output   : s3://{BUCKET}/{s3_key_out}")
        print(f"   map      : {map_path}")
        print(f"\n📌 다음:")
        print(f"   poll: aws bedrock get-model-invocation-job --profile kiko.ai \\")
        print(f"           --region {REGION} --job-identifier '{job_arn}'")
        return 0
    except Exception as e:
        print(f"[fatal] CreateModelInvocationJob 실패: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
