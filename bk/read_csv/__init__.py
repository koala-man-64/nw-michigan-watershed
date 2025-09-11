import os, io, json, logging, csv
from typing import Optional
import azure.functions as func
from azure.mgmt.storage.blob import BlobServiceClient
#from azure.storage.blob import BlobServiceClient
from azure.core.credentials import AzureSasCredential

try:
    import pandas as pd
    import debugpy
except Exception:
    # Pandas (and by extension NumPy) is optional.  If it's not available,
    # we will fall back to the built‑in csv module for CSV→JSON conversion.
    pd = None
    debugpy = None
    
def _cors():
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    }
    

if os.environ.get("ENABLE_DEBUGPY", "0") == "1" and debugpy is not None:
    try:
        # Bind to localhost to match VS Code attach target
        # debugpy.listen(("127.0.0.1", int(os.getenv("DEBUGPY_PORT", "5678"))))
        if os.environ.get("WAIT_FOR_DEBUGGER", "0") == "1":
            print("Waiting for debugger attach on 127.0.0.1:", os.getenv("DEBUGPY_PORT", "5678"))
            debugpy.wait_for_client()
    except RuntimeError:
        # Already listening (another function import). Ignore.
        pass    


def _normalize_sas(token: Optional[str]) -> Optional[AzureSasCredential]:
    if not token:
        return None
    t = token.strip()
    if t.startswith("?"):
        t = t[1:]
    return AzureSasCredential(t)

def _bsc() -> BlobServiceClient:
    conn = os.getenv("BLOB_CONN")
    if conn:
        logging.info("Auth mode: connection string")
        return BlobServiceClient.from_connection_string(conn)

    acct = os.getenv("STORAGE_ACCOUNT_NAME")
    sas  = _normalize_sas(os.getenv("SAS_TOKEN"))
    if acct and sas:
        logging.info("Auth mode: account + SAS")
        return BlobServiceClient(account_url=f"https://{acct}.blob.core.windows.net", credential=sas)

    url = os.getenv("STORAGE_ACCOUNT_URL")
    if url:
        logging.info("Auth mode: account URL (default creds/MSI)")
        return BlobServiceClient(account_url=url)

    raise RuntimeError("Missing storage auth: set BLOB_CONN or (STORAGE_ACCOUNT_NAME+SAS_TOKEN) or STORAGE_ACCOUNT_URL")

def _params(req: func.HttpRequest) -> dict:
    qs   = {k.lower(): v for k, v in req.params.items()}
    body = {}
    try:
        if req.get_body():
            body = json.loads(req.get_body() or b"{}")
            if not isinstance(body, dict):
                body = {}
    except Exception:
        body = {}
    pick = lambda k, env=None, d=None: qs.get(k) or body.get(k) or os.getenv((env or k).upper(), d)
    return {
        "container": pick("container", "BLOB_CONTAINER"),
        "blob":      pick("blob", "BLOB_NAME"),
        "format":   (pick("format") or "csv").lower(),  # csv | json
    }

def _csv_to_rows(data: bytes):
    """Convert CSV data to a list of dictionaries.

    If pandas is available this uses DataFrame for robust parsing; otherwise it
    falls back to Python's built‑in csv module.
    """
    if pd is not None:
        # Use pandas for fast parsing
        try:
            df = pd.read_csv(io.BytesIO(data))
            return df.to_dict(orient="records")
        except Exception as e:
            logging.warning("Pandas failed to parse CSV; falling back to built‑in csv module: %s", e)
    # Fallback: decode bytes and parse with csv.DictReader
    try:
        text = data.decode("utf-8")
    except Exception:
        # Fallback to latin-1 to avoid decode errors
        text = data.decode("latin-1")
    reader = None
    try:
        reader = csv.DictReader(io.StringIO(text))
    except Exception as e:
        logging.error("CSV fallback parsing failed: %s", e)
        raise
    return [dict(row) for row in reader]

def _handle_read_csv(req: func.HttpRequest) -> func.HttpResponse:
    logging.info("ENTER _handle_read_csv method=%s", req.method)
    try:
        if req.method == "OPTIONS":
            logging.info("CORS preflight → 204")
            return func.HttpResponse(status_code=204, headers=_cors())

        p = _params(req)
        logging.info("params: %s", p)

        if not p["container"] or not p["blob"]:
            logging.warning("400: missing container/blob")
            return func.HttpResponse(
                json.dumps({"error": "Provide container & blob (query/body) or set BLOB_CONTAINER/BLOB_NAME"}),
                status_code=400, mimetype="application/json", headers=_cors()
            )

        bsc = _bsc()
        data = bsc.get_container_client(p["container"]).get_blob_client(p["blob"]).download_blob(
            max_concurrency=2
        ).readall()

        if p["format"] == "json":
            rows = _csv_to_rows(data)
            logging.info("200: returning %d rows", len(rows))
            return func.HttpResponse(
                json.dumps(rows, default=str),
                status_code=200,
                mimetype="application/json",
                headers=_cors()
            )

        logging.info("200: returning CSV (%d bytes)", len(data))
        return func.HttpResponse(
            body=data,
            status_code=200,
            mimetype="text/csv",
            headers={
                **_cors(),
                "Content-Disposition": f'inline; filename="{os.path.basename(p["blob"])}"'
            }
        )

    except Exception as e:
        logging.exception("500: _handle_read_csv failed")
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            status_code=500,
            mimetype="application/json",
            headers=_cors()
        )

# ---- V1 shim (called by function.json) ----
def main(req: func.HttpRequest) -> func.HttpResponse:
    logging.info("v1 main() calling _handle_read_csv: %r", _handle_read_csv)
    resp = _handle_read_csv(req)
    logging.info("v1 main() got type=%s", type(resp))
    if resp is None:
        logging.error("_handle_read_csv returned None; returning 500 safeguard")
        return func.HttpResponse(
            json.dumps({"error": "internal: handler returned None"}),
            status_code=500,
            mimetype="application/json",
            headers=_cors()
        )
    return resp
