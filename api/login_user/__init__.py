import logging
import os
import json
import jwt
import datetime
import azure.functions as func
import pymssql
import common

# Retrieve the secret key from environment variables.
# In local development, this is usually provided by local.settings.json.
# In production, it should be set via GitHub Secrets or your cloud configuration.
SECRET_KEY = os.environ.get('JWT_SECRET_KEY')
if not SECRET_KEY:
    raise Exception("JWT_SECRET_KEY is not set in environment variables")
ALGORITHM = 'HS256'

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

    # Helper function to generate the JWT.
    def generate_token(user: str):
        payload = {
            'username': user,
            'iat': datetime.datetime.utcnow(),
            'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=1)
        }
        return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

    # Dummy authentication for a specific test user.
    if username == "test" and password == "pass":
        token = generate_token(username)
        response_body = json.dumps({"token": token})
        return func.HttpResponse(response_body, status_code=200, mimetype="application/json")
    else:
        # Connect to the database via pymssql.
        try:
            connection_params = common.get_connection_params()
            conn = pymssql.connect(**connection_params)
            cursor = conn.cursor()

            # Query the Users table for the given username using %s as the placeholder.
            query = "SELECT Password FROM dbo.Users WHERE Username = %s"
            cursor.execute(query, (username,))
            row = cursor.fetchone()

            if row:
                db_password = row[0]
                if password == db_password:
                    token = generate_token(username)
                    response_body = json.dumps({"token": token})
                    status_code = 200
                else:
                    response_body = json.dumps({"error": "Invalid credentials"})
                    status_code = 401
            else:
                response_body = json.dumps({"error": "User not found"})
                status_code = 404

            cursor.close()
            conn.close()
        except Exception as e:
            logging.error("Database error: %s", e)
            return func.HttpResponse("Internal server error", status_code=500)

        return func.HttpResponse(response_body, status_code=status_code, mimetype="application/json")
