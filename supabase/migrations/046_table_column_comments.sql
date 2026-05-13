-- 046_table_column_comments.sql
-- 모든 활성 public 테이블/뷰/matview에 한글 COMMENT 부여.
-- 메타데이터는 DB 단일 진실원. psql `\d+ <table>` 또는 information_schema.columns.col_description() 로 즉시 조회.
--
-- Source: ~/Desktop/aws-infra/docs/kikoai-dev/26-05-07-db-reference.md §5
-- Author: pai-sync-backfill session (2026-05-12)
-- Idempotent: COMMENT ON 은 멱등 — 재실행 안전.

-- =========================================================================
-- 5.1 products — 상품 카탈로그 본체
-- =========================================================================
BEGIN;

COMMENT ON TABLE products IS '상품 카탈로그 — 크롤러가 적재, 검색 RPC가 소비하는 핵심 테이블 (697 브랜드 / 81k SKU)';

COMMENT ON COLUMN products.id              IS 'PK uuid';
COMMENT ON COLUMN products.brand           IS '브랜드 표기 (raw, 정규화 전)';
COMMENT ON COLUMN products.name            IS '상품명';
COMMENT ON COLUMN products.product_url     IS '원본 상품 URL (UNIQUE — dedupe key)';
COMMENT ON COLUMN products.image_url       IS '대표 이미지 URL';
COMMENT ON COLUMN products.images          IS '이미지 URL 배열 (0번이 대표)';
COMMENT ON COLUMN products.platform        IS '쇼핑몰 식별자 (예: AMOMENTO/SSENSE/Cafe24)';
COMMENT ON COLUMN products.product_no      IS 'Cafe24 상품번호 (dedupe key)';
COMMENT ON COLUMN products.product_code    IS '외부 상품코드';
COMMENT ON COLUMN products.description     IS '상세 설명';
COMMENT ON COLUMN products.category        IS '카테고리 — Outer/Top/Bottom/Shoes/Bag/Accessories/Dress/Knitwear/Shirts';
COMMENT ON COLUMN products.subcategory     IS '서브카테고리';
COMMENT ON COLUMN products.gender          IS 'gender 태그 배열';
COMMENT ON COLUMN products.color           IS '색상';
COMMENT ON COLUMN products.material        IS '소재';
COMMENT ON COLUMN products.size_info       IS '사이즈 정보';
COMMENT ON COLUMN products.tags            IS '태그 배열';
COMMENT ON COLUMN products.style_node      IS '스타일 노드 분류 (A-1..K — 15개 enum)';
COMMENT ON COLUMN products.in_stock        IS '재고 여부 (검색 RPC가 true만 노출)';
COMMENT ON COLUMN products.price           IS '가격 (KRW 환산가)';
COMMENT ON COLUMN products.original_price  IS '원가 (KRW)';
COMMENT ON COLUMN products.sale_price      IS '세일가 KRW (NULL = 세일 아님)';
COMMENT ON COLUMN products.source_currency IS '원본 통화 (USD/EUR/GBP/KRW). NULL = legacy KRW';
COMMENT ON COLUMN products.source_price    IS '원본 통화 기준 가격 (FX 변환 입력)';
COMMENT ON COLUMN products.review_count    IS '리뷰 수';
COMMENT ON COLUMN products.embedding       IS 'FashionSigLIP 이미지 임베딩 (halfvec 768)';
COMMENT ON COLUMN products.embedding_model IS '임베딩 모델 식별자 (예: Marqo/marqo-fashionSigLIP)';
COMMENT ON COLUMN products.embedded_at     IS '임베딩 생성 시각';
COMMENT ON COLUMN products.crawled_at      IS '크롤 시각';
COMMENT ON COLUMN products.last_seen_at    IS '마지막 크롤 확인 시각 (soft-delete 판단 근거)';
COMMENT ON COLUMN products.created_at      IS '레코드 생성 시각';
COMMENT ON COLUMN products.updated_at      IS '레코드 갱신 시각';

-- =========================================================================
-- 5.2 product_ai_analysis (PAI) — 상품별 LLM 분석 결과
-- =========================================================================
COMMENT ON TABLE product_ai_analysis IS '상품별 LLM 비전 분석 결과 (PAI) — 검색 v5/v6의 핵심 입력. UNIQUE(product_id, version)';

