import os
import base64
import json
import logging
import time
import re
import uuid
from datetime import datetime, timedelta
from flask import Flask, request
import google.auth
from googleapiclient.discovery import build
import google_auth_httplib2
import httplib2
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from PIL import Image
import io
import concurrent.futures
from concurrent.futures import ThreadPoolExecutor, as_completed, wait, FIRST_COMPLETED

# -----------------------------------------------------------------
# Configuration (Environment Variables)
# -----------------------------------------------------------------
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY')
SPREADSHEET_ID = os.environ.get('SPREADSHEET_ID')
INBOX_FOLDER_ID = os.environ.get('INBOX_FOLDER_ID')
PROCESSED_FOLDER_ID = os.environ.get('PROCESSED_FOLDER_ID')
ERROR_FOLDER_ID = os.environ.get('ERROR_FOLDER_ID')
FATAL_ERROR_FOLDER_ID = os.environ.get('FATAL_ERROR_FOLDER_ID') # New feature: Permanent fail folder
GEMINI_MODEL_PRIMARY = os.environ.get('GEMINI_MODEL_PRIMARY', 'gemini-3-flash-preview')
GEMINI_MODEL_SECONDARY = os.environ.get('GEMINI_MODEL_SECONDARY', 'gemini-2.5-flash')

STAGING_SHEET_NAME = "OCR_Staging"

# File lock timeout: Clear locks older than this (in seconds)
FILE_LOCK_TIMEOUT_SECONDS = 3600  # 1 hour

# Batch processing limits
MAX_FILES_PER_EXECUTION = 300  # Process up to 300 files per run
MAX_EXECUTION_TIME_SECONDS = 1680  # Stop after 28 minutes
CONCURRENT_WORKERS = 10 # Concurrent API workers (throttled to respect 1000 RPM quota)
CONCURRENT_DRIVE_WORKERS = 3 # Gentler throttling for Drive file operations to avoid SSL/Timeout errors

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

def mask_api_key(url):
    return re.sub(r'key=[^&\s]+', 'key=***MASKED***', url)

def get_drive_service():
    credentials, project = google.auth.default()
    http = httplib2.Http(timeout=60)
    authed_http = google_auth_httplib2.AuthorizedHttp(credentials, http=http)
    return build('drive', 'v3', http=authed_http, static_discovery=False)

def get_sheets_service():
    credentials, project = google.auth.default()
    http = httplib2.Http(timeout=60)
    authed_http = google_auth_httplib2.AuthorizedHttp(credentials, http=http)
    return build('sheets', 'v4', http=authed_http, static_discovery=False)

def resize_image(image_bytes, max_size=1024):
    try:
        img = Image.open(io.BytesIO(image_bytes))
        width, height = img.size
        
        if width <= max_size and height <= max_size:
            return image_bytes, width, height

        if width > height:
            new_width = max_size
            new_height = int(max_size * height / width)
        else:
            new_height = max_size
            new_width = int(max_size * width / height)
            
        img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
        
        buffer = io.BytesIO()
        img.convert('RGB').save(buffer, format="JPEG", quality=85)
        return buffer.getvalue(), width, height
    except Exception as e:
        logger.error(f"Image resize error: {e}")
        return image_bytes, 0, 0

