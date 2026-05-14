-- 050_style_nodes_seed.sql
-- Style Nodes 초기 seed — 20개 노드 (A~T).
-- 데이터 출처: brand_nodes 분포 audit (1,037 brand 매핑) + 2026 fashion segmentation 리서치
-- (DeepFashion, BoF/McKinsey SoF 2026, WGSN, Pinterest Predicts 2026, Highsnobiety, MR PORTER).
--
-- Author: SPEC-NODE-REDESIGN-001 P1c (2026-05-13)
-- Related: docs/plans/26-05-13-spec-node-redesign.md
-- 검증: kikoai dev-app PG. Requires 049_style_nodes.sql applied first.

BEGIN;

INSERT INTO style_nodes (code, name_en, name_ko, mood, include_rule, exclude_rule, keywords_en, keywords_ko) VALUES

-- ── Casual / Daily Cluster ─────────────────────────────────────
('A',
 'Contemporary Casual',
 '컨템퍼러리 캐주얼',
 'Designer-led elevated daily wear with contemporary cut and material focus',
 'Use when the brand identity is designer-driven elevated daily wear — refined silhouettes, well-considered fabrications, and a contemporary point of view that remains livable. Wardrobe staples elevated through proportion and material, not through ornament or experimentation.',
 'Exclude if the brand reads as Parisian effortless girl chic (→ B French Effortless), Northern European tonal minimalism (→ C Scandi Minimal), or no-logo wealth signal with maximum fabric focus (→ D Quiet Luxury). Exclude if streetwear or graphic vocabulary dominates.',
 ARRAY['contemporary casual','elevated basics','designer daily','refined silhouette','well-made everyday','contemporary wardrobe'],
 ARRAY['컨템퍼러리 캐주얼','디자이너 데일리','정제된 일상복','라이프스타일 캐주얼']
),

('B',
 'French Effortless',
 '프렌치 이펄리스',
 'Parisian girl casual chic with refined ease and understated sensuality',
 'Use when the brand expresses Parisian effortless femininity or masculinity — soft tailoring, breezy proportions, a hint of nonchalant sensuality, and styling that reads as casually pulled together. Color palette skews tonal-warm; fabrics are natural and lived-in.',
 'Exclude if the brand reads as designer contemporary wardrobe (→ A Contemporary Casual), structural Scandinavian minimalism (→ C Scandi Minimal), or romantic feminine with volume and ornament (→ Q Romantic Feminine).',
 ARRAY['parisian chic','french effortless','casual chic','tonal-warm palette','soft tailoring','effortless femininity'],
 ARRAY['프렌치 시크','파리지엔','효트리스','캐주얼 시크','내추럴 톤']
),

('C',
 'Scandi Minimal',
 '스칸디 미니멀',
 'Northern European restraint with tonal neutrality and architectural cut',
 'Use when the brand identity is Scandinavian or architectural minimalism — strong silhouettes, neutral tonal palette (off-white, sand, slate, oat), clean architectural cuts, and absence of decoration. Material expresses itself through proportion rather than ornament.',
 'Exclude if no-logo wealth signal with maximum fabric luxury dominates (→ D Quiet Luxury), or if the silhouette experiments with deconstruction (→ N Belgian Conceptual / O Runway Experimental).',
 ARRAY['scandi minimal','architectural minimal','tonal neutral','clean lines','minimalist contemporary','quiet design'],
 ARRAY['스칸디 미니멀','건축적 미니멀','뉴트럴 톤','클린 라인','조용한 디자인']
),

