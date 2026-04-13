import os
import google.auth
from googleapiclient.discovery import build
import google_auth_httplib2
import httplib2

SPREADSHEET_ID = os.environ.get('SPREADSHEET_ID')
INBOX_FOLDER_ID = os.environ.get('INBOX_FOLDER_ID')
STAGING_SHEET = "OCR_Staging"
LOG_SHEET = "_Internal_Processed_Files" # Keep for backward compatibility if needed

def get_service(name, version):
    credentials, project = google.auth.default()
    http = httplib2.Http(timeout=60)
    authed_http = google_auth_httplib2.AuthorizedHttp(credentials, http=http)
    return build(name, version, http=authed_http, static_discovery=False)

def check_status():
    sheets = get_service('sheets', 'v4')
    drive = get_service('drive', 'v3')
    
    # Check Staging Sheet
    try:
        res = sheets.spreadsheets().values().get(spreadsheetId=SPREADSHEET_ID, range=f"{STAGING_SHEET}!A:AE").execute()
        rows = res.get('values', [])
        if rows:
            headers = rows[0]
            print(f"Staging sheet '{STAGING_SHEET}' has {len(rows)-1} rows and {len(headers)} columns.")
            if "stg_id" in headers:
                stg_idx = headers.index("stg_id")
                stg_ids = [r[stg_idx] for r in rows[1:] if len(r) > stg_idx]
                print(f"Found {len(stg_ids)} stg_id entries.")
            else:
                print("❌ 'stg_id' column is MISSING in Staging sheet.")
        else:
            print(f"Staging sheet '{STAGING_SHEET}' is empty.")
    except Exception as e:
        print(f"Error reading staging sheet: {e}")
        
    # Check Inbox
    try:
        files = drive.files().list(q=f"'{INBOX_FOLDER_ID}' in parents and trashed=false").execute().get('files', [])
        print(f"Inbox has {len(files)} files.")
        for f in files:
            print(f"- {f['name']} ({f['id']})")
    except Exception as e:
        print(f"Error reading inbox: {e}")

if __name__ == "__main__":
    check_status()
