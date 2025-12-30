const nconf = require.main.require('nconf');
const winston = require.main.require('winston');
const axios = require('axios');

const Topics = require.main.require('./src/topics');

const PLUGIN_ID = 'nodebb-plugin-flowprompt-bot';

// Read config from NodeBB config.json
const fpConfig = nconf.get('flowprompt') || {};

const SUPPORT_CATEGORY_ID = Number(fpConfig.supportCategoryId);
const WEBHOOK_URL = fpConfig.webhookUrl;
const WEBHOOK_SECRET = fpConfig.webhookSecret;

const Plugin = {};

/**
 * Inject data into composer (SERVER → CLIENT)
 * This is REQUIRED for NodeBB v4
 */
Plugin.extendComposer = async function (data) {
  data.templateData = data.templateData || {};

  data.templateData.flowpromptBot = {
    enabled: true,
    supportCategoryId: SUPPORT_CATEGORY_ID,
  };

  winston.info('[FlowPromptBot] Composer extended');
  return data;
};

/**
 * Topic create hook
 * Captures optional flowId and persists it
 */
Plugin.onTopicCreate = async function (hookData) {
  try {
    winston.info('[FlowPromptBot] onTopicCreate triggered');

    const { topic } = hookData;
    const cid = Number(topic?.cid);

    if (cid !== SUPPORT_CATEGORY_ID) {
      return hookData;
    }

    // Read flowId safely (multiple fallbacks)
    const flowId =
      hookData?.req?.body?.flowId ||
      hookData?.data?.flowId ||
      hookData?.post?.flowId ||
      null;

    winston.info('[FlowPromptBot] flowId received:', flowId);

    // OPTIONAL behavior — only persist if present
    if (flowId) {
      await Topics.setTopicField(topic.tid, 'flowId', flowId);
      winston.info(
        `[FlowPromptBot] Linked topic ${topic.tid} to flow ${flowId}`,
      );
    }

    // Fire webhook (non-blocking)
    if (WEBHOOK_URL && WEBHOOK_SECRET) {
      axios
        .post(WEBHOOK_URL, {
          event: 'topic.create',
          tid: topic.tid,
          cid,
          flowId,
          title: topic.title,
        })
        .catch((err) => {
          winston.error('[FlowPromptBot] Webhook error', err.message);
        });
    }
  } catch (err) {
    winston.error('[FlowPromptBot] onTopicCreate failed', err);
  }

  return hookData;
};

module.exports = Plugin;
