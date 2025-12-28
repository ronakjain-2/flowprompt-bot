const nconf = require.main.require('nconf');
const winston = require.main.require('winston');
const axios = require('axios');
const crypto = require('crypto');

const PLUGIN_ID = 'nodebb-plugin-flowprompt-bot';

// =========================
// Config (via config.json)
// =========================
function getConfig() {
  const cfg = nconf.get('flowprompt') || {};

  return {
    supportCategoryId: parseInt(cfg.supportCategoryId || '0', 10),
    webhookUrl: cfg.webhookUrl || '',
    webhookSecret: cfg.webhookSecret || '',
    botUid: parseInt(cfg.botUid || '0', 10),
  };
}

// =========================
// Security
// =========================
function signPayload(payload, timestamp, secret) {
  const body = JSON.stringify(payload);

  return `sha256=${crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex')}`;
}

// =========================
// Webhook Sender (FIXED)
// =========================
async function sendToFlowPrompt(eventType, payload) {
  const config = getConfig();

  if (!config.webhookUrl || !config.webhookSecret) {
    winston.warn(`[${PLUGIN_ID}] Webhook not configured. Skipping.`);
    return;
  }

  try {
    const timestamp = Date.now().toString();
    const signature = signPayload(payload, timestamp, config.webhookSecret);

    winston.info(`[${PLUGIN_ID}] Sending ${eventType} → ${config.webhookUrl}`);

    // ✅ DO NOT pass httpsAgent
    await axios.post(config.webhookUrl, payload, {
      headers: {
        'Content-Type': 'application/json',
        'x-flowprompt-event-type': eventType,
        'x-flowprompt-timestamp': timestamp,
        'x-flowprompt-signature': signature,
      },
      timeout: 5000,
      validateStatus: (status) => status < 500, // don't crash NodeBB
    });

    winston.info(`[${PLUGIN_ID}] Webhook sent successfully`);
  } catch (err) {
    winston.error(`[${PLUGIN_ID}] Webhook failed: ${err.message}`, err);
  }
}

// =========================
// Guards
// =========================
function shouldProcess({ cid, uid, isDeleted }) {
  const config = getConfig();

  if (cid !== config.supportCategoryId) return false;

  if (config.botUid && uid === config.botUid) return false;

  if (isDeleted) return false;

  return true;
}

// =========================
// Plugin Hooks
// =========================
const Plugin = {};

Plugin.onTopicCreate = async function (hookData) {
  try {
    const topic = hookData.topic || {};
    const post = hookData.post || {};

    const cid = parseInt(topic.cid || '0', 10);
    const uid = parseInt(post.uid || topic.uid || '0', 10);

    if (!shouldProcess({ cid, uid, isDeleted: !!topic.deleted })) {
      return hookData;
    }

    const payload = {
      event: 'topic.create',
      tid: topic.tid,
      pid: post.pid || topic.mainPid || 0,
      cid,
      uid,
      username: post.username || topic.user?.username || 'unknown',
      title: topic.title || '',
      content: post.content || '',
      timestamp: Date.now(),
      baseUrl: nconf.get('url'),
    };

    await sendToFlowPrompt('topic.create', payload);
    return hookData;
  } catch (err) {
    winston.error(`[${PLUGIN_ID}] onTopicCreate error`, err);
    return hookData;
  }
};

module.exports = Plugin;
