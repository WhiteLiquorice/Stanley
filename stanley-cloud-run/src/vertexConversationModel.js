const { callConnectorModel } = require('./vertexConnectorModel');

async function callConversationModel(request) {
  return callConnectorModel(request);
}

module.exports = { callConversationModel };
