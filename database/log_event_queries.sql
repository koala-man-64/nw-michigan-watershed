CREATE TABLE dbo.LogEvent (
    EventID BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    EventType NVARCHAR(50) NOT NULL,
    TargetTag NVARCHAR(50) NOT NULL,
    TargetID NVARCHAR(100) NULL,
    TargetClasses NVARCHAR(255) NULL,
    TargetText NVARCHAR(255) NULL,
    ClientIp NVARCHAR(255) NULL,
    ClientUrl NVARCHAR(255) NULL,
    Timestamp DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE INDEX IX_LogEvent_Timestamp ON dbo.LogEvent (Timestamp DESC);

-- Example insert for local verification. Use synthetic/non-production values only.
INSERT INTO dbo.LogEvent (
    EventType,
    TargetTag,
    TargetID,
    TargetClasses,
    TargetText,
    ClientIp,
    ClientUrl
)
VALUES (
    N'click',
    N'BUTTON',
    N'example-submit',
    N'btn btn-primary',
    N'',
    N'203.0.113.10',
    N'https://example.invalid/app'
);

-- Example read query for troubleshooting.
SELECT TOP (50)
    EventID,
    EventType,
    TargetTag,
    ClientUrl,
    Timestamp
FROM dbo.LogEvent
ORDER BY Timestamp DESC;
