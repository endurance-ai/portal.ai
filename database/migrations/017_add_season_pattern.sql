-- 시즌 + 패턴 필드 추가 (product_ai_analysis)
-- 검색 품질 개선: 계절감/무늬 필터링 지원

ALTER TABLE product_ai_analysis ADD COLUMN season TEXT;
ALTER TABLE product_ai_analysis ADD COLUMN pattern TEXT DEFAULT 'solid';

-- 검색용 인덱스
CREATE INDEX idx_pai_season ON product_ai_analysis (version, season);
CREATE INDEX idx_pai_pattern ON product_ai_analysis (version, pattern);

COMMENT ON COLUMN product_ai_analysis.season IS '시즌: spring, summer, fall, winter, all-season';
COMMENT ON COLUMN product_ai_analysis.pattern IS '패턴: solid, stripe, check, plaid, floral, dot, abstract, camo, animal, graphic';
