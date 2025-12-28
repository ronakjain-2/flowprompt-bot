const winston = require.main.require('winston');

console.log('[FlowPromptBot] Plugin loaded');

const SUPPORT_CATEGORY_ID = 6;

const Plugin = {};

/**
 * filter:topic.create
 */
Plugin.onTopicCreate = async function (hookData) {
  winston.info('[FlowPromptBot] onTopicCreate triggered');

  try {
    const { topic, post } = hookData;

    if (!topic || topic.cid !== SUPPORT_CATEGORY_ID) {
      return hookData;
    }

    winston.info(
      `[FlowPromptBot] New topic in support category: tid=${topic.tid}`,
    );
  } catch (err) {
    winston.error('[FlowPromptBot] Error in onTopicCreate', err);
  }

  return hookData;
};

module.exports = Plugin;
