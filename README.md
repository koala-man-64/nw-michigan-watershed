# Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Azure Static Web Apps configuration (runtime)

GitHub Actions build steps do not configure runtime environment variables for your deployed API. Configure these in Azure Static Web Apps (Configuration / Application settings) for the `api/` Functions:

- `SQL_CONNECTION_STRING` (required for `log-event`)
- `SQL_DRIVER` (optional; defaults to `pymssql`)
- `STORAGE_ACCOUNT_URL` + Managed Identity **or** `BLOB_CONN` (required for `read-csv`)
- `PUBLIC_BLOB_CONTAINER` (defaults to `nwmiws`)
- `PUBLIC_BLOBS` (CSV allowlist; recommended to set explicitly)
- `READ_CSV_MEMORY_CACHE_TTL_SEC` (optional; function-instance in-memory blob cache, defaults to `300`)
- `READ_CSV_BROWSER_CACHE_MAX_AGE_SEC` (optional; `Cache-Control: max-age`, defaults to `3600`)
- `READ_CSV_BROWSER_CACHE_SWR_SEC` (optional; `stale-while-revalidate` window, defaults to `86400`)
- `LOG_EVENT_REQUIRED_ROLE` (defaults to `authenticated`)
- `LOG_EVENT_ENABLED`, `LOG_EVENT_SAMPLE_RATE`, `LOG_EVENT_RATE_LIMIT_*`, `LOG_EVENT_IP_MODE`, `LOG_EVENT_CAPTURE_TEXT` (optional hardening)

The client now persists CSV responses in `localStorage` and revalidates them with `ETag` headers in the background, so repeat app loads can render cached data immediately without redownloading unchanged blobs.

For production validation of the `read-csv` endpoint after deployment, use [the prod `read-csv` validation runbook](docs/runbooks/prod-read-csv-validation.md).

## Local debugging note (AzureWebJobsStorage)

If VS Code prompts that it “Failed to verify `AzureWebJobsStorage`” when starting a debug session, either:

- Run Azurite and keep `AzureWebJobsStorage=UseDevelopmentStorage=true`, or
- Use real Azure Storage by setting `AzureWebJobsStorage` in `api/local.settings.json` to the same Storage connection string your Function uses in Azure.

## Local development startup

The React client proxies `/api/*` requests to `http://localhost:9091` via `client/package.json`. If nothing is listening on port `9091`, the browser shows `Proxy error ... ECONNREFUSED`.

This repo expects a repo-local virtual environment at `api/.venv`. Azure Functions currently supports Python `3.14` in preview, but on Windows a bare `func host start` can still bypass repo-local dependencies. `3.10`, `3.12`, or `3.13` are the lower-risk choices; if you stay on `3.14`, use `api\\start-local.cmd` or the VS Code tasks.

Use one of these local startup paths on Windows:

- VS Code: run the `start full application` task defined in `.vscode/tasks.json`.
- Manual API start: run `api\\start-local.cmd` from the repository root. The script pins the Python worker to `api\\.venv\\Scripts\\python.exe`, enables `PYTHON_ISOLATE_WORKER_DEPENDENCIES=1`, and binds the local Functions host to port `9091`.
- Manual client start: in a second terminal, run `cd client && npm start`.

The Windows dependency install task now populates both `api\\.venv` and `api\\.python_packages`. That helps Core Tools dependency resolution, but on Python `3.14` preview you should still prefer `api\\start-local.cmd` over a bare `func host start`.

If `api\\.venv` does not exist yet, create it with a supported interpreter first:

- `py -0p` to list installed Python versions
- `cd api`
- `py -3.14 -m venv .venv`
- `.venv\\Scripts\\python.exe -m pip install -r requirements.txt`

If `api\\.venv` already exists but was created with the wrong interpreter or has broken dependencies, delete and recreate it:

- `cd api`
- `rmdir /s /q .venv`
- `py -3.14 -m venv .venv`
- `.venv\\Scripts\\python.exe -m pip install -r requirements.txt`

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)