COMMENT ON COLUMN product_ai_analysis.id            IS 'PK uuid';
COMMENT ON COLUMN product_ai_analysis.product_id    IS 'products FK CASCADE';
COMMENT ON COLUMN product_ai_analysis.version       IS '분석 버전 (v1)';
COMMENT ON COLUMN product_ai_analysis.model_id      IS 'LLM 모델 ID';
COMMENT ON COLUMN product_ai_analysis.prompt_hash   IS '프롬프트 해시 (idempotency)';
COMMENT ON COLUMN product_ai_analysis.category      IS '분석 카테고리';
COMMENT ON COLUMN product_ai_analysis.subcategory   IS '서브카테고리';
COMMENT ON COLUMN product_ai_analysis.fit           IS '핏';
COMMENT ON COLUMN product_ai_analysis.fabric        IS '패브릭';
COMMENT ON COLUMN product_ai_analysis.color_family  IS '컬러 패밀리';
COMMENT ON COLUMN product_ai_analysis.color_detail  IS '세부 컬러';
COMMENT ON COLUMN product_ai_analysis.style_node    IS '스타일 노드 (PAI 기준)';
COMMENT ON COLUMN product_ai_analysis.mood_tags     IS '무드 태그 배열';
COMMENT ON COLUMN product_ai_analysis.keywords_ko   IS '한글 키워드 배열';
COMMENT ON COLUMN product_ai_analysis.keywords_en   IS '영문 키워드 배열';
COMMENT ON COLUMN product_ai_analysis.season        IS '시즌 — spring/summer/fall/winter/all-season';
COMMENT ON COLUMN product_ai_analysis.pattern       IS '패턴 — solid/stripe/check/plaid/floral/dot/abstract/camo/animal/graphic';
-- v6 axis 8종 (045에서 추가)
COMMENT ON COLUMN product_ai_analysis.neckline     IS 'v6 axis — 넥라인';
COMMENT ON COLUMN product_ai_analysis.sleeve       IS 'v6 axis — 소매';
COMMENT ON COLUMN product_ai_analysis.length       IS 'v6 axis — 기장';
COMMENT ON COLUMN product_ai_analysis.closure      IS 'v6 axis — 클로저 (지퍼/단추 등)';
COMMENT ON COLUMN product_ai_analysis.texture      IS 'v6 axis — 텍스처';
COMMENT ON COLUMN product_ai_analysis.decoration   IS 'v6 axis — 장식';
COMMENT ON COLUMN product_ai_analysis.silhouette   IS 'v6 axis — 실루엣';
COMMENT ON COLUMN product_ai_analysis.formality    IS 'v6 axis — 격식도';
COMMENT ON COLUMN product_ai_analysis.confidence   IS '분석 신뢰도 0..1';
COMMENT ON COLUMN product_ai_analysis.raw_response IS 'LLM 원본 응답 jsonb';
COMMENT ON COLUMN product_ai_analysis.error        IS '분석 에러 메시지';
COMMENT ON COLUMN product_ai_analysis.created_at   IS '분석 시각';

-- =========================================================================
-- 5.3 product_reviews — 상품 리뷰 (크롤링 수집)
-- =========================================================================
COMMENT ON TABLE product_reviews IS '상품 리뷰 (크롤러 수집) — 어드민 상세에서 표시';

COMMENT ON COLUMN product_reviews.id          IS 'PK uuid';
COMMENT ON COLUMN product_reviews.product_id  IS 'products FK CASCADE';
COMMENT ON COLUMN product_reviews.author      IS '작성자';
COMMENT ON COLUMN product_reviews.text        IS '리뷰 본문';
COMMENT ON COLUMN product_reviews.photo_urls  IS '첨부 사진 URL 배열';
COMMENT ON COLUMN product_reviews.body_info   IS '신체 정보 jsonb (키/몸무게 등)';
COMMENT ON COLUMN product_reviews.review_date IS '리뷰 일자 (raw text)';
COMMENT ON COLUMN product_reviews.created_at  IS '레코드 생성 시각';

-- =========================================================================
-- 5.4 brand_nodes — 브랜드 그래프 노드
-- =========================================================================
COMMENT ON TABLE brand_nodes IS '브랜드 그래프의 노드 — BGE-m3 임베딩 + UMAP 2D 시각화';

