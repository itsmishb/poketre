import os
import google.auth
from googleapiclient.discovery import build
import google_auth_httplib2
import httplib2

GEMINI_API_KEY = "AIzaSyBg9bJGCIUi4q0SKNbfzvbjr7UBSN4cfwo"
INBOX_ID = "1Ie4pIpN5cRG64SJeqA1LT5Da0XU9YOY1"
PROCESSED_ID = "18GBIgKVtmEZtrlZVmokvaZ7cCMYXQ4xs"

def get_drive():
    creds, _ = google.auth.default()
    http = httplib2.Http(timeout=60)
    authed_http = google_auth_httplib2.AuthorizedHttp(creds, http=http)
    return build('drive', 'v3', http=authed_http, static_discovery=False)

def test_move():
    drive = get_drive()
    # List files in processed
    results = drive.files().list(
        q=f"'{PROCESSED_ID}' in parents and trashed=false",
        pageSize=1, fields="files(id, name)"
    ).execute()
    files = results.get('files', [])
    if not files:
        print("No files found in processed folder.")
        return

    f = files[0]
    print(f"Moving {f['name']} ({f['id']}) back to inbox...")
    
    # Move file: add inbox, remove processed
    drive.files().update(
        fileId=f['id'],
        addParents=INBOX_ID,
        removeParents=PROCESSED_ID,
        fields='id, parents'
    ).execute()
    print("Move successful. You can now trigger the service.")

if __name__ == "__main__":
    test_move()
