const axios = require('axios');
const crypto = require('crypto');

const winston = require.main.require('winston');
const nconf = require.main.require('nconf');

const fpConfig = nconf.get('flowprompt') || {};

const SUPPORT_CATEGORY_ID = Number(fpConfig.supportCategoryId);
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

    const topicCid = Number(topic?.cid);
    const expectedCid = Number(SUPPORT_CATEGORY_ID);

    winston.info(`[FlowPromptBot] Topic CID normalized: ${topicCid}`);
    winston.info(
      `[FlowPromptBot] Expected SUPPORT_CATEGORY_ID: ${expectedCid}`,
    );

    if (!topic || Number.isNaN(topicCid)) {
      winston.warn('[FlowPromptBot] Invalid topic or cid');
      return hookData;
    }

    if (topicCid !== expectedCid) {
      winston.warn(
        `[FlowPromptBot] Category mismatch. Got ${topicCid}, expected ${expectedCid}`,
      );
      return hookData;
    }

    winston.info('[FlowPromptBot] Category matched ✅');

    const payload = {
      event: 'topic.create',
      tid: topic.tid,
      pid: post?.pid,
      cid: topicCid,
      uid: topic.uid,
      username: topic.user?.username || 'unknown',
      title: topic.title,
      content: post?.content || '',
      timestamp: Date.now(),
    };

    winston.info('[FlowPromptBot] Sending webhook');

    await sendToFlowPrompt('topic.create', payload);

    winston.info('[FlowPromptBot] Webhook flow completed');
  } catch (err) {
    winston.error('[FlowPromptBot] onTopicCreate error', err);
  }

  return hookData;
};

module.exports = Plugin;