('D',
 'Quiet Luxury',
 '콰이엇 럭셔리',
 'No-logo wealth signal through finest fabric, perfect proportion, and discreet refinement',
 'Use when the brand identity is stealth wealth or quiet luxury — no visible logo, maximum fabric quality (cashmere, silk, linen at top grade), perfect tailoring and proportion, and a discreet sophistication that reads only to insiders. Pricing typically reflects the material premium.',
 'Exclude if architectural minimalism dominates over fabric luxury (→ C Scandi Minimal), if logo or print is part of identity (→ A Contemporary Casual or P Luxury Maximalist), or if classic tailoring is the explicit posture (→ H Sartorial Tailoring).',
 ARRAY['quiet luxury','stealth wealth','no-logo','old money','cashmere silk linen','discreet sophistication'],
 ARRAY['콰이엇 럭셔리','스텔스 웰스','노로고','올드 머니','디스크릿']
),

('E',
 'Modern Prep',
 '모던 프렙',
 'Contemporary preppy collegiate refinement with editorial NY/British polish',
 'Use when the brand expresses preppy-collegiate identity in a modern editorial register — rugby, polo, oxford, cricket, varsity, blazer references, refined with contemporary cut and material. British or American Ivy heritage reframed for a current audience.',
 'Exclude if street fusion is core (→ I NY New Prep Street), heritage workwear and Americana dominate (→ F Heritage Americana), or pure classical tailoring is the explicit identity (→ H Sartorial Tailoring).',
 ARRAY['modern prep','preppy collegiate','rugby polo oxford','ivy heritage','varsity refined','editorial prep'],
 ARRAY['모던 프렙','프레피','아이비 헤리티지','바시티','콜리지에이트']
),

-- ── Heritage / Workwear Cluster ────────────────────────────────
('F',
 'Heritage Americana',
 '헤리티지 아메리카나',
 'Vintage American workwear and military with archival depth',
 'Use when the brand identity is rooted in American workwear, military, denim heritage, or vintage Americana — selvedge denim, M-43/M-65 references, chore coats, raw materials, archival research, and a craft-first posture. Often features distressed or aged finishes.',
 'Exclude if Japanese restraint and utility frame the work (→ G Japanese Workwear), if heritage is reframed into editorial street (→ E Modern Prep / I NY New Prep Street), or if classic tailoring posture dominates (→ H Sartorial Tailoring).',
 ARRAY['heritage americana','workwear','military surplus','selvedge denim','vintage american','craft heritage','archival'],
 ARRAY['헤리티지 아메리카나','워크웨어','밀리터리','셀비지','아카이브 크래프트']
),

('G',
 'Japanese Workwear',
 '재패니즈 워크웨어',
 'Restrained Japanese layering with utilitarian craft and indigo discipline',
 'Use when the brand identity is rooted in Japanese workwear, utility, or refined layering — indigo dyes, sashiko, boro, kimono construction references, restrained silhouettes, and meticulous fabric sourcing. Includes American workwear filtered through Japanese sensibility (Engineered Garments, BEAMS).',
 'Exclude if American heritage and rugged distress dominate (→ F Heritage Americana), if minimal architectural cut dominates over utility (→ C Scandi Minimal), or if avant-garde deconstruction is core (→ O Runway Experimental).',
 ARRAY['japanese workwear','utility','indigo sashiko','refined layering','wabi-sabi','craft japan'],
 ARRAY['재패니즈 워크웨어','유틸리티','인디고','레이어드','일본 크래프트']
),

('H',
 'Sartorial Tailoring',
 '사토리얼 테일러링',
 'Italian/British classic tailoring with sartorial precision and material respect',
 'Use when the brand identity is classical sartorial — Italian (Napoli, Milano) or British (Savile Row) tailoring, soft-shoulder suiting, hand-finished details, sport coats, full bespoke or made-to-measure heritage. Posture reads as quietly refined and adult.',
 'Exclude if no-logo wealth signal in casualwear dominates (→ D Quiet Luxury), if preppy collegiate frame is explicit (→ E Modern Prep), or if maximalist runway glamour is the identity (→ P Luxury Maximalist).',
 ARRAY['sartorial','tailoring','savile row','napoli milano','soft shoulder','bespoke','classic suiting'],
 ARRAY['사토리얼','테일러링','새빌로우','나폴리','클래식 수트']
),