COMMENT ON COLUMN brand_nodes.id                    IS 'PK uuid';
COMMENT ON COLUMN brand_nodes.brand_name            IS '표시명';
COMMENT ON COLUMN brand_nodes.brand_name_normalized IS '정규화 조인 키 (UNIQUE)';
COMMENT ON COLUMN brand_nodes.aliases               IS '대체 brand 표기 배열';
COMMENT ON COLUMN brand_nodes.brand_keywords        IS '브랜드 키워드 배열';
COMMENT ON COLUMN brand_nodes.attributes            IS 'silhouette/palette/material/detail/vibe jsonb';
COMMENT ON COLUMN brand_nodes.category_type         IS '카테고리 타입 — 의류/주얼리/제외';
COMMENT ON COLUMN brand_nodes.style_node            IS '스타일 노드 분류';
COMMENT ON COLUMN brand_nodes.sensitivity_tags      IS '감수성 태그 배열';
COMMENT ON COLUMN brand_nodes.gender_scope          IS '브랜드 성별 스코프';
COMMENT ON COLUMN brand_nodes.price_band            IS '가격대';
COMMENT ON COLUMN brand_nodes.source_platforms      IS '소스 플랫폼 목록';
COMMENT ON COLUMN brand_nodes.embedding             IS 'BGE-m3 L2-norm 임베딩 vector(1024)';
COMMENT ON COLUMN brand_nodes.embedding_model       IS '임베딩 모델 (BAAI/bge-m3 등)';
COMMENT ON COLUMN brand_nodes.embedding_text_hash   IS 'sha256 idempotency';
COMMENT ON COLUMN brand_nodes.embedded_at           IS '임베딩 생성 시각';
COMMENT ON COLUMN brand_nodes.x_umap                IS 'UMAP 2D x 좌표';
COMMENT ON COLUMN brand_nodes.y_umap                IS 'UMAP 2D y 좌표';
COMMENT ON COLUMN brand_nodes.umap_at               IS 'UMAP 계산 시각';
COMMENT ON COLUMN brand_nodes.updated_at            IS '레코드 갱신 시각';

-- =========================================================================
-- 5.5 brand_similar — 브랜드 유사도 그래프
-- =========================================================================
COMMENT ON TABLE brand_similar IS '브랜드 간 cosine 유사도 (per-brand top-K rank)';

COMMENT ON COLUMN brand_similar.brand_id         IS 'PK + FK CASCADE (기준 브랜드)';
COMMENT ON COLUMN brand_similar.similar_brand_id IS 'PK + FK CASCADE (유사 브랜드)';
COMMENT ON COLUMN brand_similar.similarity       IS 'cosine 유사도 [0,1]';
COMMENT ON COLUMN brand_similar.rank             IS '1..100 (per brand_id)';
COMMENT ON COLUMN brand_similar.computed_at      IS '계산 시각';

-- =========================================================================
-- 5.6 brand_attribute_proposals — 브랜드 속성 자동 제안 (autonomous loop)
-- =========================================================================
COMMENT ON TABLE brand_attribute_proposals IS '브랜드 속성 자동 제안 큐 — autonomous loop INSERT, admin 승인 대기';

COMMENT ON COLUMN brand_attribute_proposals.id              IS 'PK uuid';
COMMENT ON COLUMN brand_attribute_proposals.brand_id        IS 'brand_nodes FK CASCADE';
COMMENT ON COLUMN brand_attribute_proposals.field           IS '제안 필드 — vibe/palette/material/detail/silhouette';
COMMENT ON COLUMN brand_attribute_proposals.proposed_values IS '제안 후보 배열 (≥1)';
COMMENT ON COLUMN brand_attribute_proposals.confidence      IS '신뢰도 0..1 (≥0.85 → auto_applied)';
COMMENT ON COLUMN brand_attribute_proposals.source          IS '제안 출처';
COMMENT ON COLUMN brand_attribute_proposals.reasoning       IS 'LLM reasoning';
COMMENT ON COLUMN brand_attribute_proposals.status          IS 'pending/approved/rejected/auto_applied';
COMMENT ON COLUMN brand_attribute_proposals.applied_at      IS '적용 시각';
COMMENT ON COLUMN brand_attribute_proposals.reviewed_by     IS '리뷰어';
COMMENT ON COLUMN brand_attribute_proposals.reviewed_at     IS '리뷰 시각';
COMMENT ON COLUMN brand_attribute_proposals.created_at      IS '레코드 생성 시각';

