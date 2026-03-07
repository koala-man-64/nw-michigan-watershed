from __future__ import annotations

import datetime
from contextlib import closing
from typing import Any

from config import env, env_int

try:
    import pyodbc
except Exception:
    pyodbc = None

try:
    import pymssql
except Exception:
    pymssql = None


def parse_kv_conn_string(connection_string: str) -> dict[str, str]:
    items: dict[str, str] = {}
    for part in (connection_string or "").split(";"):
        if not part.strip() or "=" not in part:
            continue
        key, value = part.split("=", 1)
        items[key.strip().lower()] = value.strip()
    return items


def sql_from_env() -> dict[str, Any]:
    connection_string = (env("SQL_CONNECTION_STRING") or "").strip()
    if connection_string:
        values = parse_kv_conn_string(connection_string)
        server_raw = (
            values.get("server")
            or values.get("data source")
            or values.get("address")
            or values.get("addr")
            or values.get("network address")
        )
        database = values.get("database") or values.get("initial catalog")
        user = values.get("user id") or values.get("uid") or values.get("user")
        password = values.get("password") or values.get("pwd")
        if not (server_raw and database and user and password):
            raise RuntimeError(
                "SQL_CONNECTION_STRING missing required keys (server, database, user id, password)."
            )
        server_raw = server_raw.replace("tcp:", "")
        if "," in server_raw:
            server, port_string = server_raw.split(",", 1)
            port = int(port_string)
        else:
            server, port = server_raw, env_int("SQL_PORT", 1433)
        return {"server": server, "database": database, "user": user, "password": password, "port": port}

    server = env("SQL_SERVER")
    database = env("SQL_DATABASE")
    user = env("SQL_USERNAME")
    password = env("SQL_PASSWORD")
    port = env_int("SQL_PORT", 1433)
    missing = [
        name
        for name, value in {
            "SQL_SERVER": server,
            "SQL_DATABASE": database,
            "SQL_USERNAME": user,
            "SQL_PASSWORD": password,
        }.items()
        if not value
    ]
    if missing:
        raise RuntimeError(f"Missing required SQL env vars: {', '.join(missing)}")
    return {
        "server": server.replace("tcp:", ""),
        "database": database,
        "user": user,
        "password": password,
        "port": port,
    }


def connect_sql():
    choice = (env("SQL_DRIVER", "pymssql") or "pymssql").lower()
    if choice == "pymssql":
        if pymssql is None:
            raise RuntimeError("SQL_DRIVER=pymssql but pymssql is not installed.")
        params = sql_from_env()
        return pymssql.connect(
            server=params["server"],
            user=params["user"],
            password=params["password"],
            database=params["database"],
            port=params["port"],
        )

    if pyodbc is None:
        raise RuntimeError("pyodbc is not installed and SQL_DRIVER is not set to 'pymssql'.")
    connection_string = env("SQLSERVER_CONNSTR") or env("SQL_CONNECTION_STRING")
    if not connection_string:
        raise RuntimeError("Set SQLSERVER_CONNSTR (ODBC) or SQL_CONNECTION_STRING.")
    return pyodbc.connect(connection_string)


def check_sql_connection() -> None:
    with closing(connect_sql()) as conn:
        with closing(conn.cursor()) as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()


def write_log_event(
    *,
    event_type: str,
    target_tag: str,
    target_id: str,
    target_classes: str,
    target_text: str,
    client_ip: str,
    client_url: str,
    timestamp: datetime.datetime,
) -> None:
    driver_choice = (env("SQL_DRIVER", "pymssql") or "pymssql").lower()
    insert_sql = (
        "INSERT INTO dbo.LogEvent (EventType,TargetTag,TargetID,TargetClasses,TargetText,ClientIp,ClientUrl,Timestamp) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        if driver_choice != "pymssql"
        else "INSERT INTO dbo.LogEvent (EventType,TargetTag,TargetID,TargetClasses,TargetText,ClientIp,ClientUrl,Timestamp) "
        "VALUES (%s, %s, %s, %s, %s, %s, %s, %s)"
    )
    values = (event_type, target_tag, target_id, target_classes, target_text, client_ip, client_url, timestamp)
    with closing(connect_sql()) as conn:
        with closing(conn.cursor()) as cursor:
            cursor.execute(insert_sql, values)
            conn.commit()
