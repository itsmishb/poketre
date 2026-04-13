import os
import google.auth
from googleapiclient.discovery import build
import google_auth_httplib2
import httplib2

SPREADSHEET_ID = os.environ.get('SPREADSHEET_ID')
STAGING_SHEET_NAME = "OCR_Staging"

def get_sheets_service():
    credentials, project = google.auth.default()
    http = httplib2.Http(timeout=60)
    authed_http = google_auth_httplib2.AuthorizedHttp(credentials, http=http)
    return build('sheets', 'v4', http=authed_http, static_discovery=False)

def check_headers():
    sheets = get_sheets_service()
    res = sheets.spreadsheets().values().get(spreadsheetId=SPREADSHEET_ID, range=f"{STAGING_SHEET_NAME}!1:1").execute()
    rows = res.get('values', [])
    if not rows:
        print("No headers found.")
        return
    headers = rows[0]
    print(f"Headers found ({len(headers)} columns):")
    for i, h in enumerate(headers):
        print(f"{i}: {h}")
    
    if "stg_id" in headers:
        print("\n✅ 'stg_id' column exists.")
    else:
        print("\n❌ 'stg_id' column is MISSING.")

if __name__ == "__main__":
    check_headers()