-- =========================================================================
-- 5.7 analyses — 메인 플로우 분석 결과 (이미지 → LLM)
-- =========================================================================
COMMENT ON TABLE analyses IS '메인 플로우 분석 결과 (인스타 이미지 → GPT-4o Vision → 검색 입력)';

COMMENT ON COLUMN analyses.id                      IS 'PK uuid';
COMMENT ON COLUMN analyses.session_id              IS 'analysis_sessions FK SET NULL';
COMMENT ON COLUMN analyses.parent_analysis_id      IS '셀프 FK SET NULL (refinement 체인)';
COMMENT ON COLUMN analyses.sequence_number         IS '세션 내 순서';
COMMENT ON COLUMN analyses.image_url               IS '입력 이미지 URL';
COMMENT ON COLUMN analyses.image_filename          IS '업로드 파일명';
COMMENT ON COLUMN analyses.image_size_bytes        IS '이미지 바이트 크기';
COMMENT ON COLUMN analyses.prompt_text             IS '사용자 프롬프트';
COMMENT ON COLUMN analyses.refinement_prompt       IS '재분석 프롬프트';
COMMENT ON COLUMN analyses.detected_gender         IS '성별 추정';
COMMENT ON COLUMN analyses.mood_summary            IS '무드 요약';
COMMENT ON COLUMN analyses.mood_vibe               IS '무드 vibe';
COMMENT ON COLUMN analyses.mood_tags               IS '무드 태그 jsonb';
COMMENT ON COLUMN analyses.palette                 IS '팔레트 jsonb';
COMMENT ON COLUMN analyses.style_fit               IS '스타일 핏';
COMMENT ON COLUMN analyses.style_aesthetic         IS '스타일 미학';
COMMENT ON COLUMN analyses.style_node_primary      IS '1차 스타일 노드 (15 enum)';
COMMENT ON COLUMN analyses.style_node_secondary    IS '2차 스타일 노드';
COMMENT ON COLUMN analyses.style_node_confidence   IS '스타일 노드 신뢰도 0..1';
COMMENT ON COLUMN analyses.sensitivity_tags        IS '감수성 태그 jsonb';
COMMENT ON COLUMN analyses.items                   IS '아이템 jsonb (analysis_items 풀이 전 raw)';
COMMENT ON COLUMN analyses.search_queries          IS '생성된 검색 쿼리 jsonb';
COMMENT ON COLUMN analyses.search_results          IS '검색 결과 jsonb';
COMMENT ON COLUMN analyses.ai_raw_response         IS 'LLM 원본 응답 jsonb';
COMMENT ON COLUMN analyses.analysis_duration_ms    IS '분석 소요 ms';
COMMENT ON COLUMN analyses.search_duration_ms      IS '검색 소요 ms';
COMMENT ON COLUMN analyses.is_pinned               IS 'admin pin 여부';
COMMENT ON COLUMN analyses.error                   IS '에러 메시지';
COMMENT ON COLUMN analyses.created_at              IS '레코드 생성 시각';

-- =========================================================================
-- 5.8 analysis_items — analyses의 개별 아이템 풀이
-- =========================================================================
COMMENT ON TABLE analysis_items IS 'analyses의 개별 아이템 (Top/Bottom/Shoes 등) 풀이';

COMMENT ON COLUMN analysis_items.id                    IS 'PK uuid';
COMMENT ON COLUMN analysis_items.analysis_id           IS 'analyses FK CASCADE';
COMMENT ON COLUMN analysis_items.item_index            IS '게시물 내 아이템 순서';
COMMENT ON COLUMN analysis_items.item_id               IS '외부 식별자';
COMMENT ON COLUMN analysis_items.category              IS '카테고리';
COMMENT ON COLUMN analysis_items.subcategory           IS '서브카테고리';
COMMENT ON COLUMN analysis_items.name                  IS '아이템명';
COMMENT ON COLUMN analysis_items.detail                IS '상세 설명';
COMMENT ON COLUMN analysis_items.fabric                IS '패브릭';
COMMENT ON COLUMN analysis_items.color                 IS '색상';
COMMENT ON COLUMN analysis_items.color_hex             IS '컬러 hex';
COMMENT ON COLUMN analysis_items.fit                   IS '핏';
COMMENT ON COLUMN analysis_items.position_top          IS '이미지 내 top 좌표 (정규화)';
COMMENT ON COLUMN analysis_items.position_left         IS '이미지 내 left 좌표 (정규화)';
COMMENT ON COLUMN analysis_items.search_query_original IS 'LLM 출력 원본 쿼리';
COMMENT ON COLUMN analysis_items.search_query_sent     IS '실제 전송 쿼리 (gender 합쳐진)';
COMMENT ON COLUMN analysis_items.gender_appended       IS 'gender 합성 여부';
COMMENT ON COLUMN analysis_items.created_at            IS '레코드 생성 시각';

