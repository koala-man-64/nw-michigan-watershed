import logging
import azure.functions as func
import sys
import os
import common

def main(req: func.HttpRequest) -> func.HttpResponse:
    logging.info("Hello World function processed a request.")
    return func.HttpResponse("Hello, World!", status_code=200)