def build_ocr_prompt():
    return """あなたはポケモンカードの情報を極めて正確に読み取る専門家です。
画像から以下の情報を抽出し、指定されたJSON形式で出力してください。

【1. 最優先: カード名称 (name_ja)】
* 場所: カード左上 HP の左側にある最大サイズの文字。
* ルール: 「メガ」「M」「ゲンシ」などの冠名も名前に含めてください。（例: "MルカリオEX"）
* 除外: 「テラスタル」「～から進化」などの小さな補足説明文字は無視してください。

【2. 世代 (generation)】
* カードのデザインやエキスパンションマーク付近から判定してください。
* 選択肢: "SV"(スカーレット・バイオレット), "S"(ソード・シールド), "SM"(サン・ムーン), "XY", "BW", "DP", "ADV", "PCG", "LEGEND", "旧裏"

【3. タイプ判定 (poke_type)】
* **右上の属性アイコンの中身の形**のみで判定してください。（背景色に惑わされないこと）
* ドラゴン: 黄金の背景 + S字/Z字型の竜の紋章。
* 無色: 白背景 + 星型。
* その他: 各属性（草、炎、水、雷、超、闘、悪、鋼、フェアリー）に対応するアイコン。

【4. カテゴリとサブタイプ (card_type / trainer_subtype)】
* card_type: "ポケモン", "トレーナーズ", "エネルギー", "その他"
* trainer_subtype: card_type がトレーナーズの場合のみ、以下から選択:
  "グッズ", "サポート", "スタジアム", "ポケモンのどうぐ"（※ACE SPEC等もこのカテゴリに属することがあります）

【5. 特殊情報】
* is_psa_slab: PSA鑑定ケース（スラブ）に入った状態の画像である場合は true。
* psa_grade: PSAスラブ画像の場合、ラベルに記載されたグレード（10, 9など）を数値で。
* psa_cert_number: PSAスラブのラベル下部にある8桁または10桁程度の証明番号。
* psa_label_text: PSAラベルに記載されているテキスト全体（内容確認用）。
* psa_card_number: PSAラベルに記載されているカード固有の番号（右上の番号など、下部の 3桁/3桁 とは別物）。
* is_ace_spec: "ACE SPEC" のロゴや記載がある場合は true。
* paradox_tag: "古代" または "未来" のタグがある場合に記述。
* is_waza_machine: カード名に「ワザマシン」が含まれる場合は true。
* is_mirror: ミラー加工（モンスターボール柄、マスターボール柄、プレミアム加工など）がある場合は true。
* is_holo: ホログラム加工（カード全体が光っている、またはイラスト部分が光っている）がある場合は true。
* confidence: あなたの回答に対する自信度を 0.0〜1.0 で出力。

【6. 製造情報 (カード左下・最下段)】
以下の並び順に注目し、正確に抽出してください：
[regulation_mark] | [set_code] | [card_number_text] | [rarity]

* regulation_mark: 一番先頭（左端）にある、白い背景の枠内のアルファベット1文字（例: J, G）。
* set_code: regulation_markの右隣にある、黒い背景の枠内の白文字（例: M3, SV8a）。**必ず大文字**に変換してください。
* card_number_text: set_codeの右隣にある「番号/総数」形式のテキスト。**必ず3桁/3桁**でゼロ埋めしてください（例: 001/080, 013/080）。
* rarity: card_number_textの右隣にあるアルファベット（例: C, RR, SAR）。
* illustrator: "Illus." または "illus." の右側の名称。
* first_edition: 初版マーク（"1st Edition" / "1ED"）がある場合は true。

【出力スキーマ】
JSON形式のみを出力してください（Markdownのバックテックは不要）。"""

def get_ocr_response_schema():
    return {
        "type": "object",
        "required": ["name_ja", "card_type", "set_code"],
        "properties": {
            "name_ja": {"type": "string"},
            "generation": {"type": "string", "enum": ["SV", "S", "SM", "XY", "BW", "DP", "ADV", "PCG", "LEGEND", "旧裏"]},
            "set_code": {"type": "string"},
            "regulation_mark": {"type": "string", "nullable": True},
            "card_number_text": {"type": "string", "nullable": True},
            "card_number": {"type": "integer", "nullable": True},
            "number_total": {"type": "integer", "nullable": True},
            "rarity": {"type": "string", "nullable": True},
            "illustrator": {"type": "string", "nullable": True},
            "card_type": {"type": "string", "enum": ["ポケモン", "トレーナーズ", "エネルギー", "その他"]},
            "poke_type": {"type": "string", "enum": ["草", "炎", "水", "雷", "超", "闘", "悪", "鋼", "ドラゴン", "無色", "フェアリー"], "nullable": True},
            "trainer_subtype": {"type": "string", "enum": ["グッズ", "サポート", "スタジアム", "ポケモンのどうぐ"], "nullable": True},
            "is_ace_spec": {"type": "boolean"},
            "paradox_tag": {"type": "string", "enum": ["古代", "未来"], "nullable": True},
            "is_waza_machine": {"type": "boolean"},
            "is_mirror": {"type": "boolean"},
            "is_holo": {"type": "boolean"},
            "first_edition": {"type": "boolean"},
            "is_psa_slab": {"type": "boolean"},
            "psa_grade": {"type": "integer", "nullable": True},
            "psa_cert_number": {"type": "string", "nullable": True},
            "psa_label_text": {"type": "string", "nullable": True},
            "psa_card_number": {"type": "string", "nullable": True},
            "confidence": {"type": "number"}
        }
    }