-- =========================================================================
-- 5.9 analysis_sessions — 세션 그룹 (multi-turn refinement)
-- =========================================================================
COMMENT ON TABLE analysis_sessions IS '분석 세션 그룹 — multi-turn refinement 단위';

COMMENT ON COLUMN analysis_sessions.id                IS 'PK uuid';
COMMENT ON COLUMN analysis_sessions.initial_prompt    IS '첫 프롬프트';
COMMENT ON COLUMN analysis_sessions.initial_image_url IS '첫 이미지 URL';
COMMENT ON COLUMN analysis_sessions.gender            IS '세션 gender';
COMMENT ON COLUMN analysis_sessions.analysis_count    IS '세션 내 분석 수';
COMMENT ON COLUMN analysis_sessions.last_analysis_id  IS '최근 analysis id';
COMMENT ON COLUMN analysis_sessions.created_at        IS '레코드 생성 시각';

-- 5.10 item_search_results — Migration 044 에서 DROP 완료 (SerpAPI legacy)

-- =========================================================================
-- 5.11 search_quality_logs — 검색 품질 로그
-- =========================================================================
COMMENT ON TABLE search_quality_logs IS '검색 RPC 호출당 품질 로그 — pipeline-health/analytics에서 소비';

COMMENT ON COLUMN search_quality_logs.id                  IS 'PK uuid';
COMMENT ON COLUMN search_quality_logs.analysis_id         IS 'analyses FK SET NULL';
COMMENT ON COLUMN search_quality_logs.item_id             IS 'analysis_items의 item_id (uuid 아님)';
COMMENT ON COLUMN search_quality_logs.engine_version      IS '엔진 버전 — v4/v5/v6';
COMMENT ON COLUMN search_quality_logs.query_category      IS '쿼리 카테고리';
COMMENT ON COLUMN search_quality_logs.query_subcategory   IS '쿼리 서브카테고리';
COMMENT ON COLUMN search_quality_logs.query_color_family  IS '쿼리 컬러 패밀리';
COMMENT ON COLUMN search_quality_logs.query_fit           IS '쿼리 핏';
COMMENT ON COLUMN search_quality_logs.query_fabric        IS '쿼리 패브릭';
COMMENT ON COLUMN search_quality_logs.query_style_node    IS '쿼리 스타일 노드';
COMMENT ON COLUMN search_quality_logs.result_count        IS '결과 수';
COMMENT ON COLUMN search_quality_logs.is_empty            IS '무결과 여부';
COMMENT ON COLUMN search_quality_logs.top_score           IS '1위 점수';
COMMENT ON COLUMN search_quality_logs.avg_score           IS '평균 점수';
COMMENT ON COLUMN search_quality_logs.score_breakdown     IS '점수 분해 jsonb';
COMMENT ON COLUMN search_quality_logs.created_at          IS '레코드 생성 시각';

-- =========================================================================
-- 5.12 user_feedbacks — 사용자 피드백 (up/down + tags + comment)
-- =========================================================================
COMMENT ON TABLE user_feedbacks IS '사용자 피드백 — 메인 플로우 종료 시점에 수집';

COMMENT ON COLUMN user_feedbacks.id          IS 'PK uuid';
COMMENT ON COLUMN user_feedbacks.session_id  IS 'analysis_sessions FK CASCADE';
COMMENT ON COLUMN user_feedbacks.analysis_id IS 'analyses FK CASCADE';
COMMENT ON COLUMN user_feedbacks.rating      IS 'up/down';
COMMENT ON COLUMN user_feedbacks.tags        IS '분류 태그 배열';
COMMENT ON COLUMN user_feedbacks.comment     IS '자유 코멘트';
COMMENT ON COLUMN user_feedbacks.email       IS '옵션 이메일';
COMMENT ON COLUMN user_feedbacks.created_at  IS '레코드 생성 시각';