-- ── Street Cluster ─────────────────────────────────────────────
('I',
 'NY New Prep Street',
 'NY 뉴프렙 스트릿',
 '90s NY nostalgia fused with prep, sportswear, and editorial street sensibility',
 'Use when the brand expresses NY-rooted neighborhood identity that fuses collegiate prep references, 90s sportswear nostalgia, and editorial curation. Heritage rugby/varsity/baseball motifs handled with editorial polish; collaborations with sport heritage brands (New Balance, Saucony, Adidas Originals).',
 'Exclude if streetwear is direct/raw skate-rooted (→ J Skate Street) or DIY art-school graphic (→ K Art-school Indie). Exclude if luxury volume and runway-scale street dominates (→ L Luxury Streetwear). Exclude pure prep without street vocabulary (→ E Modern Prep).',
 ARRAY['new york prep','editorial streetwear','90s sportswear nostalgia','rugby varsity heritage','neighborhood brand','prep meets street'],
 ARRAY['NY 뉴프렙','에디토리얼 스트릿','90s 스포츠웨어','럭비 바시티','동네 브랜드']
),

('J',
 'Skate Street',
 '스케이트 스트릿',
 'Direct streetwear with skate, surf, and graphic-loud youth attitude',
 'Use when the brand identity is core skate/surf streetwear or graphic-driven loud street — large logo, bold print, hooded fleece, skate/surf cultural roots, and a direct youth-culture posture. Graphic and logo are central, not secondary.',
 'Exclude if NY-editorial polish and prep fusion frame the work (→ I NY New Prep Street), if DIY art-school graphic dominates over commercial street (→ K Art-school Indie), or if luxury price tier and runway volume defines the brand (→ L Luxury Streetwear).',
 ARRAY['skate street','surf street','graphic streetwear','logo heavy','youth culture','hype street','direct street'],
 ARRAY['스케이트 스트릿','서프','그래픽 스트릿','하이프','로고 헤비']
),

('K',
 'Art-school Indie Street',
 '아트스쿨 인디 스트릿',
 'DIY graphics and art-school sensibility with experimental wardrobe vocabulary',
 'Use when the brand identity is DIY/art-school-rooted street — hand-drawn graphics, irony, experimental color and pattern, small-batch sensibility, and a wardrobe approach that mixes streetwear with conceptual or absurdist references. Often artist/zine adjacent.',
 'Exclude if commercial skate/graphic-loud street is the primary identity (→ J Skate Street), if heritage workwear-rooted street dominates (→ F Heritage Americana), or if dark avant-garde subculture defines the brand (→ M Dark Avant-garde).',
 ARRAY['art-school street','indie streetwear','diy graphics','experimental color','zine sensibility','conceptual street'],
 ARRAY['아트스쿨 스트릿','인디 스트릿','DIY 그래픽','실험적 컬러','컨셉추얼 스트릿']
),

('L',
 'Luxury Streetwear',
 '럭셔리 스트릿',
 'High-fashion volume and price fused with street attitude',
 'Use when the brand identity is luxury-tier streetwear — runway-scale silhouettes, premium materials applied to hooded/oversized vocabulary, designer-priced graphic pieces, and a posture that bridges high fashion and street. Often founder-driven hype.',
 'Exclude if NY editorial polish frames the street (→ I NY New Prep Street), if direct skate/surf graphic dominates (→ J Skate Street), or if runway designer identity is foremost (→ O Runway Experimental).',
 ARRAY['luxury streetwear','high fashion street','runway street','designer hoodie','oversized luxury','founder hype'],
 ARRAY['럭셔리 스트릿','하이패션 스트릿','런웨이 스트릿','디자이너 후디','오버사이즈 럭셔리']
),

