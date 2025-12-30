const axios = require('axios');

const nconf = require.main.require('nconf');
const winston = require.main.require('winston');
const crypto = require('crypto');

const PLUGIN_ID = 'nodebb-plugin-flowprompt-bot';

const SUPPORT_CATEGORY_ID = Number(process.env.SUPPORT_CATEGORY_ID);
const { FLOWPROMPT_WEBHOOK_URL } = process.env;
const { FLOWPROMPT_WEBHOOK_SECRET } = process.env;

const Plugin = {};

/* --------------------------------------------------
 * Expose config to client
 * -------------------------------------------------- */
Plugin.filterConfigGet = async function (config) {
  config.flowpromptSupportCategoryId = SUPPORT_CATEGORY_ID;
  return config;
};

Plugin.filterComposerBuild = async function (data) {
  data.templateData.flowpromptSupportCategoryId = SUPPORT_CATEGORY_ID;
  return data;
};

/* --------------------------------------------------
 * API: fetch flows for logged-in user
 * -------------------------------------------------- */
Plugin.init = async function (params) {
  const { router, middleware } = params;

  router.get(
    '/api/plugins/nodebb-plugin-flowprompt-bot/flows',
    middleware.authenticate,
    async (req, res) => {
      try {
        // 🔁 Replace this with real API call
        const flows = [
          { id: 'flow-1', name: 'Support Automation' },
          { id: 'flow-2', name: 'Billing Assistant' },
        ];

        res.json({ success: true, data: flows });
      } catch (err) {
        winston.error('[FlowPromptBot] Flow API error', err);
        res.status(500).json({ success: false });
      }
    },
  );

  winston.info('[FlowPromptBot] Plugin loaded');
};

/* --------------------------------------------------
 * Webhook signing
 * -------------------------------------------------- */
function signPayload(payload, timestamp) {
  const base = `${timestamp}.${JSON.stringify(payload)}`;

  return `sha256=${crypto
    .createHmac('sha256', FLOWPROMPT_WEBHOOK_SECRET)
    .update(base)
    .digest('hex')}`;
}

/* --------------------------------------------------
 * Topic create hook
 * -------------------------------------------------- */
Plugin.onTopicCreate = async function (hookData) {
  try {
    const { topic } = hookData;
    const { post } = hookData;

    const cid = Number(topic.cid);

    if (cid !== SUPPORT_CATEGORY_ID) return hookData;

    const payload = {
      event: 'topic.create',
      tid: topic.tid,
      cid,
      uid: topic.uid,
      title: topic.title,
      content: post.content,
      flowId: hookData.data?.flowId || null,
      baseUrl: nconf.get('url'),
      timestamp: Date.now(),
    };

    const timestamp = Date.now().toString();

    await axios.post(FLOWPROMPT_WEBHOOK_URL, payload, {
      headers: {
        'Content-Type': 'application/json',
        'x-flowprompt-timestamp': timestamp,
        'x-flowprompt-signature': signPayload(payload, timestamp),
      },
      timeout: 5000,
    });

    winston.info('[FlowPromptBot] Webhook sent');
    return hookData;
  } catch (err) {
    winston.error('[FlowPromptBot] Webhook failed', err);
    return hookData;
  }
};

module.exports = Plugin;
