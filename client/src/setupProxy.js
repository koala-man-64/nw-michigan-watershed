const { createProxyMiddleware } = require("http-proxy-middleware");

const LOCAL_API_TARGET = "http://localhost:9091";

module.exports = function setupProxy(app) {
  app.use(
    "/api",
    createProxyMiddleware({
      target: LOCAL_API_TARGET,
      changeOrigin: false,
      secure: false,
    })
  );
};