-- ── Designer / Avant-garde Cluster ─────────────────────────────
('M',
 'Dark Avant-garde',
 '다크 아방가르드',
 'Black palette, drape, deconstruction, and goth-ninja sensibility',
 'Use when the brand identity is predominantly black/charcoal with draped silhouettes, asymmetric cuts, and a goth-ninja or dark designer posture. Subcultural identity (punk, goth, underground) precedes daily wearability. Attitude reads as anti-classic and somber.',
 'Exclude if structural deconstruction is the brand''s primary intent over mood (→ N Belgian Conceptual or O Runway Experimental). Exclude if casual avant-garde without dark palette dominance (→ K Art-school Indie Street). Exclude if streetwear is direct/loud rather than underground.',
 ARRAY['dark avant-garde','goth ninja','drape silhouette','underground designer','all-black palette','anti-classic'],
 ARRAY['다크 아방가르드','고스 닌자','드레이프','언더그라운드','올블랙','안티클래식']
),

('N',
 'Belgian Conceptual',
 '벨지언 컨셉추얼',
 'Poetic structural experiment from Antwerp lineage with intellectual depth',
 'Use when the brand identity descends from the Antwerp Six or shares its DNA — poetic conceptual designer collections, deliberate raw edges, hidden construction reveals, and a literary/philosophical posture. Silhouettes are often loose, somber, asymmetric, and intellectually framed.',
 'Exclude if subcultural dark mood precedes structural concept (→ M Dark Avant-garde), if pattern manipulation and runway sculpture are the foreground (→ O Runway Experimental), or if classical tailoring discipline is the explicit posture (→ H Sartorial Tailoring).',
 ARRAY['antwerp six','belgian conceptual','poetic designer','raw construction','intellectual fashion','asymmetric designer'],
 ARRAY['앤트워프','벨지언','시적 디자이너','로우 컨스트럭션','지적 패션']
),

('O',
 'Runway Experimental',
 '런웨이 익스페리먼탈',
 'Sculptural runway with pattern manipulation and structural disassembly',
 'Use when the brand identity is foregrounded by runway-scale experimentation — pattern manipulation, structural deconstruction and reassembly, sculptural volume, conceptual collections that read as art objects. Technical fabric or industrial reference is common.',
 'Exclude if the experimentation is filtered through poetic Belgian lineage (→ N Belgian Conceptual), if the mood is dark/subcultural rather than constructive (→ M Dark Avant-garde), or if maximalist glamour and ornament dominate over structural experiment (→ P Luxury Maximalist).',
 ARRAY['runway experimental','deconstruction','sculptural silhouette','pattern manipulation','conceptual collection','industrial fabric'],
 ARRAY['런웨이 익스페리먼탈','해체주의','조각적 실루엣','패턴 조작','컨셉추얼 컬렉션']
),

('P',
 'Luxury Maximalist',
 '럭셔리 맥시멀리스트',
 'Logo, print, embellishment, and glamour-forward luxury',
 'Use when the brand identity is loud luxury — visible logo, repeating print, embellishment (crystal, embroidery, fringe), bold color, sequins, and a glamour-forward posture. Italian or Continental European houses with maximalist DNA. Loud rather than discreet.',
 'Exclude if no-logo wealth signal dominates (→ D Quiet Luxury), if classical tailoring is the explicit identity (→ H Sartorial Tailoring), or if body-conscious sensual luxury is the focal point (→ R Sensual Feminine).',
 ARRAY['luxury maximalist','loud luxury','logo print embellishment','italian house','glamour forward','baroque luxury'],
 ARRAY['럭셔리 맥시멀리스트','라우드 럭셔리','로고 프린트 장식','이탈리안 하우스','글래머']
),

