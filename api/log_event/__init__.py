import os
import pyodbc
import azure.functions as func
import logging
import debug_attach

def get_connection_string():
    # Check if we are in a local development environment.
    if os.environ.get("LOCAL_DEVELOPMENT", "false").lower() == "true":
        # Read from a local file (ensure this file is ignored by Git)
        with open("local_connection_string.txt", "r") as f:
            connection_string = f.read().strip()
    else:
        # In production, the connection string is expected to be injected by your deployment pipeline
        # using a GitHub secret (or stored in the Azure Function App settings)
        connection_string = os.environ["SQL_CONNECTION_STRING"]
    return connection_string

def main(req: func.HttpRequest) -> func.HttpResponse:
    logging.info("Received a log event request.")
    try:
        req_body = req.get_json()
    except ValueError:
        return func.HttpResponse("Invalid JSON", status_code=400)
    
    # Extract properties from the request body
    eventType    = req_body.get("eventType")
    targetTag    = req_body.get("targetTag")
    targetId     = req_body.get("targetId")
    targetClasses= req_body.get("targetClasses")
    timestamp    = req_body.get("timestamp")

    # Retrieve the connection string using our helper function.
    try:
        connection_string = get_connection_string()
        conn = pyodbc.connect(connection_string)
        cursor = conn.cursor()

        insert_sql = """
            INSERT INTO Logs (eventType, targetTag, targetId, targetClasses, timestamp)
            VALUES (?, ?, ?, ?, ?)
        """
        cursor.execute(insert_sql, (eventType, targetTag, targetId, targetClasses, timestamp))
        conn.commit()
        cursor.close()
        conn.close()
    except Exception as e:
        logging.error("Error inserting log data into SQL: %s", e)
        return func.HttpResponse("Error inserting log data", status_code=500)

    return func.HttpResponse("Log data received and inserted.", status_code=200)
