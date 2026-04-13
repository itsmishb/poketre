-- カードマスタ単位の「出品向け紹介文」（チャネル共通のたたき台）
-- チャネル別の上書きは listings.listing_title / listing_description を利用

BEGIN;

ALTER TABLE cards
    ADD COLUMN IF NOT EXISTS public_description_ja text;

COMMENT ON COLUMN cards.public_description_ja IS '出品・商品ページ向け紹介文（マスタ）。AI生成や手入力で更新想定。';

COMMIT;
