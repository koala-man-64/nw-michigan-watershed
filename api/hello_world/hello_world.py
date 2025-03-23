import logging
import azure.functions as func

def main(req: func.HttpRequest, res: func.Out[str]) -> None:
    logging.info('Python HTTP trigger function processed a request.')
    res.set("Hello, world!")
