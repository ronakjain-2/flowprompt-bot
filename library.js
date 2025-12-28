const nconf = require.main.require('nconf');
const winston = require.main.require('winston');
const axios = require('axios');
const crypto = require('crypto');
const https = require('https');

const Meta = require.main.require('./src/meta');

const PLUGIN_ID = 'nodebb-plugin-flowprompt-bot';

// =========================
// Cached Config
// =========================
let cachedConfig = null;

function getConfig() {
  if (cachedConfig) {
    return cachedConfig;
  }

  const flowpromptConfig = nconf.get('flowprompt') || {};

  return {
    supportCategoryId: parseInt(flowpromptConfig.supportCategoryId || '0', 10),
    webhookUrl: flowpromptConfig.webhookUrl || '',
    webhookSecret: flowpromptConfig.webhookSecret || '',
    botUid: parseInt(flowpromptConfig.botUid || '0', 10),
  };
}

// =========================
// Security
// =========================
function signPayload(payload, timestamp, secret) {
  const body = JSON.stringify(payload);
  const base = `${timestamp}.${body}`;

  return `sha256=${crypto
    .createHmac('sha256', secret)
    .update(base)
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

    // ✅ NORMAL HTTPS AGENT — LET NODE HANDLE SNI
    const httpsAgent = new https.Agent({
      keepAlive: false,
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2',
    });

    await axios.post(config.webhookUrl, payload, {
      headers: {
        'Content-Type': 'application/json',
        'x-flowprompt-event-type': eventType,
        'x-flowprompt-timestamp': timestamp,
        'x-flowprompt-signature': signature,
      },
      timeout: 5000,
      httpsAgent,
      validateStatus: (status) => status < 500, // don’t crash NodeBB
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

  if (!config.supportCategoryId || cid !== config.supportCategoryId) {
    return false;
  }

  if (config.botUid && uid === config.botUid) {
    return false;
  }

  if (isDeleted) {
    return false;
  }

  return true;
}

// =========================
// Plugin Hooks
// =========================
const Plugin = {};

Plugin.init = async function () {
  try {
    winston.info(`[${PLUGIN_ID}] Initializing...`);

    const settings = await Meta.settings.get('flowprompt-bot');
    const fileConfig = nconf.get('flowprompt') || {};

    cachedConfig = {
      supportCategoryId: parseInt(
        settings.supportCategoryId || fileConfig.supportCategoryId || '0',
        10,
      ),
      webhookUrl: settings.webhookUrl || fileConfig.webhookUrl || '',
      webhookSecret: settings.webhookSecret || fileConfig.webhookSecret || '',
      botUid: parseInt(settings.botUid || fileConfig.botUid || '0', 10),
    };

    winston.info(
      `[${PLUGIN_ID}] Loaded config: ${JSON.stringify({
        supportCategoryId: cachedConfig.supportCategoryId,
        webhookUrl: cachedConfig.webhookUrl,
        botUid: cachedConfig.botUid || 'not set',
      })}`,
    );
  } catch (err) {
    winston.error(`[${PLUGIN_ID}] Init failed`, err);
  }
};

Plugin.onTopicCreate = async function (hookData) {
  try {
    const topic = hookData.topic || {};
    const post = hookData.data || hookData.post || {};

    const cid = parseInt(topic.cid || post.cid || '0', 10);
    const uid = parseInt(post.uid || topic.uid || '0', 10);

    if (
      !shouldProcess({
        cid,
        uid,
        isDeleted: !!topic.deleted,
      })
    ) {
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
