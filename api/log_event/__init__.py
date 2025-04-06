<<<<<<< HEAD
import os
import pyodbc
import azure.functions as func
import logging
import json
import debug_attach

def get_connection_string():
    # Check if we are in a local development environment.
    if os.environ.get("LOCAL_DEVELOPMENT", "true").lower() == "true":
        # Read connection string from local.settings.json
        with open("local.settings.json", "r") as f:
            local_settings = json.load(f)
        # Expect the connection string to be set in the "Values" section.
        connection_string = local_settings.get("Values", {}).get("SQL_CONNECTION_STRING")
        if not connection_string:
            raise ValueError("SQL_CONNECTION_STRING not found in local.settings.json. Please add it to the Values section.")
    else:
        # In production, the connection string is expected to be injected via your deployment pipeline or Azure Function App settings.
        connection_string = os.environ["SQL_CONNECTION_STRING"]
    return connection_string

def main(req: func.HttpRequest) -> func.HttpResponse:
    get_connection_string()
    logging.info("Received a log event request.")
=======
import logging
import json
import os
import pyodbc
import azure.functions as func

def main(req: func.HttpRequest) -> func.HttpResponse:
    logging.info('Received a log event request.')

>>>>>>> origin/main
    try:
        req_body = req.get_json()
    except ValueError:
        return func.HttpResponse("Invalid JSON", status_code=400)
<<<<<<< HEAD
    
=======

>>>>>>> origin/main
    # Extract properties from the request body
    eventType    = req_body.get("eventType")
    targetTag    = req_body.get("targetTag")
    targetId     = req_body.get("targetId")
    targetClasses= req_body.get("targetClasses")
    timestamp    = req_body.get("timestamp")

<<<<<<< HEAD
    # Retrieve the connection string using our helper function.
    try:
        connection_string = get_connection_string()
        conn = pyodbc.connect(connection_string)
        cursor = conn.cursor()

        insert_sql = """
            INSERT INTO dbo.LogEvent (eventType, targetTag, targetId, targetClasses, timestamp)
            VALUES (?, ?, ?, ?, ?)
        """
        
        cursor.execute(insert_sql, (eventType, targetTag, targetId, targetClasses, timestamp))
        conn.commit()
=======
    # Connect to Azure SQL Database using the connection string from environment variables
    try:
        connection_string = os.environ["SQL_CONNECTION_STRING"]
        conn = pyodbc.connect(connection_string)
        cursor = conn.cursor()

        # Insert the log data into the Logs table.
        # Ensure your table "Logs" has columns: eventType, targetTag, targetId, targetClasses, timestamp.
        insert_sql = """
            INSERT INTO Logs (eventType, targetTag, targetId, targetClasses, timestamp)
            VALUES (?, ?, ?, ?, ?)
        """
        cursor.execute(insert_sql, (eventType, targetTag, targetId, targetClasses, timestamp))
        conn.commit()

>>>>>>> origin/main
        cursor.close()
        conn.close()
    except Exception as e:
        logging.error("Error inserting log data into SQL: %s", e)
        return func.HttpResponse("Error inserting log data", status_code=500)

    return func.HttpResponse("Log data received and inserted.", status_code=200)
