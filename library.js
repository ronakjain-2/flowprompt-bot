const winston = require.main.require('winston');

const Plugin = {};

Plugin.init = async function () {
  winston.info('[FlowPromptBot] SERVER plugin initialized');
};

module.exports = Plugin;