-- =========================================================================
-- 5.13 admin_profiles — 어드민 인증 프로필 (Auth.js v5 Credentials)
-- =========================================================================
COMMENT ON TABLE admin_profiles IS '어드민 인증 프로필 — Auth.js v5 Credentials + bcryptjs';

COMMENT ON COLUMN admin_profiles.user_id       IS 'PK uuid (자체 발급, JWT sub)';
COMMENT ON COLUMN admin_profiles.email         IS '로그인 이메일 (lower-case unique)';
COMMENT ON COLUMN admin_profiles.password_hash IS 'bcrypt 해시 (round=10)';
COMMENT ON COLUMN admin_profiles.status        IS '승인 상태 — pending/approved/rejected';
COMMENT ON COLUMN admin_profiles.created_at    IS '레코드 생성 시각';
COMMENT ON COLUMN admin_profiles.updated_at    IS '레코드 갱신 시각 (trigger set_admin_profiles_updated_at)';

-- =========================================================================
-- 5.14 instagram_post_scrapes — 인스타 포스트 크롤 결과
-- =========================================================================
COMMENT ON TABLE instagram_post_scrapes IS '인스타 포스트 크롤 결과 — 메인 플로우 입력 단계';

COMMENT ON COLUMN instagram_post_scrapes.id              IS 'PK uuid';
COMMENT ON COLUMN instagram_post_scrapes.shortcode       IS '인스타 shortcode';
COMMENT ON COLUMN instagram_post_scrapes.owner_handle    IS '소유자 핸들';
COMMENT ON COLUMN instagram_post_scrapes.owner_full_name IS '소유자 풀네임';
COMMENT ON COLUMN instagram_post_scrapes.media_type      IS 'image/sidecar/video';
COMMENT ON COLUMN instagram_post_scrapes.caption         IS '게시 캡션';
COMMENT ON COLUMN instagram_post_scrapes.mentioned_users IS '멘션 사용자 jsonb 배열';
COMMENT ON COLUMN instagram_post_scrapes.like_count      IS '좋아요 수';
COMMENT ON COLUMN instagram_post_scrapes.comment_count   IS '댓글 수';
COMMENT ON COLUMN instagram_post_scrapes.taken_at        IS '게시 시각';
COMMENT ON COLUMN instagram_post_scrapes.source          IS '수집 경로 — profile_walk/direct/graphql';
COMMENT ON COLUMN instagram_post_scrapes.status          IS '수집 상태 — success/partial/failed';
COMMENT ON COLUMN instagram_post_scrapes.used_proxy      IS '프록시 사용 여부';
COMMENT ON COLUMN instagram_post_scrapes.error_code      IS '실패 코드';
COMMENT ON COLUMN instagram_post_scrapes.error_message   IS '실패 메시지';
COMMENT ON COLUMN instagram_post_scrapes.raw_data        IS '원본 페이로드 jsonb';
COMMENT ON COLUMN instagram_post_scrapes.created_at      IS '레코드 생성 시각';

-- =========================================================================
-- 5.15 instagram_post_scrape_images — 포스트 내 개별 이미지 (R2 업로드)
-- =========================================================================
COMMENT ON TABLE instagram_post_scrape_images IS '인스타 포스트 내 개별 이미지 — Cloudflare R2 저장';

COMMENT ON COLUMN instagram_post_scrape_images.id           IS 'PK uuid';
COMMENT ON COLUMN instagram_post_scrape_images.scrape_id    IS 'instagram_post_scrapes FK CASCADE';
COMMENT ON COLUMN instagram_post_scrape_images.order_index  IS '게시물 내 순서 (UNIQUE per scrape_id)';
COMMENT ON COLUMN instagram_post_scrape_images.r2_url       IS 'Cloudflare R2 URL';
COMMENT ON COLUMN instagram_post_scrape_images.original_url IS '원본 인스타 CDN URL';
COMMENT ON COLUMN instagram_post_scrape_images.width        IS '이미지 가로 픽셀';
COMMENT ON COLUMN instagram_post_scrape_images.height       IS '이미지 세로 픽셀';
COMMENT ON COLUMN instagram_post_scrape_images.is_video     IS '비디오 여부';
COMMENT ON COLUMN instagram_post_scrape_images.tagged_users IS '태그된 사용자 jsonb';
COMMENT ON COLUMN instagram_post_scrape_images.created_at   IS '레코드 생성 시각';

