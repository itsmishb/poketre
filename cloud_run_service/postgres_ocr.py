"""
OCR 結果を ocr_staging (PostgreSQL) に書き込む。
環境変数 OCR_WRITE_TARGET=postgres のとき main から呼ばれる。
"""
import json
import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


def fetch_existing_stg_ids(conn) -> set:
    """冪等判定用（stg_id 一覧）"""
    with conn.cursor() as cur:
        cur.execute("SELECT stg_id FROM ocr_staging")
        return {row[0] for row in cur.fetchall() if row[0]}


def insert_ocr_rows(conn, rows: List[Dict[str, Any]]) -> int:
    """
    rows: process_single_image が返す mapping に file_id を足した dict のリスト
    必須キー: stg_id, drive_file_id, file_name, image_url, ai_json, status, serial_number, qty
    """
    if not rows:
        return 0
    sql = """
    INSERT INTO ocr_staging (
        stg_id, drive_file_id, file_name, image_url, ai_json, status,
        serial_number, set_code, regulation_mark, card_number, number_total,
        rarity, card_type, trainer_subtype, poke_type, name_ja, holo,
        illustrator, card_number_text, mirror_pattern, qty, confidence,
        is_psa_slab, psa_grade, psa_cert_number, psa_label_text, psa_card_number
    ) VALUES (
        %(stg_id)s, %(drive_file_id)s, %(file_name)s, %(image_url)s, CAST(%(ai_json)s AS jsonb), %(status)s,
        %(serial_number)s, %(set_code)s, %(regulation_mark)s, %(card_number)s, %(number_total)s,
        %(rarity)s, %(card_type)s, %(trainer_subtype)s, %(poke_type)s, %(name_ja)s, %(holo)s,
        %(illustrator)s, %(card_number_text)s, %(mirror_pattern)s, %(qty)s, %(confidence)s,
        %(is_psa_slab)s, %(psa_grade)s, %(psa_cert_number)s, %(psa_label_text)s, %(psa_card_number)s
    )
    ON CONFLICT (drive_file_id) DO NOTHING
    """
    n = 0
    with conn.cursor() as cur:
        for r in rows:
            cur.execute(sql, r)
            n += cur.rowcount
    conn.commit()
    logger.info(f"postgres_ocr: inserted {n} ocr_staging rows ({len(rows)} attempts)")
    return n


def mapping_to_row(file_id: str, file_name: str, mapping: Dict[str, Any]) -> Dict[str, Any]:
    """シート用 mapping から DB INSERT 用 dict を作る"""
    def _json_text(val: Any) -> str:
        if val is None:
            return "{}"
        if isinstance(val, str):
            return val
        return json.dumps(val, ensure_ascii=False)

    ai_raw = mapping.get("ai_json")
    img_url = mapping.get("image_url") or ""
    return {
        "stg_id": mapping.get("stg_id") or f"stg_{file_id}",
        "drive_file_id": file_id,
        "file_name": file_name,
        "image_url": img_url,
        "ai_json": _json_text(ai_raw),
        "status": mapping.get("status") or "登録待ち",
        "serial_number": mapping.get("serial_number"),
        "set_code": mapping.get("set_code"),
        "regulation_mark": mapping.get("regulation_mark"),
        "card_number": mapping.get("card_number"),
        "number_total": mapping.get("number_total"),
        "rarity": mapping.get("rarity"),
        "card_type": mapping.get("card_type"),
        "trainer_subtype": mapping.get("trainer_subtype"),
        "poke_type": mapping.get("poke_type"),
        "name_ja": mapping.get("name_ja"),
        "holo": mapping.get("holo"),
        "illustrator": mapping.get("illustrator"),
        "card_number_text": mapping.get("card_number_text"),
        "mirror_pattern": mapping.get("mirror_pattern"),
        "qty": int(mapping.get("qty") or 1),
        "confidence": mapping.get("confidence"),
        "is_psa_slab": mapping.get("is_psa_slab"),
        "psa_grade": mapping.get("psa_grade"),
        "psa_cert_number": mapping.get("psa_cert_number"),
        "psa_label_text": mapping.get("psa_label_text"),
        "psa_card_number": mapping.get("psa_card_number"),
    }
