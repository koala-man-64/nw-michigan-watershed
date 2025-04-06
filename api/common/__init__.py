import os
import json

# if os.getenv("AzureWebJobsScriptRoot") and not os.getenv("DEBUGPY_ATTACHED"):
#     import debugpy
#     debugpy.listen(("0.0.0.0", 5678))
#     print("Waiting for debugger attach...")
#     debugpy.wait_for_client()
#     os.environ["DEBUGPY_ATTACHED"] = "1"

def get_connection_string():
    try:
        # If running locally, read each parameter from local.settings.json
        if os.environ.get("LOCAL_DEVELOPMENT", "true").lower() == "true":
            with open("local.settings.json", "r") as f:
                local_settings = json.load(f)
            values = local_settings.get("Values", {})
            server   = values.get("SQL_SERVER")
            database = values.get("SQL_DATABASE")
            username = values.get("SQL_USERNAME")
            password = values.get("SQL_PASSWORD")
            driver   = "{ODBC Driver 17 for SQL Server}"
            
        else:
            # In production, assume these are set as environment variables.
            server   = os.environ["SQL_SERVER"]
            database = os.environ["SQL_DATABASE"]
            username = os.environ["SQL_USERNAME"]
            password = os.environ["SQL_PASSWORD"]
            driver   = "{ODBC Driver 17 for SQL Server}"
        
        connection_string = (
            f"DRIVER={driver};"
            f"SERVER={server};"
            f"DATABASE={database};"
            f"UID={username};"
            f"PWD={password};"
            "Encrypt=yes;"
            "TrustServerCertificate=no;"
            "Connection Timeout=30;"
        )
        return connection_string
    except Exception as e:
        return f"ERROR: {str(e)}"