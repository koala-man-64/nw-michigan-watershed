import logging
import json
import os
import pyodbc
import azure.functions as func

def main(req: func.HttpRequest) -> func.HttpResponse:
    logging.info('Received a log event request.')

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

        cursor.close()
        conn.close()
    except Exception as e:
        logging.error("Error inserting log data into SQL: %s", e)
        return func.HttpResponse("Error inserting log data", status_code=500)

    return func.HttpResponse("Log data received and inserted.", status_code=200)
