import azure.functions as func
import logging
import common as c
import pymssql
import datetime 

def main(req: func.HttpRequest) -> func.HttpResponse:
    logging.info("Received a log event request.")

    try:
        req_body = req.get_json()
    except ValueError:
        return func.HttpResponse("Invalid JSON", status_code=400)

    # Retrieve each value, defaulting to an empty string if None
    eventType     = req_body.get("eventType") or ""
    targetTag     = req_body.get("targetTag") or ""
    targetId      = req_body.get("targetId") or ""
    targetClasses = req_body.get("targetClasses") or ""
    targetText    = req_body.get("targetText") or ""
    timestamp     = datetime.datetime.now()
    clientIp      = req_body.get("clientIp") or ""
    clientUrl     = req_body.get("clientUrl") or ""

    try:
        # Retrieve connection parameters from your common module.
        # Ensure that c.get_connection_params() returns a dictionary with keys like:
        # server, user, password, database, and optionally port.
        connection_params = c.get_connection_params()
        conn = pymssql.connect(**connection_params)
        cursor = conn.cursor()

        insert_sql = """
            INSERT INTO dbo.LogEvent (
                EventType,
                TargetTag,
                TargetID,
                TargetClasses,
                TargetText,
                ClientIp,
                ClientUrl,
                Timestamp
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """

        cursor.execute(insert_sql, (
            eventType,
            targetTag,
            targetId,
            targetClasses,
            targetText,
            clientIp,
            clientUrl,
            timestamp
        ))

        conn.commit()
        cursor.close()
        conn.close()
    except Exception as e:
        logging.error("Error inserting log data into SQL: %s", e)
        logging.error("Stack trace:", exc_info=True)
        return func.HttpResponse(str(e), status_code=500)

    return func.HttpResponse("Log data received and inserted.", status_code=200)
