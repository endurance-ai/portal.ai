# SPEC-BRAND-NODE-001 — Brand-level Node 배정 파이프라인

**Status**: Draft
**Created**: 2026-05-13
**Depends on**: SPEC-NODE-REDESIGN-001, SPEC-PROMPT-REGISTRY-001
**Blocks**: SPEC-BRAND-EMBED-001, SPEC-SEARCH-V6-001

---

## 1. 문제

`brand_attributes.style_node` 가 어떻게 채워지는지 불분명, 매뉴얼 추측. brand 정체성의 누적 신호 없어서 "비슷한 브랜드 추천" / "브랜드 감도 기반 검색" 모두 불가.

**현재 상태:**
- product_ai_analysis 에 product-level style_node 만 존재 (97k 중 2,295 행만 채움)
- VLM 합의도 28% — product-level noise 큼
- brand 단위 정체성 데이터 없음

**비용 문제:**
- 80k product VLM = $26 (Nova) / $440 (Haiku) — over-spent for brand identity 추출
- 같은 brand 의 80k 중 80개 product 가 동일 node 라면 80번 호출은 낭비

---

## 2. 목표

1. **Brand-first 감도 배정**: 700 brand 마다 5 image VLM 호출 → primary_node + secondary_node + confidence.
2. **비용 효율**: ~3,500 VLM 호출 (700 × 5) = $24 (Haiku) — product 80k 대비 18배 ↓.
3. **품질**: brand 단위 averaging 으로 VLM noise 감소 (28% → 50-60% 목표).
4. **Fallback**: 5장 미만 brand 는 admin queue 로 분기.
5. **Override 메커니즘**: 같은 brand 내 archive/sub-line 은 product PAI 가 override 가능 (SPEC-SEARCH-V6 와 합의).

---

## 3. Acceptance Criteria

- **AC-001**: 700 brand 중 image 5장 이상 보유한 brand 의 `primary_node` 가 NULL 이 아니어야 한다.
- **AC-002**: 각 brand row 의 `node_confidence` 가 0.0-1.0 범위에 있고, `node_assigned_at` 가 NOT NULL 이다.
- **AC-003**: `representative_image_urls` 컬럼이 정확히 5개 URL 보유 (or NULL if cold-start).
- **AC-004**: VLM 호출 시 SPEC-PROMPT-REGISTRY-001 의 `brand-vlm` situation prompt 를 사용한다.
- **AC-005**: 5장 미만 brand 는 `brand_node_review_queue` 에 row 생성, admin UI 에서 확인 가능.
- **AC-006**: 배정 confidence < 0.7 인 brand 도 admin review queue 로 분기.
- **AC-007**: 전체 파이프라인 dry-run / wet-run 모드 분리. wet-run 시 idempotent (재실행해도 결과 동일).
- **AC-008**: 실패한 brand 는 `/tmp/brand-node-failed.jsonl` 에 기록, 재실행으로 복구 가능.

---

## 4. Schema 추가

```sql
-- 053_brand_node_review.sql
CREATE TABLE brand_node_review_queue (
  brand_id      uuid PRIMARY KEY REFERENCES brands(id) ON DELETE CASCADE,
  reason        text NOT NULL,                  -- 'insufficient_images' | 'low_confidence' | 'multi_node_conflict'
  vlm_output    jsonb,                          -- VLM raw response (있으면)
  admin_note    text,
  resolved_at   timestamptz,
  resolved_by   text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_brand_node_review_open ON brand_node_review_queue(brand_id) WHERE resolved_at IS NULL;
```

---

## 5. 파이프라인 설계

### 5.1 Input 선정

```sql
-- brand 별 image 보유 product 카운트
SELECT b.id, b.name, COUNT(p.id) AS image_count
FROM brands b
JOIN products p ON p.brand_id = b.id
WHERE p.image_url IS NOT NULL AND p.in_stock = true
GROUP BY b.id, b.name
HAVING COUNT(p.id) >= 5
ORDER BY image_count DESC;
```

→ 5장 미만 brand 는 review queue 로 직행.

### 5.2 5장 선정 (무작위)

```python
def select_representative_images(brand_id: str, n: int = 5) -> list[str]:
    products = pg.select("products", {
        "brand_id": f"eq.{brand_id}",
        "image_url": "not.is.null",
        "in_stock": "eq.true",
        "limit": "100",  # pool size
    })
    sample = random.sample(products, min(n, len(products)))
    return [p["image_url"] for p in sample]
```