-- ── Feminine Cluster ───────────────────────────────────────────
('Q',
 'Romantic Feminine',
 '로맨틱 페미닌',
 'Ruffles, volume, whimsical decoration, and fairytale femininity',
 'Use when the brand identity centers romantic femininity — ruffles, volume, puffed sleeves, smocking, florals, decorative buttons, and a whimsical or fairytale posture. Often designer-led with sculptural volume and craft attention to feminine archetype.',
 'Exclude if minimalism with soft proportion is the posture (→ B French Effortless or C Scandi Minimal), if body-conscious sensuality is the focal point (→ R Sensual Feminine), or if maximalist glamour with embellishment dominates over romantic mood (→ P Luxury Maximalist).',
 ARRAY['romantic feminine','ruffles volume','puff sleeve','floral feminine','whimsical','fairytale dress','smocking'],
 ARRAY['로맨틱 페미닌','러플','퍼프 슬리브','플로럴','드림 드레스']
),

('R',
 'Sensual Feminine',
 '센슈얼 페미닌',
 'Body-conscious sculptural feminine luxury with dressy sensuality',
 'Use when the brand identity is body-conscious sensual luxury — sculptural draping that follows the body, second-skin silhouettes, evening or party-leaning dressing, refined sensuality. Designer-led, often with strong material craft.',
 'Exclude if romantic decoration and volume are the focal point (→ Q Romantic Feminine), if loud maximalist glamour dominates (→ P Luxury Maximalist), or if French effortless ease frames the femininity (→ B French Effortless).',
 ARRAY['sensual feminine','body-conscious','sculptural draping','dressy luxury','evening sensual','second-skin'],
 ARRAY['센슈얼 페미닌','바디 컨셔스','조각적 드레이프','드레시 럭셔리','이브닝']
),

-- ── Tech / Outdoor Cluster ─────────────────────────────────────
('S',
 'Gorpcore Outdoor',
 '고프코어 아웃도어',
 'Outdoor performance fabric meeting urban styling',
 'Use when the brand identity is rooted in outdoor performance — trail running, hiking, mountaineering, technical shells, gorp colorways — and is either an authentic outdoor brand or a city-styled outdoor-tech brand. Technical fabric, performance functionality, and gorp visual language are central.',
 'Exclude if Italian tech-luxury sportswear with editorial polish dominates (→ T Italian Tech-luxury), if the technical fabric is in service of avant-garde mood (→ M Dark Avant-garde or O Runway Experimental), or if streetwear is the foreground rather than performance.',
 ARRAY['gorpcore','outdoor performance','trail tech','hiking fabric','technical outerwear','mountain gear','urban gorp'],
 ARRAY['고프코어','아웃도어','테크 트레일','하이킹','테크니컬 아우터']
),

('T',
 'Italian Tech-luxury',
 '이탈리안 테크럭셔리',
 'Italian sportswear with tech fabric, tonal palette, and editorial polish',
 'Use when the brand identity is Italian or European technical sportswear-luxury — garment-dyed nylon, technical outerwear with editorial polish, militarized urban silhouettes, recognizable house DNA (Stone Island, C.P. Company, Moncler). Technical fabric is positioned as luxury rather than performance.',
 'Exclude if performance authenticity in outdoor/trail context dominates (→ S Gorpcore Outdoor), if luxury streetwear volume rather than tech-fabric DNA is the brand''s anchor (→ L Luxury Streetwear), or if maximalist house glamour dominates over tech materials (→ P Luxury Maximalist).',
 ARRAY['italian tech-luxury','garment dye','technical sportswear','tonal nylon','urban militarized','editorial outerwear'],
 ARRAY['이탈리안 테크럭셔리','가먼트 다이','테크 스포츠웨어','어반 밀리터리','에디토리얼 아우터']
);

COMMIT;

-- 검증 쿼리 (수동):
--   SELECT code, name_en, array_length(keywords_en,1) AS kw_en, array_length(keywords_ko,1) AS kw_ko
--   FROM style_nodes WHERE is_active=true ORDER BY code;
-- 기대: 20 row, kw_en 6~7, kw_ko 4~5
