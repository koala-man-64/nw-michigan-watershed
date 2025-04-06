# import pyodbc
import azure.functions as func
import logging
# from .. import common_functions as cf



def main(req: func.HttpRequest) -> func.HttpResponse:
    logging.info("Received a log event request.")

    # try:
    #     req_body = req.get_json()
    # except ValueError:
    #     return func.HttpResponse("Invalid JSON", status_code=400)

    # # Retrieve each value, defaulting to an empty string if None
    # eventType      = req_body.get("eventType") or ""
    # targetTag      = req_body.get("targetTag") or ""
    # targetId       = req_body.get("targetId") or ""
    # targetClasses  = req_body.get("targetClasses") or ""
    # targetText     = req_body.get("targetText") or ""
    # timestamp      = req_body.get("timestamp") or ""
    # clientIp       = req_body.get("clientIp") or ""
    # clientUrl      = req_body.get("clientUrl") or ""

    # try:
    #     connection_string = cf.get_connection_string()
    #     conn = pyodbc.connect(connection_string)
    #     cursor = conn.cursor()

    #     # Make sure your table has a column for TargetText.
    #     insert_sql = """
    #         INSERT INTO dbo.LogEvent (
    #             EventType,
    #             TargetTag,
    #             TargetID,
    #             TargetClasses,
    #             TargetText,
    #             ClientIp,
    #             ClientUrl,
    #             Timestamp
    #         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    #     """

    #     cursor.execute(insert_sql, (
    #         eventType,
    #         targetTag,
    #         targetId,
    #         targetClasses,
    #         targetText,
    #         clientIp,
    #         clientUrl,
    #         timestamp
    #     ))

    #     conn.commit()
    #     cursor.close()
    #     conn.close()
    # except Exception as e:
    #     logging.error("Error inserting log data into SQL: %s", e)
    #     logging.error("Stack trace:", exc_info=True)
        return func.HttpResponse(str(e), status_code=500)


    return func.HttpResponse("Log data received and inserted.", status_code=200)
