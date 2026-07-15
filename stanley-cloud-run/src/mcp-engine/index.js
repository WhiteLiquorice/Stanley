const { McpService } = require('./service'); const { installMcpRoutes } = require('./routes'); const client = require('./client'); module.exports = { McpService, installMcpRoutes, ...client };
