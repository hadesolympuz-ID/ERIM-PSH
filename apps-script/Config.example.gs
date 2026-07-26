const ERIM_CONFIG = Object.freeze({
  ENVIRONMENT: "development",
  SPREADSHEET_ID: "REPLACE_WITH_DEV_SPREADSHEET_ID",
  ROOT_DRIVE_FOLDER_ID: "REPLACE_WITH_DEV_FOLDER_ID",
  GOOGLE_CLIENT_ID: "REPLACE_WITH_DESKTOP_OAUTH_CLIENT_ID",
  COMPANY_DOMAIN: "peakseasonholidays.com",
  ALLOWED_FRONTEND_ORIGIN: "https://status.peakseasonholidays.com"
});

/*
Set these as Apps Script Project Settings -> Script Properties:

SPREADSHEET_ID
ROOT_DRIVE_FOLDER_ID
GOOGLE_CLIENT_ID
COMPANY_DOMAIN
ENVIRONMENT

Do not copy real values into a committed .gs file.
*/
