import os
import io
import json
import logging
from typing import Optional

import azure.functions as func
from azure.storage.blob import BlobServiceClient
from azure.core.credentials import AzureSasCredential

try:
    import pandas as pd  # optional; only needed for JSON output
except Exception:
    pd = None


def _cors_headers():
    # Narrow this in production and configure CORS in the Function App settings.
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    }


def _normalize_sas(token: Optional[str]) -> Optional[AzureSasCredential]:
    if not token:
        return None
    t = token.strip()
    if t.startswith("?"):
        t = t[1:]
    return AzureSasCredential(t)


def _get_blob_service_client() -> BlobServiceClient:
    """
    Auth precedence:
      1) BLOB_CONN (connection string)
      2) STORAGE_ACCOUNT_NAME + SAS_TOKEN
      3) STORAGE_ACCOUNT_URL + Managed Identity / Default creds
    """
    conn = os.getenv("BLOB_CONN")
    if conn:
        return BlobServiceClient.from_connection_string(conn)

    acct_name = os.getenv("STORAGE_ACCOUNT_NAME")
    sas = _normalize_sas(os.getenv("SAS_TOKEN"))
    if acct_name and sas:
        account_url = f"https://{acct_name}.blob.core.windows.net"
        return BlobServiceClient(account_url=account_url, credential=sas)

    # Managed Identity / default chain (works when deployed with MSI)
    account_url = os.getenv("STORAGE_ACCOUNT_URL")
    if account_url:
        # Using no explicit credential here lets the SDK pick up MSI / workload identity.
        return BlobServiceClient(account_url=account_url)

    raise RuntimeError("No storage auth configured. Provide BLOB_CONN or (STORAGE_ACCOUNT_NAME+SAS_TOKEN) or STORAGE_ACCOUNT_URL.")


def _read_params(req: func.HttpRequest) -> dict:
    # Query takes precedence, then JSON body, then env defaults.
    qs = {k.lower(): v for k, v in req.params.items()}
    body = {}
    try:
        if req.get_body():
            body = json.loads(req.get_body() or b"{}")
            if not isinstance(body, dict):
                body = {}
    except Exception:
        body = {}

    def pick(key: str, env_key: Optional[str] = None, default: Optional[str] = None) -> Optional[str]:
        return qs.get(key) or body.get(key) or os.getenv(env_key or key.upper(), default)

    return {
        "container": pick("container", "BLOB_CONTAINER"),
        "blob": pick("blob", "BLOB_NAME"),
        "format": (pick("format") or "csv").lower(),  # "csv" or "json"
    }


def _csv_bytes_to_json_rows(data: bytes):
    if pd is None:
        raise RuntimeError("JSON output requires pandas; install it or use format=csv.")
    df = pd.read_csv(io.BytesIO(data))
    return df.to_dict(orient="records")


app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)  # switch to FUNCTION in prod


@app.route(route="read-csv", methods=["GET", "POST"])
def read_csv(req: func.HttpRequest) -> func.HttpResponse:
    logging.info("ReadCsvFromBlob: request received")
    if req.method == "OPTIONS":
        return func.HttpResponse(status_code=204, headers=_cors_headers())

    try:
        params = _read_params(req)
        container = params["container"]
        blob = params["blob"]
        out_format = params["format"]

        if not container or not blob:
            return func.HttpResponse(
                json.dumps({"error": "Provide 'container' and 'blob' (query/body) or set env defaults."}),
                status_code=400,
                mimetype="application/json",
                headers=_cors_headers(),
            )

        bsc = _get_blob_service_client()
        bc = bsc.get_container_client(container).get_blob_client(blob)
        data = bc.download_blob(max_concurrency=2).readall()  # bytes

        if out_format == "json":
            rows = _csv_bytes_to_json_rows(data)
            return func.HttpResponse(json.dumps(rows, default=str), status_code=200, mimetype="application/json", headers=_cors_headers())

        # default: raw CSV passthrough
        return func.HttpResponse(
            body=data,
            status_code=200,
            mimetype="text/csv",
            headers={**_cors_headers(), "Content-Disposition": f'inline; filename="{os.path.basename(blob)}"'},
        )

    except Exception as e:
        logging.exception("ReadCsvFromBlob: error")
        return func.HttpResponse(json.dumps({"error": str(e)}), status_code=500, mimetype="application/json", headers=_cors_headers())
