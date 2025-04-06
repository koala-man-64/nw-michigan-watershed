import os
import json

# if os.getenv("AzureWebJobsScriptRoot") and not os.getenv("DEBUGPY_ATTACHED"):
#     import debugpy
#     debugpy.listen(("0.0.0.0", 5678))
#     print("Waiting for debugger attach...")
#     debugpy.wait_for_client()
#     os.environ["DEBUGPY_ATTACHED"] = "1"

def get_connection_params():
    try:
        if os.environ.get("LOCAL_DEVELOPMENT", "true").lower() == "true":
            with open("local.settings.json", "r") as f:
                local_settings = json.load(f)
            values     = local_settings.get("Values", {})
            raw_server = values.get("SQL_SERVER")
            database   = values.get("SQL_DATABASE")
            username   = values.get("SQL_USERNAME")
            password   = values.get("SQL_PASSWORD")
        else:
            raw_server = os.environ["SQL_SERVER"]
            database   = os.environ["SQL_DATABASE"]
            username   = os.environ["SQL_USERNAME"]
            password   = os.environ["SQL_PASSWORD"]

        # Remove "tcp:" prefix if present
        if raw_server.startswith("tcp:"):
            raw_server = raw_server[4:]

        # Split server and port if a comma exists
        if "," in raw_server:
            server, port_str = raw_server.split(",", 1)
            port = int(port_str)
        else:
            server = raw_server
            port = 1433  # default SQL Server port

        connection_params = {
            "server": server,
            "user": username,
            "password": password,
            "database": database,
            "port": port
        }
        return connection_params
    except Exception as e:
        raise Exception(f"ERROR retrieving connection parameters: {str(e)}")