-- =========================================================================
-- 5.16 eval_golden_queries — 평가 골든셋 쿼리
-- =========================================================================
COMMENT ON TABLE eval_golden_queries IS '평가용 골든셋 쿼리 — eval run의 입력';

COMMENT ON COLUMN eval_golden_queries.id                IS 'PK uuid';
COMMENT ON COLUMN eval_golden_queries.instagram_url     IS '인스타 URL (UNIQUE with query_signature)';
COMMENT ON COLUMN eval_golden_queries.query_signature   IS '쿼리 시그니처';
COMMENT ON COLUMN eval_golden_queries.intent_note       IS '의도 설명';
COMMENT ON COLUMN eval_golden_queries.algorithm_version IS '알고리즘 버전 — v4/v6';
COMMENT ON COLUMN eval_golden_queries.created_by        IS '작성자';
COMMENT ON COLUMN eval_golden_queries.created_at        IS '레코드 생성 시각';
COMMENT ON COLUMN eval_golden_queries.updated_at        IS '레코드 갱신 시각';

-- =========================================================================
-- 5.17 eval_golden_set — 평가 골든셋 기대값 (analyses snapshot)
-- =========================================================================
COMMENT ON TABLE eval_golden_set IS '평가용 골든셋 기대값 — analyses 스냅샷 + 기대 결과';

COMMENT ON COLUMN eval_golden_set.id                      IS 'PK uuid';
COMMENT ON COLUMN eval_golden_set.analysis_id             IS 'analyses FK SET NULL';
COMMENT ON COLUMN eval_golden_set.image_url               IS '스냅샷 이미지 URL';
COMMENT ON COLUMN eval_golden_set.test_type               IS '테스트 타입 — image/prompt';
COMMENT ON COLUMN eval_golden_set.expected_node_primary   IS '기대 1차 스타일 노드';
COMMENT ON COLUMN eval_golden_set.expected_node_secondary IS '기대 2차 스타일 노드';
COMMENT ON COLUMN eval_golden_set.expected_color_family   IS '기대 컬러 패밀리';
COMMENT ON COLUMN eval_golden_set.expected_fit            IS '기대 핏';
COMMENT ON COLUMN eval_golden_set.expected_fabric         IS '기대 패브릭';
COMMENT ON COLUMN eval_golden_set.expected_items          IS '기대 아이템 jsonb';
COMMENT ON COLUMN eval_golden_set.expected_products       IS '기대 상품 jsonb — [{brand, category, subcategory}]';
COMMENT ON COLUMN eval_golden_set.notes                   IS '메모';
COMMENT ON COLUMN eval_golden_set.added_by                IS '추가자';
COMMENT ON COLUMN eval_golden_set.created_at              IS '레코드 생성 시각';

-- =========================================================================
-- 5.18 eval_judgments — 골든셋 결과에 대한 사람 판정 (relevance grade)
-- =========================================================================
COMMENT ON TABLE eval_judgments IS '골든셋 결과 라벨링 — nDCG/Precision 계산 입력';

COMMENT ON COLUMN eval_judgments.id                IS 'PK uuid';
COMMENT ON COLUMN eval_judgments.golden_query_id   IS 'eval_golden_queries FK CASCADE';
COMMENT ON COLUMN eval_judgments.product_id        IS 'products FK CASCADE';
COMMENT ON COLUMN eval_judgments.algorithm_version IS '알고리즘 버전 — v4/v6';
COMMENT ON COLUMN eval_judgments.relevance_grade   IS 'relevance 등급 0..3';
COMMENT ON COLUMN eval_judgments.labeler_id        IS '라벨러 식별';
COMMENT ON COLUMN eval_judgments.notes             IS '메모';
COMMENT ON COLUMN eval_judgments.labeled_at        IS '라벨 시각';

-- =========================================================================
-- 5.19 eval_reviews — 분석 결과에 대한 사람 리뷰 (pass/fail/partial)
-- =========================================================================
COMMENT ON TABLE eval_reviews IS '분석 결과 사람 리뷰 — pass/fail/partial';

