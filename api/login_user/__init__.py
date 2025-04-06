import logging
import json
<<<<<<< HEAD
import os
import azure.functions as func
import debug_attach
=======
import azure.functions as func
>>>>>>> origin/main

def main(req: func.HttpRequest) -> func.HttpResponse:
    logging.info('Python HTTP trigger function processed a login request.')

    try:
        req_body = req.get_json()
    except ValueError:
        return func.HttpResponse("Invalid JSON payload", status_code=400)

    username = req_body.get('username')
    password = req_body.get('password')

    if not username or not password:
        return func.HttpResponse("Missing username or password", status_code=400)

    # Dummy authentication logic for demonstration.
    # Replace with your actual authentication logic.
    if username == "test" and password == "pass":
        # In a real application, generate and return a secure token (e.g., JWT).
        token = "dummy-auth-token"
        response_body = json.dumps({"token": token})
        return func.HttpResponse(response_body, status_code=200, mimetype="application/json")
    else:
        response_body = json.dumps({"error": "Invalid username or password"})
        return func.HttpResponse(response_body, status_code=401, mimetype="application/json")