**향후 보강 (백로그)**: brand 공식 홈페이지 about 페이지 / 인스타 bio + 캡션 / 룩북 PDF — 멀티모달 입력. Phase 2.

### 5.3 VLM 호출 (1 brand = 1 호출, 5장 동시)

Bedrock Haiku 4.5 invoke_model with **multi-image content**:

```python
body = {
    "anthropic_version": "bedrock-2023-05-31",
    "max_tokens": 800,
    "system": brand_vlm_system_prompt,  # SPEC-PROMPT-REGISTRY 'brand-vlm'
    "messages": [{
        "role": "user",
        "content": [
            {"type": "image", "source": {...image1...}},
            {"type": "image", "source": {...image2...}},
            {"type": "image", "source": {...image3...}},
            {"type": "image", "source": {...image4...}},
            {"type": "image", "source": {...image5...}},
            {"type": "text", "text": "Analyze this brand's overall sensibility across 5 representative products. Output JSON with primary_node, secondary_node, confidence, and reasoning."},
        ],
    }],
}
```

**예상 출력**:
```json
{
  "primary_node": "D",
  "secondary_node": "A-3",
  "confidence": 0.85,
  "reasoning": "Contemporary casual with strong heritage workwear cues — washed denim, military-inspired details across 3 of 5 items."
}
```

### 5.4 적용 + 검증

```python
if vlm_output["confidence"] >= 0.7:
    pg.upsert("brands", {
        "id": brand_id,
        "primary_node": vlm_output["primary_node"],
        "secondary_node": vlm_output.get("secondary_node"),
        "node_confidence": vlm_output["confidence"],
        "node_assigned_at": "now()",
        "representative_image_urls": image_urls,
    })
else:
    enqueue_review(brand_id, reason="low_confidence", vlm_output=vlm_output)
```

---

## 6. 구현 단계

**P1**: brand image 가용성 audit
- 700 brand × image count 통계 → 5장 이상 / 미만 분리
- /tmp/brand-image-audit.json 출력

**P2**: brand-vlm prompt 작성 (SPEC-PROMPT-REGISTRY 와 연계)
- 5 image 동시 분석 system prompt
- 출력 JSON schema 명확화

**P3**: 파이프라인 스크립트
- `scripts/local/brand_backfill/run_brand_node.py`
- workers=4, RPM safe margin
- dry-run / wet-run 분리
- failure jsonl logging

**P4**: 실행
- dry-run 으로 10 brand smoke
- 검증 OK 이면 wet-run 700 brand (~$24, 2h Haiku / ~$1.5 Nova)

**P5**: Admin review UI
- `/admin/brand-node-review` — queue 표시 + 수동 배정 + 5장 교체

---

## 7. 모델 선택

| 모델 | 700 brand 비용 | 시간 | 품질 |
|---|---|---|---|
| Haiku 4.5 | ~$24 | ~2h (RPM 50) | Gold standard |
| Nova Lite | ~$1.5 | ~1h (RPM 400) | Mid (28% style_node agreement, but brand-level averaging 으로 보정 기대) |
| Nova Pro | ~$13 | ~2h (RPM 50) | 미측정, Haiku ~80% 수준 예상 |

**추천**: **Haiku 4.5** — brand identity 는 한 번 박으면 거의 안 바뀌므로 비용 vs 품질 trade-off 에서 품질이 우선. $24 는 마지노선.

**대안**: Nova Lite + Haiku double-pass. Nova 가 1차, confidence < 0.8 인 brand 만 Haiku 재호출. 비용 절반, 품질 90% 유지.

---

## 8. Out of Scope

- Brand 임베딩 벡터 생성 → SPEC-BRAND-EMBED-001
- Brand 정의 multi-line 분할 (A.P.C. main vs archive) → 백로그
- 새로 크롤된 brand 의 auto-onboarding → 별도 SPEC 또는 cron job 으로 후속

---

## 9. Risks

| Risk | 완화 |
|---|---|
| 700 brand 중 5장 미만이 많음 | audit 단계에서 통계 확인. 너무 많으면 4장으로 낮춤 검토 |
| VLM 가 5 image 동시 처리 시 token 폭발 | image resize (512px) + max_tokens 800 |
| confidence < 0.7 의 brand 가 너무 많음 | prompt 튜닝 1-2회 + threshold 조정 |
| Multi-node brand 의 archive line product 가 primary node 에 묶여 검색됨 | 후속 SPEC (Product PAI override) 또는 sub-brand 분리 백로그 |
| Brand image 가 product image 와 다를 때 (룩북 vs 상품컷) | 1차는 상품컷, 보강 단계에서 룩북 별도 수집 |
