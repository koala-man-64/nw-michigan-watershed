import logging
import os
import azure.functions as func
import debug_attach  # Only runs once due to module caching

def main(req: func.HttpRequest) -> func.HttpResponse:
    logging.info("Hello World function processed a request.")
    return func.HttpResponse("Hello, Worlds!", status_code=200)
