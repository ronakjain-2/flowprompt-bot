const axios = require('axios');
const crypto = require('crypto');

const winston = require.main.require('winston');
const nconf = require.main.require('nconf');

const fpConfig = nconf.get('flowprompt') || {};

const SUPPORT_CATEGORY_ID = parseInt(fpConfig.supportCategoryId || '0', 10);
const WEBHOOK_URL = fpConfig.webhookUrl;
const WEBHOOK_SECRET = fpConfig.webhookSecret;

winston.info('[FlowPromptBot] Plugin loaded');

if (!WEBHOOK_URL || !WEBHOOK_SECRET) {
  winston.warn('[FlowPromptBot] Webhook config missing');
}

// =========================
// Helpers
// =========================
function signPayload(payload, timestamp) {
  return `sha256=${crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(`${timestamp}.${JSON.stringify(payload)}`)
    .digest('hex')}`;
}

async function sendToFlowPrompt(eventType, payload) {
  if (!WEBHOOK_URL || !WEBHOOK_SECRET) {
    winston.warn('[FlowPromptBot] Webhook not configured, skipping');
    return;
  }

  const timestamp = Date.now().toString();
  const signature = signPayload(payload, timestamp);

  winston.info(`[FlowPromptBot] Sending ${eventType} to FlowPrompt`);

  try {
    await axios.post(WEBHOOK_URL, payload, {
      headers: {
        'Content-Type': 'application/json',
        'x-flowprompt-event': eventType,
        'x-flowprompt-timestamp': timestamp,
        'x-flowprompt-signature': signature,
      },
      timeout: 5000,
    });

    winston.info('[FlowPromptBot] Webhook delivered successfully');
  } catch (err) {
    winston.error('[FlowPromptBot] Webhook failed', {
      message: err.message,
      code: err.code,
    });
  }
}

// =========================
// Plugin Hooks
// =========================
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

    const payload = {
      event: 'topic.create',
      tid: topic.tid,
      pid: post?.pid,
      cid: topic.cid,
      uid: topic.uid,
      username: topic.user?.username || 'unknown',
      title: topic.title,
      content: post?.content || '',
      timestamp: Date.now(),
      baseUrl: nconf.get('url'),
    };

    await sendToFlowPrompt('topic.create', payload);
  } catch (err) {
    winston.error('[FlowPromptBot] onTopicCreate error', err);
  }

  return hookData;
};

module.exports = Plugin;
