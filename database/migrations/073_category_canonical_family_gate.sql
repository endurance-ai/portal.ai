-- 073_category_canonical_family_gate.sql
-- SPEC-SEARCH-V6-001 follow-up — canonical category family taxonomy +
-- search_products_v6 FILTER 2 broadening (method B mapping + ladder F +
-- normalization A). User decision (2026-05-18).
--
-- PROBLEM (072 FILTER 2): `products.category = p_category` is an EXACT
-- string match. products.category has 752 distinct, highly noisy values
-- ("Shoes"/"Sneakers"/"Low Top Sneakers", "Top"/"T-Shirts"/"Shirts",
-- multilingual Zara/Italian platform codes, gender/season buckets). The
-- Vision (`vision-analyze`) category vocabulary almost never matches a raw
-- products.category verbatim, so BOTH the EXACT-node path and the ratified
-- §13 #1 degraded path (which drops the node filter but KEEPS the exact
-- category predicate) return 0 rows — a category mismatch is unrecoverable.
--
-- FIX (method B + F + A):
--   A  normalize both sides with lower(trim()) before resolving family.
--   B  category_canonical(raw_category PK, family) maps every one of the
--      752 raw values to exactly one of 20 canonical families (unmapped =
--      'other' catch-all). The hard gate becomes FAMILY equality, not raw
--      string equality — broad but still type-coherent.
--   F  relaxation ladder, integrated with the existing degraded boolean:
--        (1) EXACT node + family gate          → degraded = false
--        (2) node dropped, family gate kept    → degraded = true   (ratified
--                                                §13 #1, generalized)
--        (3) node + family both dropped,
--            in_stock + embedding + cosine only→ degraded = true
--      `degraded` keeps a single uniform per-call meaning: false ONLY when
--      the full-precision (node + family) gate produced rows; true whenever
--      ANY gate was relaxed (node-drop OR family-drop). The adapter's
--      "v6-degraded" provenance mapping is unaffected (still one bool/call).
--
-- The 20 canonical families are the shared contract with the AI/Vision
-- normalization side (vision-analyze must emit categories that resolve to
-- one of these via the same lower(trim()) + category_canonical lookup):
--
--   tops bottoms dresses outerwear knitwear shoes sneakers bags
--   accessories eyewear jewelry headwear underwear swimwear activewear
--   homeware fragrance beauty lifestyle other
--
-- 'other' is the explicit catch-all (gender/season/noise buckets carry no
-- garment-type signal). When EITHER side resolves to 'other' the family
-- gate is treated as absent (like p_category IS NULL) so cosine still ranks
-- via the ladder rather than pathologically matching all 'other' products.
--
-- Ranking is unchanged: cosine(query_embedding, product_embeddings.embedding)
-- ASC, products.created_at DESC tie. Family is a GATE only, never a ranking
-- signal. Signature is unchanged (p_category text in, same RETURNS TABLE) so
-- no PostgREST schema reload is required.
--
-- Author: SPEC-SEARCH-V6-001 follow-up (2026-05-18)
-- Requires: 072 (search_products_v6), 071 (product_embeddings),
--           070 (products.id bigint), 062 (brand_nodes.primary_style_node_id)

BEGIN;

-- ── method B: canonical family lookup table ──────────────────────
-- @MX:ANCHOR: [AUTO] category_canonical is the sole raw->family contract
--   consumed by search_products_v6 FILTER 2 (this migration) AND by the
--   AI-side vision-analyze category normalization. The 20-family set is a
--   cross-component shared contract; changing a family name breaks the
--   Vision↔search gate alignment.
-- @MX:REASON: SPEC-SEARCH-V6-001 follow-up replaces raw-string category
--   exact match (752 noisy distinct values, ~0 Vision-vocab overlap) with
--   broad family equality so normal + degraded paths stop returning empty
--   on category-vocabulary mismatch. raw_category is the verbatim
--   products.category value (case/whitespace preserved); resolution
--   normalizes with lower(trim()).
-- @MX:SPEC: SPEC-SEARCH-V6-001
CREATE TABLE IF NOT EXISTS category_canonical (
  raw_category text PRIMARY KEY,
  family       text NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_category_canonical_family
  ON category_canonical (family);

COMMENT ON TABLE category_canonical IS
  'SPEC-SEARCH-V6-001 follow-up. Maps every distinct products.category raw '
  'value (key = verbatim products.category, case/whitespace preserved) to '
  'one of 20 canonical families. Consumed by search_products_v6 FILTER 2 '
  '(family gate) and shared as the AI vision-analyze normalization contract. '
  'Resolution normalizes with lower(trim()); unmapped raw resolves to '
  '''other'' (gate then treated as absent).';

-- ── B seed: all 752 distinct products.category → family (idempotent) ──
-- Generated from full dev-app products.category distinct snapshot
-- (2026-05-18, 752 distinct / 117,367 non-NULL rows). Idempotent upsert so
-- re-running the migration (or a later category refresh) is safe.
INSERT INTO category_canonical (raw_category, family) VALUES
  -- ── family identity rows (cross-component contract closure) ──────
  -- The AI side normalizes the Vision category to one of the 20 canonical
  -- family tokens and passes it as p_category. search_products_v6 resolves
  -- family via lower(trim(p_category)) → category_canonical lookup, so each
  -- family token MUST exist as its own raw_category=family row, otherwise
  -- the token falls through to 'other' and the family gate is disabled
  -- (16/20 tokens were silently inert before this block). These 20 rows
  -- make link 1 (AI normalization) ≡ link 2 (RPC family resolution)
  -- exact. The 4 tokens that already collide with a real lowercased raw
  -- category (accessories/dresses/eyewear/shoes) upsert to the identical
  -- value here — harmless and idempotent.
  ('tops', 'tops'),
  ('bottoms', 'bottoms'),
  ('dresses', 'dresses'),
  ('outerwear', 'outerwear'),
  ('knitwear', 'knitwear'),
  ('shoes', 'shoes'),
  ('sneakers', 'sneakers'),
  ('bags', 'bags'),
  ('accessories', 'accessories'),
  ('eyewear', 'eyewear'),
  ('jewelry', 'jewelry'),
  ('headwear', 'headwear'),
  ('underwear', 'underwear'),
  ('swimwear', 'swimwear'),
  ('activewear', 'activewear'),
  ('homeware', 'homeware'),
  ('fragrance', 'fragrance'),
  ('beauty', 'beauty'),
  ('lifestyle', 'lifestyle'),
  ('other', 'other'),
  -- ── B seed proper: 752 raw products.category snapshot rows ───────
  ('ABIERTO / Z2:ABIERTO/YUTE', 'shoes'),
  ('ABRIGO / B. Abrigo/Gab', 'outerwear'),
  ('ABRIGO / B.P-EXTER.CORTA', 'outerwear'),
  ('ABRIGO / B.P-EXTER.LARGA', 'outerwear'),
  ('ABRIGO / C. ABRIGO', 'outerwear'),
  ('ABRIGO / F. Abrigo/Gab', 'outerwear'),
  ('ABRIGO / PUNTO ABRIGO', 'outerwear'),
  ('ABRIGO / ST. P-EXT -LARG', 'outerwear'),
  ('ABRIGO / ST. P-EXT-CORTA', 'outerwear'),
  ('ABRIGO / T.P-EXTER.LARGA', 'outerwear'),
  ('ABRIGO / TRENCH', 'outerwear'),
  ('ABRIGO / W.P-EXT.CORTA', 'outerwear'),
  ('ABRIGO / W.P-EXT.LARGA', 'outerwear'),
  ('ACC. TEXTIL / ACCESOR.TEXTIL', 'accessories'),
  ('ACC. TEXTIL / BOLSAS TEXTIL', 'bags'),
  ('ACCESORIOS / Z1:ACCESORIOS', 'accessories'),
  ('ACCESORIOS / Z2:ACCESORIOS', 'accessories'),
  ('ACCESORIOS DECORAC / ACC.DECORA', 'homeware'),
  ('ACCESSORIES', 'accessories'),
  ('ALBORNOZ/BATA / L. BATA', 'underwear'),
  ('ALFOMBRAS / ALFOMBRAS', 'homeware'),
  ('ALFOMBRAS / ALFOMBRAS.PEQUE', 'homeware'),
  ('ANORAK / B.P-EXTER.CORTA', 'outerwear'),
  ('ANORAK / B.P-EXTER.LARGA', 'outerwear'),
  ('ANORAK / T.P-EXTER.CORTA', 'outerwear'),
  ('ANORAK / T.P-EXTER.LARGA', 'outerwear'),
  ('ASIENTO / SILLAS.TABURETE', 'homeware'),
  ('Accessories', 'accessories'),
  ('Accessories - HATS - Misc Hat', 'headwear'),
  ('Accessories - Hard Accessories - Keychains&Toys', 'lifestyle'),
  ('Accessories Bottle', 'lifestyle'),
  ('Acessories', 'accessories'),
  ('Active Shorts', 'bottoms'),
  ('Activewear', 'activewear'),
  ('Activities', 'activewear'),
  ('All', 'other'),
  ('Anklets', 'jewelry'),
  ('Apparel', 'other'),
  ('BABY', 'other'),
  ('BACKPACKS & TRAVEL BAGS', 'bags'),
  ('BAMBAS / Z1B:DEPORTIVO', 'sneakers'),
  ('BASIC STUSSY', 'other'),
  ('BAÑO / Baño', 'swimwear'),
  ('BAÑO / Z-BAÑADOR', 'swimwear'),
  ('BAÑO / Z-BIKINI', 'swimwear'),
  ('BELTS', 'accessories'),
  ('BERMUDA / ATH B. Bermuda', 'bottoms'),
  ('BERMUDA / ATH Parte Abajo', 'bottoms'),
  ('BERMUDA / B.BERMUDA', 'bottoms'),
  ('BERMUDA / B.Bermuda Resto', 'bottoms'),
  ('BERMUDA / Bermuda Denim', 'bottoms'),
  ('BERMUDA / F.Bermuda Resto', 'bottoms'),
  ('BERMUDA / T.BERMUDA', 'bottoms'),
  ('BERMUDA / W.BERMUDA', 'bottoms'),
  ('BISUTERIA / BIS. COLLAR', 'jewelry'),
  ('BISUTERIA / BIS. PENDIENTES', 'jewelry'),
  ('BISUTERIA / BIS. PULSERA', 'jewelry'),
  ('BISUTERIA / Complementos', 'jewelry'),
  ('BISUTERIA / OTRA BISUTERÍA', 'jewelry'),
  ('BLACK BAG', 'bags'),
  ('BLAZER / B.BLASIER', 'outerwear'),
  ('BLAZER / Blasier', 'outerwear'),
  ('BLAZER / Sastrería Blas.', 'outerwear'),
  ('BLAZER / T.BLASIER', 'outerwear'),
  ('BLAZER / W.BLASIER', 'outerwear'),
  ('BLAZER / W.P-EXT.CORTA', 'outerwear'),
  ('BLAZERS', 'outerwear'),
  ('BLUSA / ST. CAMISA', 'tops'),
  ('BODY / C. BODY', 'underwear'),
  ('BODY / PUNTO BODY', 'underwear'),
  ('BODYSUITS', 'underwear'),
  ('BOLSAS Y MOCHILAS / BOLSAS TEXTIL', 'bags'),
  ('BOLSOS / Z1:BAGS LARGE', 'bags'),
  ('BOLSOS / Z1:BAGS MEDIUM', 'bags'),
  ('BOLSOS / Z1:BAGS PREMIUM', 'bags'),
  ('BOLSOS / Z1:BAGS SMALL', 'bags'),
  ('BOLSOS / Z2COMP:BANDOLE', 'bags'),
  ('BOLSOS / Z2COMP:BOWLING', 'bags'),
  ('BOOTS', 'shoes'),
  ('BORSE A TRACOLLA ', 'bags'),
  ('BOTIN / Z2:BOTA/BOTIN', 'shoes'),
  ('BOTTOMS', 'bottoms'),
  ('BOWS & TIES', 'accessories'),
  ('BRAGA/CALZONCILLO / L. BRAGA', 'underwear'),
  ('Baby Bodysuits', 'other'),
  ('Baby Boy Clothing', 'other'),
  ('Baby Girl Clothing', 'other'),
  ('Baby Girl Shoes', 'other'),
  ('Baby Sets', 'other'),
  ('Backpack', 'bags'),
  ('Backpacks', 'bags'),
  ('Bag', 'bags'),
  ('Bag Charm', 'jewelry'),
  ('Bags', 'bags'),
  ('Bags & Accessories', 'bags'),
  ('Bags and Backpacks', 'bags'),
  ('Bandanas', 'accessories'),
  ('Bath', 'beauty'),
  ('Beanies', 'headwear'),
  ('Bedding', 'homeware'),
  ('Belly Chain', 'jewelry'),
  ('Belts', 'accessories'),
  ('Bikini Bottoms', 'swimwear'),
  ('Bikini Sets', 'swimwear'),
  ('Bikini Tops', 'swimwear'),
  ('Bikinis', 'swimwear'),
  ('Blazers', 'outerwear'),
  ('Blouses / shirts', 'tops'),
  ('Body', 'underwear'),
  ('Bodysuit', 'underwear'),
  ('Bodysuits', 'underwear'),
  ('Bomber Jackets', 'outerwear'),
  ('Books', 'lifestyle'),
  ('Books and Magazines', 'lifestyle'),
  ('Boots', 'shoes'),
  ('Bottom', 'bottoms'),
  ('Bottoms', 'bottoms'),
  ('Boxers', 'underwear'),
  ('Boys Accessories', 'other'),
  ('Boys Clothing', 'other'),
  ('Boys Shoes', 'other'),
  ('Bracelet', 'jewelry'),
  ('Bracelets', 'jewelry'),
  ('Bras', 'underwear'),
  ('Bucket Hats', 'headwear'),
  ('Button Up Shirts', 'tops'),
  ('CAJAS Y JOYEROS / CAJAS', 'homeware'),
  ('CALCETIN / ATH Calcetines', 'underwear'),
  ('CALCETIN / Calcetines', 'underwear'),
  ('CAMISA / B. Camis AV M/C', 'tops'),
  ('CAMISA / B. Camisería', 'tops'),
  ('CAMISA / B.CAMISA', 'tops'),
  ('CAMISA / Camis AV M/L', 'tops'),
  ('CAMISA / F. Camis AV M/C', 'tops'),
  ('CAMISA / F. Camisería', 'tops'),
  ('CAMISA / ST. CAMISA', 'tops'),
  ('CAMISA / T.CAMISA', 'tops'),
  ('CAMISA / T.CAMISA PAQUET', 'tops'),
  ('CAMISA / W.CAMISA', 'tops'),
  ('CAMISETA / ATH B. Camiseta', 'tops'),
  ('CAMISETA / ATH F. Camiseta', 'tops'),
  ('CAMISETA / B. Camiseta', 'tops'),
  ('CAMISETA / C.CTAS BASICAS', 'tops'),
  ('CAMISETA / C.CTAS FANTASI', 'tops'),
  ('CAMISETA / C.CTAS POSICIO', 'tops'),
  ('CAMISETA / CTAS.BASICAS', 'tops'),
  ('CAMISETA / Camiseta M/L', 'tops'),
  ('CAMISETA / Cta. Liso Venta', 'tops'),
  ('CAMISETA / F. Camiseta', 'tops'),
  ('CAMISETA / ORIG B Camiseta', 'tops'),
  ('CAMISETA / ST. CAMISETA', 'tops'),
  ('CAMISETA / ST.PUNTO JERSEY', 'knitwear'),
  ('CAMISON/PIJAMA / Complementos', 'underwear'),
  ('CASA E STILE DI VITA ', 'homeware'),
  ('CAZADORA / ATH ParteArriba', 'outerwear'),
  ('CAZADORA / B. Cazadora', 'outerwear'),
  ('CAZADORA / B.P-EXTER.CORTA', 'outerwear'),
  ('CAZADORA / B.P-EXTER.LARGA', 'outerwear'),
  ('CAZADORA / C. ABRIGO', 'outerwear'),
  ('CAZADORA / CAZADORA PIEL', 'outerwear'),
  ('CAZADORA / F. Abrigo/Gab', 'outerwear'),
  ('CAZADORA / F. Cazadora', 'outerwear'),
  ('CAZADORA / P. EXT Alto inv', 'outerwear'),
  ('CAZADORA / ST. P-EXT-CORTA', 'outerwear'),
  ('CAZADORA / T.P-EXTER.CORTA', 'outerwear'),
  ('CAZADORA / T.P-EXTER.LARGA', 'outerwear'),
  ('CAZADORA / W.P-EXT.CORTA', 'outerwear'),
  ('CAZADORA / W.P-EXT.LARGA', 'outerwear'),
  ('CESTAS / CESTAS', 'homeware'),
  ('CESTAS / CESTAS PEQUEÑAS', 'homeware'),
  ('CHALECO / ATH ParteArriba', 'outerwear'),
  ('CHALECO / B.CHALECO', 'outerwear'),
  ('CHALECO / Chaleco', 'outerwear'),
  ('CHALECO / PUNTO CHALECO', 'knitwear'),
  ('CHALECO / Sastrería Chal.', 'outerwear'),
  ('CHALECO / T.CHALECO', 'outerwear'),
  ('CHALECO ACOLCHADO / Chaleco', 'outerwear'),
  ('CHALECO PUNTO / Chaleco Punto', 'knitwear'),
  ('CHAQUETA / C. ABRIGO', 'outerwear'),
  ('CHAQUETA / CTAS TRF', 'outerwear'),
  ('CHAQUETA / Chaqueta Punto', 'knitwear'),
  ('CHAQUETA / Jers.Liso Venta', 'knitwear'),
  ('CHAQUETA / L. CHAQUETA/SUD', 'outerwear'),
  ('CHAQUETA / PUNTO CHAQUETA', 'knitwear'),
  ('CHAQUETA / ST. BLASIER', 'outerwear'),
  ('CHAQUETON / ATH ParteArriba', 'outerwear'),
  ('CHAQUETON / F. Cazadora', 'outerwear'),
  ('CINTURONES / CINT. FANTASÍA', 'accessories'),
  ('CINTURONES / Cinturones', 'accessories'),
  ('CLASSICS', 'other'),
  ('CLUTCHES & POUCHES', 'bags'),
  ('COATS', 'outerwear'),
  ('COMPLEMENTOS / ATH Complemento', 'accessories'),
  ('COMPLEMENTOS / L. ACCESORIOS', 'accessories'),
  ('COSMETICA PELO / CARE-HAIR', 'beauty'),
  ('CRISTALERIA / VASO', 'homeware'),
  ('CROSSBODY BAGS', 'bags'),
  ('CUBIERTOS / SET CUBIERTOS', 'homeware'),
  ('CUÑA / Z1W:ABIERTO TAC', 'shoes'),
  ('Camper Hats', 'headwear'),
  ('Candles', 'homeware'),
  ('Candles & Fragrances', 'fragrance'),
  ('Candles & Incense', 'homeware'),
  ('Cap', 'headwear'),
  ('Caps', 'headwear'),
  ('Cardigans', 'knitwear'),
  ('Cargo Pants', 'bottoms'),
  ('Cargo Shorts', 'bottoms'),
  ('Casual', 'other'),
  ('Casual Shirts', 'tops'),
  ('Charms', 'jewelry'),
  ('Chore Jackets', 'outerwear'),
  ('Chukkas', 'shoes'),
  ('Classic Shoes', 'sneakers'),
  ('Cleaners', 'beauty'),
  ('Clothing', 'other'),
  ('Coaches Jackets', 'outerwear'),
  ('Coats', 'outerwear'),
  ('Coats & Jackets', 'outerwear'),
  ('Coats and Jackets', 'outerwear'),
  ('Coveralls', 'dresses'),
  ('Coverups', 'swimwear'),
  ('Crew Socks', 'underwear'),
  ('Crewneck', 'knitwear'),
  ('Crewneck Sweaters', 'knitwear'),
  ('Crewnecks', 'knitwear'),
  ('Cross Body Bags', 'bags'),
  ('DEPORTIVO / Z2:DEPORTIVO', 'sneakers'),
  ('DESTINY''S CHILD', 'other'),
  ('DRESSES', 'dresses'),
  ('DRESSES & JUMPSUITS', 'dresses'),
  ('Decor & Accessories', 'homeware'),
  ('Demi-Fine Jewellery', 'jewelry'),
  ('Denim', 'bottoms'),
  ('Denim Jackets', 'outerwear'),
  ('Denim Jeans', 'bottoms'),
  ('Derbies', 'shoes'),
  ('Discontinued', 'other'),
  ('Donation', 'other'),
  ('Dopp Kits', 'lifestyle'),
  ('Dress', 'dresses'),
  ('Dresses', 'dresses'),
  ('Duffle Bags', 'bags'),
  ('EAU DE PERFUME / PERFU-L', 'fragrance'),
  ('ELECTRODOMESTICOS / ELECTRODOMESTIC', 'homeware'),
  ('ESPEJOS / ESPEJOS', 'homeware'),
  ('EYEWEAR', 'eyewear'),
  ('Earmuffs', 'headwear'),
  ('Earrings', 'jewelry'),
  ('Equipment', 'lifestyle'),
  ('Espadrilles', 'shoes'),
  ('Eyewear', 'eyewear'),
  ('FALDA / B.FALDA', 'bottoms'),
  ('FALDA / B.FALDA PAQUET.', 'bottoms'),
  ('FALDA / C. FALDA', 'bottoms'),
  ('FALDA / FALDA PIEL', 'bottoms'),
  ('FALDA / L. FALDA', 'bottoms'),
  ('FALDA / PUNTO FALDA', 'bottoms'),
  ('FALDA / ST. FALDA', 'bottoms'),
  ('FALDA / T.FALDA', 'bottoms'),
  ('FALDA / T.FALDA PAQUET.', 'bottoms'),
  ('FALDA / W.FALDA', 'bottoms'),
  ('FALDA / W.FALDA PAQUET.', 'bottoms'),
  ('FANNY PACKS', 'bags'),
  ('FLATS', 'shoes'),
  ('FLEECE', 'knitwear'),
  ('FOOTWEAR', 'shoes'),
  ('FUNDA COJIN / FUNDAS COJIN', 'homeware'),
  ('FW25', 'other'),
  ('Face', 'beauty'),
  ('Facemask', 'underwear'),
  ('Fedoras', 'headwear'),
  ('Fine Jewellery', 'jewelry'),
  ('Fitted Caps', 'headwear'),
  ('Flats', 'shoes'),
  ('Fleece', 'knitwear'),
  ('Fleece Jackets', 'knitwear'),
  ('Fleeces', 'knitwear'),
  ('Food', 'lifestyle'),
  ('Footwear', 'shoes'),
  ('Footwear Accessories', 'shoes'),
  ('Formal Shirts', 'tops'),
  ('Fragrance', 'fragrance'),
  ('Furniture & Objects', 'homeware'),
  ('GABARDINA IMPERMEA / B.P-EXTER.CORTA', 'outerwear'),
  ('GABARDINA IMPERMEA / B.P-EXTER.LARGA', 'outerwear'),
  ('GABARDINA IMPERMEA / F. Abrigo/Gab', 'outerwear'),
  ('GABARDINA IMPERMEA / W.P-EXT.CORTA', 'outerwear'),
  ('GABARDINA IMPERMEA / W.P-EXT.LARGA', 'outerwear'),
  ('GAFAS / Complementos', 'eyewear'),
  ('GAFAS / Z-GAFAS DE SOL', 'eyewear'),
  ('GIFT PACKAGING', 'other'),
  ('GIOIELLERIA ', 'jewelry'),
  ('GLOVES', 'accessories'),
  ('GORRO / GORRO RAFIA', 'headwear'),
  ('GORRO / Gorro/Gorra', 'headwear'),
  ('GORRO / OTROS GORROS', 'headwear'),
  ('Games Blazer', 'lifestyle'),
  ('Games Trouser', 'lifestyle'),
  ('Gi Jackets', 'outerwear'),
  ('Gi Shirts', 'tops'),
  ('Gift Cards', 'other'),
  ('Girls Accessories', 'other'),
  ('Girls Clothing', 'other'),
  ('Girls Shoes', 'other'),
  ('Gloves', 'accessories'),
  ('Gloves and Scarves', 'accessories'),
  ('Grooming and Beauty', 'beauty'),
  ('HAIR ACCESSORIES', 'beauty'),
  ('HATS', 'headwear'),
  ('HEADWEAR', 'headwear'),
  ('HOME & LIFESTYLE', 'homeware'),
  ('HOME / H1:ATEMPORAL', 'homeware'),
  ('Hair', 'beauty'),
  ('Hair Accessories', 'beauty'),
  ('Handbag', 'bags'),
  ('Hat', 'headwear'),
  ('Hats', 'headwear'),
  ('Headbands', 'headwear'),
  ('Headbands & Hair Accessories', 'beauty'),
  ('Headwear', 'headwear'),
  ('Heels', 'shoes'),
  ('High Length Socks', 'underwear'),
  ('High Times', 'other'),
  ('High Top Sneakers', 'sneakers'),
  ('Home', 'homeware'),
  ('Home Decor', 'homeware'),
  ('Homeware', 'homeware'),
  ('Hoodie', 'knitwear'),
  ('Hoodies', 'knitwear'),
  ('Hoodies & Sweatshirts', 'knitwear'),
  ('ILUMINACION / LAMPARAS', 'homeware'),
  ('ILUMINACION / LÁMPARA PILA', 'homeware'),
  ('ILUMINACION / PANT LÁMPARA', 'homeware'),
  ('Incense', 'homeware'),
  ('Insurance', 'other'),
  ('Intimates', 'underwear'),
  ('Invisible Socks', 'underwear'),
  ('JACKETS', 'outerwear'),
  ('JARRONES / JARRONES', 'homeware'),
  ('JEANS', 'bottoms'),
  ('JEANS ', 'bottoms'),
  ('JERSEY', 'knitwear'),
  ('JERSEY / B. Jersey', 'knitwear'),
  ('JERSEY / B. Jersey M/C', 'knitwear'),
  ('JERSEY / Chaleco Punto', 'knitwear'),
  ('JERSEY / F. Jersey', 'knitwear'),
  ('JERSEY / F. Jersey M/C', 'knitwear'),
  ('JERSEY / F. Polo', 'tops'),
  ('JERSEY / Jers.Liso Venta', 'knitwear'),
  ('JERSEY / PUNTO JERSEY', 'knitwear'),
  ('JERSEY / ST.PUNTO JERSEY', 'knitwear'),
  ('JEWELLERY', 'jewelry'),
  ('JUGUETES / JUEGOS', 'lifestyle'),
  ('JUMPSUITS', 'dresses'),
  ('Jacket', 'outerwear'),
  ('Jackets', 'outerwear'),
  ('Jackets & Coats', 'outerwear'),
  ('Jeans', 'bottoms'),
  ('Jersey', 'knitwear'),
  ('Jerseys', 'knitwear'),
  ('Jewellery', 'jewelry'),
  ('Jewelry', 'jewelry'),
  ('Jumpsuits', 'dresses'),
  ('K-Footwear', 'shoes'),
  ('KEYCHAINS', 'accessories'),
  ('KIDS', 'other'),
  ('KNIT/JERSEY', 'knitwear'),
  ('KNITS', 'knitwear'),
  ('KNITWEAR', 'knitwear'),
  ('Keychains', 'accessories'),
  ('Knits', 'knitwear'),
  ('Knitwear', 'knitwear'),
  ('Knitwears', 'knitwear'),
  ('LACE-UPS', 'shoes'),
  ('LEGGINGS / B.PANT.PAQUETER', 'bottoms'),
  ('LEGGINGS / C.PTON-LEGGING', 'bottoms'),
  ('LINGERIE', 'underwear'),
  ('LOAFERS & FLATS', 'shoes'),
  ('Leather Goods', 'accessories'),
  ('Leather Jackets', 'outerwear'),
  ('Leather goods', 'accessories'),
  ('Leg Warmers', 'shoes'),
  ('Leggings', 'bottoms'),
  ('Lifestyle', 'other'),
  ('Lingerie & Nightwear', 'underwear'),
  ('Loafers', 'shoes'),
  ('Long Sleeve Henleys', 'tops'),
  ('Long Sleeve Tees', 'tops'),
  ('Long Sleeve Tops', 'tops'),
  ('Long Sleeves', 'tops'),
  ('Loungewear', 'underwear'),
  ('Low Top Sneakers', 'sneakers'),
  ('M-Accessories', 'accessories'),
  ('MAGAZINE', 'lifestyle'),
  ('MARCOS FOTOS / MARCOS DE FOTOS', 'homeware'),
  ('MEN', 'other'),
  ('MENS APPAREL - Mens Crewnecks', 'knitwear'),
  ('MENS APPAREL - Mens Hoods', 'knitwear'),
  ('MENS APPAREL - Mens Outerwear', 'outerwear'),
  ('MENS APPAREL - Mens Pants', 'bottoms'),
  ('MENS APPAREL - Mens Polos', 'tops'),
  ('MENS APPAREL - Mens Shirt SS', 'tops'),
  ('MESAS / MESAS', 'homeware'),
  ('MINI BAGS', 'bags'),
  ('MOCASIN / Z2:MOCASIN', 'shoes'),
  ('MONEDERO BILLETERA / BOLSA/SHOPPING', 'bags'),
  ('MONO / B.PANTALON', 'dresses'),
  ('MONO / C. MONO', 'dresses'),
  ('MONO / ST. MONO', 'dresses'),
  ('MONO / T.PANTALON', 'dresses'),
  ('MONO / T.VESTIDO', 'dresses'),
  ('MONO / W.PANTALON', 'dresses'),
  ('MULES', 'shoes'),
  ('Magazine', 'lifestyle'),
  ('Maxi Dresses', 'dresses'),
  ('Maxi Skirts', 'bottoms'),
  ('Mid Length Socks', 'underwear'),
  ('Mid Top Sneakers', 'sneakers'),
  ('Mini Bags', 'bags'),
  ('Mini Dresses', 'dresses'),
  ('Mini Skirts', 'bottoms'),
  ('Misc', 'other'),
  ('Miscellaneous', 'other'),
  ('Mocknecks', 'knitwear'),
  ('Mule', 'shoes'),
  ('Mules & Clogs', 'shoes'),
  ('Music', 'lifestyle'),
  ('NFT', 'other'),
  ('Necklace', 'jewelry'),
  ('Necklaces', 'jewelry'),
  ('Nighthawks', 'other'),
  ('Nose Rings', 'jewelry'),
  ('Nothing New', 'other'),
  ('Nursery', 'homeware'),
  ('OBJECTS', 'homeware'),
  ('OCCHIALI ', 'eyewear'),
  ('OUTERWEAR', 'outerwear'),
  ('Objects', 'homeware'),
  ('Odds & Ends', 'other'),
  ('One Pieces', 'other'),
  ('Onesies', 'dresses'),
  ('Outer', 'other'),
  ('Outerwear', 'outerwear'),
  ('Oxfords', 'shoes'),
  ('P.EXTERIOR PIEL / FALDA PIEL', 'outerwear'),
  ('PAJARITA/FAJIN / Complementos', 'accessories'),
  ('PALA/PINKY / Z1T:ABIERTO PLA', 'shoes'),
  ('PANTALON / ATH B. Pantalón', 'bottoms'),
  ('PANTALON / ATH Parte Abajo', 'bottoms'),
  ('PANTALON / B. Pant Denim', 'bottoms'),
  ('PANTALON / B. Pant Resto', 'bottoms'),
  ('PANTALON / B.PANT.PAQUETER', 'bottoms'),
  ('PANTALON / B.PANTALON', 'bottoms'),
  ('PANTALON / C.PTON-LEGGING', 'bottoms'),
  ('PANTALON / Complementos', 'bottoms'),
  ('PANTALON / F. Pant Denim', 'bottoms'),
  ('PANTALON / F. Pant Resto', 'bottoms'),
  ('PANTALON / L. PANT. PIJAMA', 'bottoms'),
  ('PANTALON / PUNTO PANTALON', 'bottoms'),
  ('PANTALON / Pant. Alto Ver.', 'bottoms'),
  ('PANTALON / Pant. Circular', 'bottoms'),
  ('PANTALON / Pant. Punto', 'bottoms'),
  ('PANTALON / ST. PANTALON', 'bottoms'),
  ('PANTALON / ST.PANT.PAQUETE', 'bottoms'),
  ('PANTALON / Sastrería Pant.', 'bottoms'),
  ('PANTALON / T.PANT.PAQUETER', 'bottoms'),
  ('PANTALON / T.PANTALON', 'bottoms'),
  ('PANTALON / W.PANT.PAQUETER', 'bottoms'),
  ('PANTALON / W.PANTALON', 'bottoms'),
  ('PANTS', 'bottoms'),
  ('PAPELERIA / PAPELERÍA', 'homeware'),
  ('PAÑOLETAS/FOULARD / Bufanda/Foulard', 'accessories'),
  ('PAÑOLETAS/FOULARD / PAÑ. FANTASÍA', 'accessories'),
  ('PAÑOLETAS/FOULARD / PAÑUELO PEQUEÑO', 'accessories'),
  ('PERFUMES', 'fragrance'),
  ('PETO / W.PANT.PAQUETER', 'bottoms'),
  ('POLO / B. Polo', 'tops'),
  ('POLO / F. Polo', 'tops'),
  ('POLO / Polo M/L', 'tops'),
  ('PROFUMI ', 'fragrance'),
  ('PUMPS', 'shoes'),
  ('Package Protection', 'other'),
  ('Packaged Goods', 'lifestyle'),
  ('Pajama Set', 'underwear'),
  ('Pajamas', 'underwear'),
  ('Pantry', 'homeware'),
  ('Pants', 'bottoms'),
  ('Parkas', 'outerwear'),
  ('Passport Holders', 'bags'),
  ('Patterned Tie', 'accessories'),
  ('Patterned Ties', 'accessories'),
  ('Pet', 'lifestyle'),
  ('Pet Accessories', 'lifestyle'),
  ('Pinch Crown Hats', 'headwear'),
  ('Placeholder', 'other'),
  ('Plain Ties', 'accessories'),
  ('Pocket Squares', 'accessories'),
  ('Pocket Tees', 'tops'),
  ('Polo Shirts', 'tops'),
  ('Polos', 'tops'),
  ('Poncho', 'outerwear'),
  ('Poster', 'lifestyle'),
  ('Puffers', 'outerwear'),
  ('Pullovers', 'knitwear'),
  ('Quarter Zips', 'knitwear'),
  ('Quilts', 'homeware'),
  ('RUNNING / Z1B:DEPORTIVO', 'sneakers'),
  ('RUNNING / Z2:RUNNING', 'sneakers'),
  ('Raglan Coats', 'outerwear'),
  ('Ring', 'jewelry'),
  ('Rings', 'jewelry'),
  ('Robes', 'underwear'),
  ('Rompers', 'dresses'),
  ('Room sprays', 'homeware'),
  ('Rugby Shirts', 'tops'),
  ('SABANAS/FUNDAS / FUNDA NORDICA', 'homeware'),
  ('SANDALIA / Z1B:ABIERTO TAC', 'shoes'),
  ('SANDALIA / Z1T:ABIERTO TAC', 'shoes'),
  ('SANDALIA / Z1W:ABIERTO TAC', 'shoes'),
  ('SANDALIA E / Z1W:ABIERTO PLA', 'shoes'),
  ('SANDALIA PLANA / Z1B:ABIERTO PLA', 'shoes'),
  ('SANDALS & SLIDES', 'shoes'),
  ('SCARPE STRINGATE ', 'shoes'),
  ('SCARVES', 'accessories'),
  ('SHIRTS', 'tops'),
  ('SHOES', 'shoes'),
  ('SHOPIFY', 'other'),
  ('SHORT / C.PTON-LEGGING', 'bottoms'),
  ('SHORT / PUNTO SHORT', 'bottoms'),
  ('SHORTS', 'bottoms'),
  ('SHORTS & SKIRTS', 'bottoms'),
  ('SHOULDER BAGS', 'bags'),
  ('SKIRTS', 'bottoms'),
  ('SLG', 'lifestyle'),
  ('SNEAKERS', 'sneakers'),
  ('SOBRECAMISA / Sobrecamisa', 'outerwear'),
  ('SOCKS', 'underwear'),
  ('SS23 Cafe Merch', 'other'),
  ('SS25', 'other'),
  ('SS26', 'other'),
  ('STIVALI ', 'shoes'),
  ('SUDADERA / ATH B. Sudadera', 'knitwear'),
  ('SUDADERA / ATH ParteArriba', 'knitwear'),
  ('SUDADERA / B. Sudadera', 'knitwear'),
  ('SUDADERA / C.SUDADERA BASI', 'knitwear'),
  ('SUDADERA / C.SUDADERA FANT', 'knitwear'),
  ('SUDADERA / F. Cazadora', 'knitwear'),
  ('SUDADERA / F. Sudadera', 'knitwear'),
  ('SUDADERA / PUNTO SUDADERA', 'knitwear'),
  ('SUDADERA / Sudadera M/C', 'knitwear'),
  ('SUJETADOR / L. SUJE SIN ARO', 'underwear'),
  ('SWEATERS', 'knitwear'),
  ('SWEATSHIRTS', 'knitwear'),
  ('SWIMWEAR', 'swimwear'),
  ('Sandals', 'shoes'),
  ('Sandals and Slides', 'shoes'),
  ('Sartorial Blazer', 'outerwear'),
  ('Sartorial Trouser', 'bottoms'),
  ('Scarves', 'accessories'),
  ('Scarves & Gloves', 'accessories'),
  ('Self Care', 'beauty'),
  ('Self-Care', 'beauty'),
  ('Self-care', 'beauty'),
  ('Shirt', 'tops'),
  ('Shirt Jackets', 'outerwear'),
  ('Shirting', 'tops'),
  ('Shirts', 'tops'),
  ('Shoes', 'shoes'),
  ('Short Sleeve Henleys', 'tops'),
  ('Short Sleeve Tees', 'tops'),
  ('Short Sleeve Tops', 'tops'),
  ('Shortalls', 'dresses'),
  ('Shorts', 'bottoms'),
  ('Shorts & Swim', 'swimwear'),
  ('Skateboard', 'lifestyle'),
  ('Skateboarding', 'lifestyle'),
  ('Skirt', 'bottoms'),
  ('Skirts', 'bottoms'),
  ('Skirts / shorts', 'bottoms'),
  ('Sleepwear', 'underwear'),
  ('Slides', 'shoes'),
  ('Slippers', 'shoes'),
  ('Small Accessories', 'accessories'),
  ('Small Furniture', 'homeware'),
  ('Small accessories', 'accessories'),
  ('Snapback Hats', 'headwear'),
  ('Sneakers', 'sneakers'),
  ('Socks', 'underwear'),
  ('Soft Goods', 'other'),
  ('Stationary', 'lifestyle'),
  ('Stationery', 'lifestyle'),
  ('Striped Tie', 'accessories'),
  ('Striped Ties', 'accessories'),
  ('Suit Pants', 'bottoms'),
  ('Suiting', 'outerwear'),
  ('Suits', 'outerwear'),
  ('Suits & Blazers', 'outerwear'),
  ('Sunglasses', 'eyewear'),
  ('Surf', 'activewear'),
  ('Surfboard', 'lifestyle'),
  ('Sweater', 'knitwear'),
  ('Sweaters', 'knitwear'),
  ('Sweatpants', 'bottoms'),
  ('Sweats', 'knitwear'),
  ('Sweatshirt', 'knitwear'),
  ('Sweatshirts', 'knitwear'),
  ('Sweatshorts', 'knitwear'),
  ('Swim', 'swimwear'),
  ('Swim Bottoms', 'swimwear'),
  ('Swimwear', 'swimwear'),
  ('T-SHIRTS', 'tops'),
  ('T-SHIRTS & TANK TOPS', 'tops'),
  ('T-Shirt', 'tops'),
  ('T-Shirts', 'tops'),
  ('T-Shrits', 'tops'),
  ('T-shirts', 'tops'),
  ('TECH ACCESSORIES', 'lifestyle'),
  ('TEES', 'tops'),
  ('TOALLAS / TOALLAS', 'homeware'),
  ('TOP HANDLE BAGS', 'bags'),
  ('TOPS', 'tops'),
  ('TOPS Y OTRAS P. / C.CTAS BASICAS', 'tops'),
  ('TOPS Y OTRAS P. / C.CTAS FANTASI', 'tops'),
  ('TOPS Y OTRAS P. / C.CTAS POSICIO', 'tops'),
  ('TOPS Y OTRAS P. / CAMISA LENCERIA', 'tops'),
  ('TOPS Y OTRAS P. / COMPL ROPA PAQ', 'tops'),
  ('TOPS Y OTRAS P. / L. CAMISETA', 'tops'),
  ('TOPS Y OTRAS P. / L. TOP PIJAMA', 'tops'),
  ('TOPS Y OTRAS P. / PUNTO TOPS Y OT', 'tops'),
  ('TOTE BAGS', 'bags'),
  ('TROUSERS', 'bottoms'),
  ('Tableware', 'homeware'),
  ('Tank Tops', 'tops'),
  ('Tech', 'lifestyle'),
  ('Tech and Audio', 'lifestyle'),
  ('Teen Girl Clothing', 'other'),
  ('Tees', 'tops'),
  ('Textile', 'homeware'),
  ('Textiles', 'homeware'),
  ('Ties', 'accessories'),
  ('Tinctures & Tonics', 'beauty'),
  ('Top', 'tops'),
  ('Tops', 'tops'),
  ('Tote Bags', 'bags'),
  ('Totes', 'bags'),
  ('Toys & Collectibles', 'lifestyle'),
  ('Track Jackets', 'outerwear'),
  ('Track Pants', 'bottoms'),
  ('Trainers', 'sneakers'),
  ('Trench Coats', 'outerwear'),
  ('Trouser', 'bottoms'),
  ('Trousers', 'bottoms'),
  ('Trucker Hats', 'headwear'),
  ('Tshirts', 'tops'),
  ('Turtlenecks', 'knitwear'),
  ('Two Pieces', 'other'),
  ('UNDERWEAR', 'underwear'),
  ('UNISEX', 'other'),
  ('Unclassified', 'other'),
  ('Undershirts', 'underwear'),
  ('Underwear', 'underwear'),
  ('Underwear & Socks', 'underwear'),
  ('VAJILLAS / PLATO LLANO', 'homeware'),
  ('VESTIDO / B.VESTIDO', 'dresses'),
  ('VESTIDO / C.VESTIDO BASIC', 'dresses'),
  ('VESTIDO / C.VESTIDO FANTA', 'dresses'),
  ('VESTIDO / L. VESTIDO', 'dresses'),
  ('VESTIDO / PUNTO VESTIDO', 'dresses'),
  ('VESTIDO / ST. VESTIDO', 'dresses'),
  ('VESTIDO / T.VESTID.PAQUET', 'dresses'),
  ('VESTIDO / T.VESTIDO', 'dresses'),
  ('VESTIDO / W.VESTIDO', 'dresses'),
  ('VESTS', 'outerwear'),
  ('Varsity Jackets', 'outerwear'),
  ('Vases', 'homeware'),
  ('Vest', 'outerwear'),
  ('Vests', 'outerwear'),
  ('WALLETS & CARDHOLDERS', 'bags'),
  ('WOMEN', 'other'),
  ('WORKSHOP', 'other'),
  ('WORLD TOUR', 'other'),
  ('WOVENS', 'tops'),
  ('Wallet', 'bags'),
  ('Wallet & Cardholders', 'bags'),
  ('Wallets', 'bags'),
  ('Wallets & Cardholders', 'bags'),
  ('Wallets & Cases', 'bags'),
  ('Wallets and Cardholders', 'bags'),
  ('Watches', 'jewelry'),
  ('Wellness', 'beauty'),
  ('Windbreakers', 'outerwear'),
  ('Woven Shirts', 'tops'),
  ('Wristbands', 'lifestyle'),
  ('Youth', 'other'),
  ('ZAPATO / Z2:ZAP. VESTIR', 'shoes'),
  ('ZAPATO PLANO / Z1B:ZAPATO PLAN', 'shoes'),
  ('ZAPATO PLANO / Z1T:ZAPATO PLAN', 'shoes'),
  ('ZAPATO TACON / Z1B:ZAPATO TACO', 'shoes'),
  ('ZAPATO TACON / Z1T:ZAPATO TACO', 'shoes'),
  ('ZAPATO TACON / Z1W:ZAPATO TACO', 'shoes'),
  ('Zip-up Sweaters', 'knitwear'),
  -- ('accessories','accessories') covered by the family identity block
  ('archive', 'other'),
  ('bag', 'bags'),
  ('bandana', 'accessories'),
  ('belt', 'accessories'),
  ('blanket', 'homeware'),
  ('bodysuit', 'underwear'),
  ('book', 'lifestyle'),
  ('bottle', 'lifestyle'),
  ('candle', 'homeware'),
  ('cardigan', 'knitwear'),
  ('clothing', 'other'),
  ('crate', 'homeware'),
  -- ('dresses','dresses') / ('eyewear','eyewear') covered by identity block
  ('food', 'lifestyle'),
  ('footwear', 'shoes'),
  ('gaming', 'lifestyle'),
  ('glassware', 'homeware'),
  ('gloves', 'accessories'),
  ('hat', 'headwear'),
  ('hoodie', 'knitwear'),
  ('incense', 'homeware'),
  ('jacket', 'outerwear'),
  ('jersey', 'knitwear'),
  ('keychain', 'accessories'),
  ('longsleeve', 'tops'),
  ('music', 'lifestyle'),
  ('pant', 'bottoms'),
  ('perfume', 'fragrance'),
  ('pin', 'lifestyle'),
  ('pullover', 'knitwear'),
  ('rug', 'homeware'),
  ('secret', 'other'),
  ('shirt', 'tops'),
  -- ('shoes','shoes') covered by the family identity block
  ('shorts', 'bottoms'),
  ('skirt', 'bottoms'),
  ('soap', 'beauty'),
  ('socks', 'underwear'),
  ('sport', 'activewear'),
  ('sticker', 'lifestyle'),
  ('sweater', 'knitwear'),
  ('sweatpant', 'bottoms'),
  ('sweatshirt', 'knitwear'),
  ('t-shirt', 'tops'),
  ('tech', 'lifestyle'),
  ('towel', 'homeware'),
  ('toy', 'lifestyle'),
  ('vest', 'outerwear')
ON CONFLICT (raw_category) DO UPDATE SET family = EXCLUDED.family;

-- ── 072 RPC FILTER 2 rework: family gate + ladder F + normalization A ──
-- @MX:ANCHOR: [AUTO] search_products_v6 is the sole v6 retrieval contract;
--   every /api/find/search request (SEARCH_ENGINE_VERSION=v6) ranks through
--   this function's cosine `<=>` over idx_product_embeddings_hnsw. This
--   replace ONLY broadens FILTER 2 (raw category exact → canonical family)
--   and adds the family-drop rung to the existing degrade ladder; the
--   signature, RETURNS TABLE, ranking, and the ratified §13 #1 node-drop
--   semantics are preserved verbatim.
-- @MX:REASON: SPEC-SEARCH-V6-001 follow-up. raw `products.category =
--   p_category` matched ~0 Vision-vocab inputs against 752 noisy distinct
--   values, so normal AND degraded paths returned empty on category
--   mismatch (degraded only drops the node, keeps category). Family gate +
--   family-drop rung make the gate broad yet type-coherent while keeping
--   `degraded` a single uniform per-call boolean (false ⇔ full node+family
--   precision produced rows; true ⇔ any gate relaxed).
-- @MX:SPEC: SPEC-SEARCH-V6-001
CREATE OR REPLACE FUNCTION search_products_v6(
  query_embedding   halfvec(768),
  p_style_node_id   bigint  DEFAULT NULL,
  p_category        text    DEFAULT NULL,
  p_subcategory     text    DEFAULT NULL,
  p_brand_names     text[]  DEFAULT NULL,
  p_limit           int     DEFAULT 30
)
RETURNS TABLE (
  id            bigint,
  brand         text,
  name          text,
  price         integer,
  image_url     text,
  product_url   text,
  platform      text,
  subcategory   text,
  distance      double precision,
  degraded      boolean
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_target_family text := NULL;
  v_node_count    integer := 0;
  v_node_fam_cnt  integer := 0;
BEGIN
  -- ── normalization A + method B: resolve the request category to a
  --    canonical family. p_category may arrive as a raw products.category
  --    value OR as a Vision category token; either way we normalize with
  --    lower(trim()) and look it up in category_canonical. No mapping →
  --    'other'. 'other' (and NULL) ⇒ the family gate is treated as ABSENT
  --    (cosine still ranks via the ladder; avoids 'other'-to-'other'
  --    pathological matching of mixed unmapped buckets).
  IF p_category IS NOT NULL THEN
    SELECT cc.family INTO v_target_family
    FROM category_canonical cc
    WHERE lower(trim(cc.raw_category)) = lower(trim(p_category))
    LIMIT 1;
    IF v_target_family IS NULL THEN
      v_target_family := 'other';
    END IF;
  END IF;

  -- family gate is effective only when we resolved a concrete (non-'other')
  -- family. v_target_family IS NULL  → p_category was NULL (no gate).
  -- v_target_family = 'other'        → unrecognized category (no gate).

  -- ── rung 1 candidate count: EXACT node + family gate ─────────────
  -- Only meaningful when a style node id was supplied.
  IF p_style_node_id IS NOT NULL THEN
    SELECT count(*) INTO v_node_fam_cnt
    FROM products p
    JOIN brand_nodes bn ON bn.id = p.brand_node_id
    JOIN product_embeddings pe ON pe.product_id = p.id
    LEFT JOIN category_canonical cc
      ON lower(trim(cc.raw_category)) = lower(trim(p.category))
    WHERE bn.primary_style_node_id = p_style_node_id
      AND p.in_stock = true
      AND (
        p_category IS NULL
        OR v_target_family IS NULL
        OR v_target_family = 'other'
        OR COALESCE(cc.family, 'other') = v_target_family
      )
      AND (p_subcategory IS NULL OR p.subcategory = p_subcategory)
      AND (p_brand_names IS NULL OR bn.brand_name = ANY(p_brand_names));
  END IF;

  IF p_style_node_id IS NOT NULL AND v_node_fam_cnt > 0 THEN
    -- ── rung 1: EXACT node + family gate (NOT degraded) ────────────
    RETURN QUERY
      SELECT p.id, p.brand, p.name, p.price, p.image_url, p.product_url,
             p.platform, p.subcategory,
             (pe.embedding <=> query_embedding)::double precision AS distance,
             false AS degraded
      FROM products p
      JOIN brand_nodes bn ON bn.id = p.brand_node_id
      JOIN product_embeddings pe ON pe.product_id = p.id
      LEFT JOIN category_canonical cc
        ON lower(trim(cc.raw_category)) = lower(trim(p.category))
      WHERE bn.primary_style_node_id = p_style_node_id
        AND p.in_stock = true
        AND (
          p_category IS NULL
          OR v_target_family IS NULL
          OR v_target_family = 'other'
          OR COALESCE(cc.family, 'other') = v_target_family
        )
        AND (p_subcategory IS NULL OR p.subcategory = p_subcategory)
        AND (p_brand_names IS NULL OR bn.brand_name = ANY(p_brand_names))
      ORDER BY pe.embedding <=> query_embedding ASC, p.created_at DESC
      LIMIT p_limit;
    RETURN;
  END IF;

  -- ── rung 2: node filter dropped, family gate KEPT (degraded) ─────
  -- ratified §13 #1 generalized: thin/0 node pool (or no node id). brand
  -- names (strong call) still narrow the pool. Count first so we can fall
  -- through to rung 3 when the family gate alone is still empty.
  SELECT count(*) INTO v_node_count
  FROM products p
  JOIN product_embeddings pe ON pe.product_id = p.id
  LEFT JOIN brand_nodes bn ON bn.id = p.brand_node_id
  LEFT JOIN category_canonical cc
    ON lower(trim(cc.raw_category)) = lower(trim(p.category))
  WHERE p.in_stock = true
    AND (
      p_category IS NULL
      OR v_target_family IS NULL
      OR v_target_family = 'other'
      OR COALESCE(cc.family, 'other') = v_target_family
    )
    AND (p_subcategory IS NULL OR p.subcategory = p_subcategory)
    AND (p_brand_names IS NULL OR bn.brand_name = ANY(p_brand_names));

  IF v_node_count > 0 THEN
    RETURN QUERY
      SELECT p.id, p.brand, p.name, p.price, p.image_url, p.product_url,
             p.platform, p.subcategory,
             (pe.embedding <=> query_embedding)::double precision AS distance,
             true AS degraded
      FROM products p
      JOIN product_embeddings pe ON pe.product_id = p.id
      LEFT JOIN brand_nodes bn ON bn.id = p.brand_node_id
      LEFT JOIN category_canonical cc
        ON lower(trim(cc.raw_category)) = lower(trim(p.category))
      WHERE p.in_stock = true
        AND (
          p_category IS NULL
          OR v_target_family IS NULL
          OR v_target_family = 'other'
          OR COALESCE(cc.family, 'other') = v_target_family
        )
        AND (p_subcategory IS NULL OR p.subcategory = p_subcategory)
        AND (p_brand_names IS NULL OR bn.brand_name = ANY(p_brand_names))
      ORDER BY pe.embedding <=> query_embedding ASC, p.created_at DESC
      LIMIT p_limit;
    RETURN;
  END IF;

  -- ── rung 3: node + family BOTH dropped (still degraded) ──────────
  -- Last resort when even the family gate (or the only-family gate) is
  -- empty: in_stock + embedding + cosine. brand_names (strong call) still
  -- applies. degraded stays true (a gate was relaxed) — never silently
  -- returns empty when any embedded in-stock product exists.
  RETURN QUERY
    SELECT p.id, p.brand, p.name, p.price, p.image_url, p.product_url,
           p.platform, p.subcategory,
           (pe.embedding <=> query_embedding)::double precision AS distance,
           true AS degraded
    FROM products p
    JOIN product_embeddings pe ON pe.product_id = p.id
    LEFT JOIN brand_nodes bn ON bn.id = p.brand_node_id
    WHERE p.in_stock = true
      AND (p_subcategory IS NULL OR p.subcategory = p_subcategory)
      AND (p_brand_names IS NULL OR bn.brand_name = ANY(p_brand_names))
    ORDER BY pe.embedding <=> query_embedding ASC, p.created_at DESC
    LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION search_products_v6 IS
  'v6 embedding-first retrieval (SPEC-SEARCH-V6-001 §4/§13 + 073 family '
  'gate). FILTER1 EXACT primary_style_node → FILTER2 canonical FAMILY '
  '(category_canonical, lower(trim()) normalized) + in_stock + embedding → '
  'cosine `<=>` DESC, created_at tie. Ladder F: rung1 node+family '
  '(degraded=false) → rung2 node dropped/family kept (degraded=true, '
  'ratified §13 #1) → rung3 node+family dropped, cosine-only '
  '(degraded=true). degraded = single uniform per-call bool: false ⇔ full '
  'node+family precision produced rows. Sole ranking signal = cosine; '
  'family is a gate only.';

COMMIT;

-- ── manual verification (post-commit) ───────────────────────────
--   -- coverage: every distinct products.category mapped
--   SELECT count(*) FROM (
--     SELECT DISTINCT lower(trim(category)) c FROM products
--     WHERE category IS NOT NULL
--   ) d
--   LEFT JOIN category_canonical cc
--     ON lower(trim(cc.raw_category)) = d.c
--   WHERE cc.raw_category IS NULL;          -- expect 0
--
--   -- signature unchanged (no PostgREST reload needed):
--   SELECT pg_get_function_identity_arguments('search_products_v6'::regproc);
--
--   -- family gate + ladder smoke (real embedding vector):
--   SELECT id, brand, distance, degraded FROM search_products_v6(
--     (SELECT embedding FROM product_embeddings LIMIT 1),
--     NULL, 'sneakers', NULL, NULL, 5);            -- family gate, degraded
--   SELECT id, distance, degraded FROM search_products_v6(
--     (SELECT embedding FROM product_embeddings LIMIT 1),
--     NULL, 'zzz-no-such-category', NULL, NULL, 5);-- 'other' → ladder
