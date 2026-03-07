from __future__ import annotations

import types

import pytest

import sql


def test_parse_kv_conn_string_extracts_keys() -> None:
    parsed = sql.parse_kv_conn_string("Server=tcp:db.example.com,1444;Database=nwmiws;User ID=user;Password=secret")

    assert parsed["server"] == "tcp:db.example.com,1444"
    assert parsed["database"] == "nwmiws"
    assert parsed["user id"] == "user"
    assert parsed["password"] == "secret"


def test_sql_from_env_supports_connection_string(monkeypatch) -> None:
    monkeypatch.setenv(
        "SQL_CONNECTION_STRING",
        "Server=tcp:db.example.com,1444;Database=nwmiws;User ID=user;Password=secret",
    )

    assert sql.sql_from_env() == {
        "server": "db.example.com",
        "database": "nwmiws",
        "user": "user",
        "password": "secret",
        "port": 1444,
    }


def test_sql_from_env_uses_discrete_env_vars(monkeypatch) -> None:
    monkeypatch.setenv("SQL_SERVER", "tcp:db.example.com")
    monkeypatch.setenv("SQL_DATABASE", "nwmiws")
    monkeypatch.setenv("SQL_USERNAME", "user")
    monkeypatch.setenv("SQL_PASSWORD", "secret")

    assert sql.sql_from_env() == {
        "server": "db.example.com",
        "database": "nwmiws",
        "user": "user",
        "password": "secret",
        "port": 1433,
    }


def test_sql_from_env_raises_when_required_values_missing() -> None:
    with pytest.raises(RuntimeError, match="Missing required SQL env vars"):
        sql.sql_from_env()


def test_connect_sql_uses_pymssql_when_configured(monkeypatch) -> None:
    calls: dict[str, object] = {}

    monkeypatch.setenv("SQL_DRIVER", "pymssql")
    monkeypatch.setattr(sql, "sql_from_env", lambda: {"server": "db", "user": "user", "password": "pw", "database": "nw", "port": 1433})
    monkeypatch.setattr(
        sql,
        "pymssql",
        types.SimpleNamespace(connect=lambda **kwargs: calls.update(kwargs) or "pymssql-conn"),
    )

    assert sql.connect_sql() == "pymssql-conn"
    assert calls["server"] == "db"
    assert calls["database"] == "nw"


def test_connect_sql_uses_pyodbc_when_selected(monkeypatch) -> None:
    monkeypatch.setenv("SQL_DRIVER", "pyodbc")
    monkeypatch.setenv("SQL_CONNECTION_STRING", "Driver=ODBC Driver 18 for SQL Server;Server=db")
    monkeypatch.setattr(sql, "pyodbc", types.SimpleNamespace(connect=lambda conn_str: ("pyodbc", conn_str)))

    assert sql.connect_sql() == ("pyodbc", "Driver=ODBC Driver 18 for SQL Server;Server=db")