COMMENT ON COLUMN eval_reviews.id              IS 'PK uuid';
COMMENT ON COLUMN eval_reviews.analysis_id     IS 'analyses FK CASCADE';
COMMENT ON COLUMN eval_reviews.reviewer_email  IS '리뷰어 이메일';
COMMENT ON COLUMN eval_reviews.verdict         IS '판정 — pass/fail/partial';
COMMENT ON COLUMN eval_reviews.comment         IS '리뷰 코멘트';
COMMENT ON COLUMN eval_reviews.is_pinned       IS 'admin pin 여부';
COMMENT ON COLUMN eval_reviews.prompt_version  IS '프롬프트 버전';
COMMENT ON COLUMN eval_reviews.created_at      IS '레코드 생성 시각';

-- =========================================================================
-- 5.20 eval_runs — 알고리즘 버전별 nDCG/Precision 집계
-- =========================================================================
COMMENT ON TABLE eval_runs IS '평가 실행 결과 — algorithm_version별 nDCG@10 / P@5 집계';

COMMENT ON COLUMN eval_runs.id                IS 'PK uuid';
COMMENT ON COLUMN eval_runs.golden_query_id   IS 'eval_golden_queries FK CASCADE (NULL = aggregate)';
COMMENT ON COLUMN eval_runs.algorithm_version IS '알고리즘 버전 — v4/v6';
COMMENT ON COLUMN eval_runs.query_count       IS '쿼리 수';
COMMENT ON COLUMN eval_runs.judgment_count    IS '판정 수';
COMMENT ON COLUMN eval_runs.ndcg_at_10        IS 'nDCG@10 0..1';
COMMENT ON COLUMN eval_runs.precision_at_5    IS 'Precision@5 0..1';
COMMENT ON COLUMN eval_runs.frozen            IS 'baseline 동결 여부 (overwrite 방지)';
COMMENT ON COLUMN eval_runs.notes             IS '메모';
COMMENT ON COLUMN eval_runs.computed_at       IS '계산 시각';

-- =========================================================================
-- 5.21 api_access_logs — API 호출 로그
-- =========================================================================
COMMENT ON TABLE api_access_logs IS 'API 호출 로그 — analyze / search-products INSERT';

COMMENT ON COLUMN api_access_logs.id          IS 'PK uuid';
COMMENT ON COLUMN api_access_logs.analysis_id IS 'analyses FK SET NULL';
COMMENT ON COLUMN api_access_logs.endpoint    IS '엔드포인트';
COMMENT ON COLUMN api_access_logs.method      IS 'HTTP method';
COMMENT ON COLUMN api_access_logs.status_code IS '응답 코드';
COMMENT ON COLUMN api_access_logs.duration_ms IS '소요 ms';
COMMENT ON COLUMN api_access_logs.ip          IS '호출 IP';
COMMENT ON COLUMN api_access_logs.user_agent  IS 'User-Agent';
COMMENT ON COLUMN api_access_logs.created_at  IS '레코드 생성 시각';

-- =========================================================================
-- 5.22 brand_sku_counts (materialized view) — 브랜드별 SKU 카운트
-- =========================================================================
COMMENT ON MATERIALIZED VIEW brand_sku_counts IS '브랜드별 SKU 카운트 matview — REFRESH MATERIALIZED VIEW CONCURRENTLY brand_sku_counts 로 갱신';

COMMENT ON COLUMN brand_sku_counts.brand     IS 'products.brand 그룹 (UNIQUE)';
COMMENT ON COLUMN brand_sku_counts.sku_count IS 'per-brand SKU 수';

-- =========================================================================
-- 5.23 product_embedding_coverage (view) — 임베딩 커버리지 헬스체크
-- =========================================================================
COMMENT ON VIEW product_embedding_coverage IS '플랫폼별 임베딩 커버리지 — kikoai/ai 헬스체크에서 조회';

COMMENT ON COLUMN product_embedding_coverage.platform         IS 'products.platform';
COMMENT ON COLUMN product_embedding_coverage.total            IS 'platform별 row 수';
COMMENT ON COLUMN product_embedding_coverage.embedded         IS 'embedding NOT NULL 수';
COMMENT ON COLUMN product_embedding_coverage.pct_embedded     IS '임베딩 백분율';
COMMENT ON COLUMN product_embedding_coverage.last_embedded_at IS '최근 임베딩 시각';

COMMIT;
