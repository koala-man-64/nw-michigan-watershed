import logging
import os
import azure.functions as func
from azure.storage.blob import BlobClient
import common as c

def main(req: func.HttpRequest) -> func.HttpResponse:
    """
    HTTP-triggered function to download a CSV file from Azure Blob Storage.

    This function retrieves the filename from the query parameters or the request body,
    constructs the Blob URL using the storage account information and SAS token, and
    downloads the CSV content from the blob. The CSV content is then returned with the
    appropriate MIME type.

    Args:
        req (func.HttpRequest): The incoming HTTP request containing the filename.

    Returns:
        func.HttpResponse: An HTTP response containing the CSV content if successful,
                           or an error message with an appropriate status code.
    """
    logging.info("Download CSV function triggered.")

    # Retrieve the filename from the query string.
    filename = req.params.get("filename")
    if not filename:
        # If filename is not provided in query parameters, try to get it from the request body.
        try:
            req_body = req.get_json()
        except ValueError:
            req_body = None
        if req_body:
            filename = req_body.get("filename")

    # If filename is still not provided, return a 400 Bad Request response.
    if not filename:
        return func.HttpResponse(
            "Please pass a filename in the query string or in the request body",
            status_code=400
        )

    # Retrieve Azure Storage account information.
    sa_info = c.get_storage_account_info()
    storage_account_name = sa_info["STORAGE_ACCOUNT_NAME"]
    container_name = sa_info["STORAGE_CONTAINER_NAME"]
    sas_token = sa_info["SAS_TOKEN"]

    # Construct the Blob URL using the storage account info and SAS token.
    blob_url = f"https://{storage_account_name}.blob.core.windows.net/{container_name}/{filename}?{sas_token}"

    try:
        # Create a BlobClient instance using the blob URL.
        blob_client = BlobClient.from_blob_url(blob_url)

        # Download the CSV content from the blob.
        download_stream = blob_client.download_blob()
        csv_content = download_stream.readall()

    except Exception as e:
        # Log the error and return a 500 Internal Server Error response.
        logging.error(f"Error downloading blob: {e}")
        return func.HttpResponse(f"Error downloading file: {str(e)}", status_code=500)

    # Return the CSV content with the appropriate MIME type.
    return func.HttpResponse(csv_content, mimetype="text/csv", status_code=200)