def call_gemini_api(image_bytes, mime_type, model_name):
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={GEMINI_API_KEY}"
    
    payload = {
        "contents": [{
            "parts": [
                {"text": build_ocr_prompt()},
                {"inline_data": {"mime_type": mime_type, "data": base64.b64encode(image_bytes).decode('utf-8')}}
            ]
        }],
        "generationConfig": {
            "temperature": 0,
            "response_mime_type": "application/json",
            "response_schema": get_ocr_response_schema()
        }
    }

    # Add media_resolution if using gemini-3 or 2.5 flash
    if "flash" in model_name:
        payload["generationConfig"]["media_resolution"] = "media_resolution_high"

    session = requests.Session()
    retry = Retry(
        total=2,
        backoff_factor=2,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["POST"]
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("https://", adapter)

    try:
        # Increase timeout internally since we parallelize
        response = session.post(url, json=payload, timeout=60) 
        if response.status_code == 200:
            text = response.json()['candidates'][0]['content']['parts'][0]['text']
            return json.loads(text)
        logger.error(f"[{model_name}] API error: {response.status_code} - {mask_api_key(url)}")
    except Exception as e:
        logger.error(f"[{model_name}] request error: {e} - {mask_api_key(url)}")
    return None

def call_gemini_with_hedging(image_bytes, mime_type, correlation_id):
    start_time = time.time()
    with ThreadPoolExecutor(max_workers=2) as executor:
        primary_future = executor.submit(call_gemini_api, image_bytes, mime_type, GEMINI_MODEL_PRIMARY)
        done, _ = wait([primary_future], timeout=15)
        
        if primary_future in done:
            result = primary_future.result()
            if result:
                return result, GEMINI_MODEL_PRIMARY, (time.time() - start_time) * 1000
        
        logger.info(f"[CID:{correlation_id}] Primary model slow or failed, triggering secondary request")
        secondary_future = executor.submit(call_gemini_api, image_bytes, mime_type, GEMINI_MODEL_SECONDARY)
        
        done, _ = wait([primary_future, secondary_future], timeout=60, return_when=FIRST_COMPLETED)
        
        for future in done:
            try:
                result = future.result()
                if result:
                    model = GEMINI_MODEL_PRIMARY if future == primary_future else GEMINI_MODEL_SECONDARY
                    return result, model, (time.time() - start_time) * 1000
            except:
                continue
                
        done, _ = wait([primary_future, secondary_future], timeout=30, return_when=FIRST_COMPLETED)
        for future in done:
            try:
                result = future.result()
                if result:
                    model = GEMINI_MODEL_PRIMARY if future == primary_future else GEMINI_MODEL_SECONDARY
                    return result, model, (time.time() - start_time) * 1000
            except:
                continue

    return None, "FAILED", (time.time() - start_time) * 1000

def format_card_number(data):
    set_code = (data.get('set_code') or '???').upper()
    set_code = re.sub(r'^[a-zA-Z]+', lambda m: m.group(0).upper(), set_code)
    
    card_num_str = data.get('card_number_text')
    if card_num_str and '/' in card_num_str:
        parts = card_num_str.split('/')
        num = parts[0].strip().zfill(3)
        total = re.sub(r'[^0-9]', '', parts[1]).strip().zfill(3)
        card_num_str = f"{num}/{total}"
    else:
        num = str(data.get('card_number') or 0).zfill(3)
        total = str(data.get('number_total') or 0).zfill(3)
        card_num_str = f"{num}/{total}"
    
    return set_code, card_num_str

def process_single_image(file_info, headers, h_map, deadline_time):
    """Worker function to process a single image independently"""
    file_id = file_info['id']
    file_name = file_info['name']
    mime_type = file_info['mimeType']
    correlation_id = str(uuid.uuid4())[:8]
    step_times = {}

    drive = get_drive_service() # Independent instance for thread safety

    if time.time() > deadline_time:
        return {"status": "skipped", "file_name": file_name, "reason": "deadline_exceeded"}

    try:
        # LOCK VERIFICATION & FATAL ERROR HANDLING
        retries = int(file_info.get('appProperties', {}).get('retry_count', '0')) + 1
        
        # If this image failed 3 times already, permanently quarantine it
        if retries > 3:
            # If FATAL_ERROR_FOLDER_ID is set, use it. Otherwise leave it in ERROR_FOLDER.
            target_folder = FATAL_ERROR_FOLDER_ID if FATAL_ERROR_FOLDER_ID else ERROR_FOLDER_ID
            logger.error(f"[CID:{correlation_id}] {file_name} exceeded max retries ({retries}). Moving to permanent error folder.")
            drive.files().update(
                fileId=file_id, 
                addParents=target_folder, 
                removeParents=INBOX_FOLDER_ID,
                body={'appProperties': {'processing': 'false', 'processing_started_at': ''}}
            ).execute()
            return {"status": "error", "file_name": file_name, "error": "Max retries exceeded"}

        drive.files().update(
            fileId=file_id,
            body={
                'appProperties': {
                    'processing': 'true',
                    'processing_started_at': datetime.utcnow().isoformat(),
                    'lock_id': correlation_id,
                    'retry_count': str(retries)
                }
            }
        ).execute()

        verified_file = drive.files().get(fileId=file_id, fields="appProperties").execute()
        if verified_file.get('appProperties', {}).get('lock_id') != correlation_id:
            return {"status": "skipped", "file_name": file_name, "reason": "lock_contention"}

        # DOWNLOAD
        step_start = time.time()
        content = drive.files().get_media(fileId=file_id).execute()
        step_times['drive_download'] = time.time() - step_start
        
        # PREPROCESS
        step_start = time.time()
        content, orig_w, orig_h = resize_image(content, max_size=1024)
        mime_type = "image/jpeg"
        step_times['preprocess'] = time.time() - step_start
        
        # GEMINI
        step_start = time.time()
        data, used_model, gemini_ms = call_gemini_with_hedging(content, mime_type, correlation_id)
        step_times['gemini_call'] = time.time() - step_start
        
        if not data:
            raise Exception("All models failed")

        if data.get('card_type') != 'トレーナーズ':
            data['trainer_subtype'] = None

        set_code, card_num_str = format_card_number(data)
        serial = f"{set_code}_{card_num_str}".strip()
        img_url = f"https://drive.google.com/thumbnail?id={file_id}&sz=w1000"

        # ROW MAPPING
        new_row = [None] * len(headers)
        mapping = {
            "file_name": file_name, "image_url": img_url, "ai_json": json.dumps(data, ensure_ascii=False),
            "status": "登録待ち", "serial_number": serial, "qty": 1,
            "set_code": data.get('set_code'), "regulation_mark": data.get('regulation_mark'),
            "card_number": data.get('card_number'), "number_total": data.get('number_total'),
            "rarity": data.get('rarity'), "card_type": data.get('card_type'),
            "name_ja": data.get('name_ja'), "illustrator": data.get('illustrator'),
            "card_number_text": card_num_str, "stg_id": f"stg_{file_id}",
            "generation": data.get('generation'), "poke_type": data.get('poke_type'),
            "trainer_subtype": data.get('trainer_subtype'), "is_ace_spec": data.get('is_ace_spec'),
            "paradox_tag": data.get('paradox_tag'), "is_waza_machine": data.get('is_waza_machine'),
            "mirror_pattern": data.get('is_mirror'), "first_edition": data.get('first_edition'),
            "is_psa_slab": data.get('is_psa_slab'), "psa_grade": data.get('psa_grade'),
            "psa_cert_number": data.get('psa_cert_number'), "psa_label_text": data.get('psa_label_text'),
            "psa_card_number": data.get('psa_card_number'), "confidence": data.get('confidence'),
            "holo": data.get('is_holo')
        }
        for h, val in mapping.items():
            if h in h_map: new_row[h_map[h]] = val

        # NOTE: File is no longer moved to PROCESSED_FOLDER here. 
        # It will be moved in batch at the end of process_images to guarantee transaction safety.

        logger.info(f"[PERF] cid={correlation_id} file={file_name} success, steps={step_times}")
        return {"status": "success", "file_name": file_name, "serial": serial, "row": new_row, "file_id": file_id}

    except Exception as e:
        logger.error(f"[CID:{correlation_id}] Error handling file {file_name}: {e}")
        try:
            drive.files().update(fileId=file_id, addParents=ERROR_FOLDER_ID, removeParents=INBOX_FOLDER_ID).execute()
        except Exception:
            try:
                drive.files().update(fileId=file_id, body={'appProperties': {'processing': 'false', 'processing_started_at': ''}}).execute()
            except: pass
        return {"status": "error", "file_name": file_name, "error": str(e)}

def process_images():
    execution_start_time = time.time()
    # Setting deadline: Stop accepting new files 4 minutes before the true Cloud Run timeout (28 mins)
    deadline_time = execution_start_time + MAX_EXECUTION_TIME_SECONDS - 240 

    drive = get_drive_service()
    sheets = get_sheets_service()

    # --- 1. Fetch Google Sheet Data (for Idempotency & Aggregation) ---
    res = sheets.spreadsheets().values().get(spreadsheetId=SPREADSHEET_ID, range=f"{STAGING_SHEET_NAME}!A:AE").execute()
    rows = res.get('values', [])
    if not rows:
        return "Sheet error: No content found in target sheet."

    headers = [h.strip() for h in rows[0]]
    h_map = {h: i for i, h in enumerate(headers)}
    
    pending_map = {}
    existing_stg_ids = set()
    
    if len(rows) > 1:
        for idx, row in enumerate(rows[1:], start=2):
            serial_idx = h_map.get('serial_number')
            status_idx = h_map.get('status')
            qty_idx = h_map.get('qty')
            stg_idx = h_map.get('stg_id')
            
            serial = row[serial_idx] if serial_idx is not None and serial_idx < len(row) else None
            status = row[status_idx] if status_idx is not None and status_idx < len(row) else None
            qty_val = row[qty_idx] if qty_idx is not None and qty_idx < len(row) else 1
            stg_val = row[stg_idx] if stg_idx is not None and stg_idx < len(row) else None
            
            if stg_val: existing_stg_ids.add(stg_val.strip())
            
            if status: status = status.strip()
            if serial: serial = serial.strip()
            
            if status == "登録待ち" and serial:
                try: qty_int = int(qty_val) if qty_val else 1
                except: qty_int = 1
                pending_map[serial] = {"row": idx, "qty": qty_int}

    # --- 2. Query Google Drive ---
    files = drive.files().list(
        q=f"'{INBOX_FOLDER_ID}' in parents and (mimeType='image/jpeg' or mimeType='image/png') and trashed=false",
        fields="files(id, name, mimeType, appProperties)",
        orderBy="createdTime",
        pageSize=1000
    ).execute().get('files', [])
    
    now = datetime.utcnow()
    available_files = []
    
    # Filter files (Crash Recovery & Idempotency)
    for file in files:
        file_stg_id = f"stg_{file['id']}"
        
        # IDEMPOTENCY CHECK: If already in Google Sheets but left in INBOX, just move it.
        if file_stg_id in existing_stg_ids:
            logger.info(f"File {file['name']} already exists in Sheets (Idempotent). Unlocking and moving to processed.")
            try:
                drive.files().update(
                    fileId=file['id'], 
                    addParents=PROCESSED_FOLDER_ID, 
                    removeParents=INBOX_FOLDER_ID,
                    body={'appProperties': {'processing': 'false', 'processing_started_at': ''}}
                ).execute()
            except: pass
            continue

        # NORMAL LOCK CHECK
        app_props = file.get('appProperties', {})
        if app_props.get('processing') == 'true':
            lock_time_str = app_props.get('processing_started_at')
            if lock_time_str:
                try:
                    lock_time = datetime.fromisoformat(lock_time_str)
                    if (now - lock_time).total_seconds() > FILE_LOCK_TIMEOUT_SECONDS:
                        logger.warning(f"Stale lock detected on {file['name']}. Clearing lock.")
                        drive.files().update(
                            fileId=file['id'], 
                            body={'appProperties': {'processing': 'false', 'processing_started_at': ''}}
                        ).execute()
                        available_files.append(file)
                except:
                    drive.files().update(fileId=file['id'], body={'appProperties': {'processing': 'false', 'processing_started_at': ''}}).execute()
                    available_files.append(file)
            else:
                drive.files().update(fileId=file['id'], body={'appProperties': {'processing': 'false', 'processing_started_at': ''}}).execute()
                available_files.append(file)
        else:
            available_files.append(file)
    
    files_to_process = available_files[:MAX_FILES_PER_EXECUTION]
    total_files = len(files_to_process)
    logger.info(f"Found {total_files} files to process in inbox. Max batch size: {MAX_FILES_PER_EXECUTION}.")
    
    if not files_to_process: return "No files found in inbox."

    # --- 3. Parallel Processing ---
    results = []
    with ThreadPoolExecutor(max_workers=CONCURRENT_WORKERS) as executor:
        future_to_file = {executor.submit(process_single_image, file, headers, h_map, deadline_time): file for file in files_to_process}
        for future in as_completed(future_to_file):
            try:
                res_data = future.result()
                results.append(res_data)
            except Exception as exc:
                logger.error(f"Worker generated an exception: {exc}")
                results.append({"status": "error", "error": str(exc)})

    # --- 4. Collate results and Update Sheets ---
    new_rows_dict = {}       
    updates_to_existing = {} 
    successful_file_ids = []

    success_count = 0
    error_count = 0
    skipped_count = 0

    col_letter_qty = chr(65 + h_map['qty'])
    
    for r in results:
        if r["status"] == "success":
            success_count += 1
            serial = r["serial"]
            successful_file_ids.append(r["file_id"])
            
            if serial in pending_map:
                pending_map[serial]['qty'] += 1
                updates_to_existing[serial] = pending_map[serial]
            elif serial in new_rows_dict:
                qty_idx = h_map['qty']
                current_qty = new_rows_dict[serial][qty_idx]
                new_rows_dict[serial][qty_idx] = current_qty + 1
            else:
                new_rows_dict[serial] = r["row"]
                
        elif r["status"] == "error":
            error_count += 1
        elif r["status"] == "skipped":
            skipped_count += 1

    sheets_ms = 0
    step_start = time.time()
    if success_count > 0:
        qty_updates = []
        for serial, entry in updates_to_existing.items():
            qty_updates.append({
                "range": f"{STAGING_SHEET_NAME}!{col_letter_qty}{entry['row']}",
                "values": [[entry['qty']]]
            })
    
        if qty_updates:
            batch_update_request = {
                "valueInputOption": "USER_ENTERED",
                "data": qty_updates
            }
            sheets.spreadsheets().values().batchUpdate(spreadsheetId=SPREADSHEET_ID, body=batch_update_request).execute()
    
        if new_rows_dict:
            new_rows_to_append = list(new_rows_dict.values())
            sheets.spreadsheets().values().append(
                spreadsheetId=SPREADSHEET_ID, 
                range=f"{STAGING_SHEET_NAME}!A1",
                valueInputOption="USER_ENTERED", 
                body={"values": new_rows_to_append}
            ).execute()
            
        sheets_ms = (time.time() - step_start) * 1000

    # --- 5. Batch Move Files (Guaranteed Decoupled Transaction) ---
    def move_to_processed(f_id):
        try:
            drive.files().update(fileId=f_id, addParents=PROCESSED_FOLDER_ID, removeParents=INBOX_FOLDER_ID, body={'appProperties': {'processing': 'false', 'processing_started_at': ''}}).execute()
            drive.permissions().create(fileId=f_id, body={'type': 'anyone', 'role': 'reader'}).execute()
        except Exception as e:
            logger.error(f"Failed to move file {f_id} to processed: {e}")

    if successful_file_ids:
        move_start = time.time()
        with ThreadPoolExecutor(max_workers=CONCURRENT_DRIVE_WORKERS) as mv_executor:
            for _ in mv_executor.map(move_to_processed, successful_file_ids):
                pass
        logger.info(f"Batch file move completed in {(time.time() - move_start)*1000:.0f}ms")

    execution_time = time.time() - execution_start_time
    logger.info(f"[BATCH_SUMMARY] processed={success_count}/{total_files} errors={error_count} skipped={skipped_count} sheets_ms={sheets_ms:.0f} time_elapsed={execution_time:.1f}s")
    return f"Execution completed. Success: {success_count}, Errors: {error_count}, Skipped: {skipped_count} within {execution_time:.1f}s."

@app.route("/", methods=["POST", "GET"])
def index():
    return process_images(), 200

@app.route("/retry", methods=["POST", "GET"])
def retry_errors():
    """
    Endpoint to move items from the Error folder back to the Inbox.
    Images with retry_count > 3 will be ignored (or already moved to FATAL errors).
    """
    drive = get_drive_service()
    
    # Find files in the ERROR folder
    files = drive.files().list(
        q=f"'{ERROR_FOLDER_ID}' in parents and trashed=false",
        fields="files(id, name, appProperties)",
        pageSize=500
    ).execute().get('files', [])
    
    if not files:
        return "No files found in Error folder to retry.", 200
        
    moved_count = 0
    permanently_failed = 0
    
    for file in files:
        retries = int(file.get('appProperties', {}).get('retry_count', '0'))
        file_id = file['id']
        
        # If it reached max retries, don't put it back in the inbox.
        # Send it to FATAL_ERROR folder instead to keep ERROR_FOLDER clean for true retries.
        if retries >= 3:
            permanently_failed += 1
            if FATAL_ERROR_FOLDER_ID:
                try:
                    drive.files().update(
                        fileId=file_id, 
                        addParents=FATAL_ERROR_FOLDER_ID, 
                        removeParents=ERROR_FOLDER_ID
                    ).execute()
                except Exception as e:
                    logger.error(f"Failed to move {file['name']} to Fatal Error Folder: {e}")
            continue
            
        # Move back to Inbox and clear the lock flag.
        try:
            drive.files().update(
                fileId=file_id, 
                addParents=INBOX_FOLDER_ID, 
                removeParents=ERROR_FOLDER_ID,
                body={'appProperties': {'processing': 'false', 'processing_started_at': ''}}
            ).execute()
            moved_count += 1
        except Exception as e:
            logger.error(f"Failed to move {file['name']} back to Inbox: {e}")
            
    logger.info(f"[RETRY_SWEEP] Moved {moved_count} files back to Inbox. {permanently_failed} files permanently failed.")
    return f"Moved {moved_count} files back to Inbox for retrying. {permanently_failed} files reached max retries and were ignored.", 200

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8080)))
