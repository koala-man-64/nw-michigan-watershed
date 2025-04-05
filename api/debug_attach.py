# debug_attach.py
import os

if os.getenv("AzureWebJobsScriptRoot") and not os.getenv("DEBUGPY_ATTACHED"):
    import debugpy
    debugpy.listen(("0.0.0.0", 5678))
    print("Waiting for debugger attach...")
    debugpy.wait_for_client()
    os.environ["DEBUGPY_ATTACHED"] = "1"