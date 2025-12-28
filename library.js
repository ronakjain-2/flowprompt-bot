const nconf = require.main.require('nconf');
const winston = require.main.require('winston');
const axios = require('axios');
const crypto = require('crypto');
const https = require('https');

const Meta = require.main.require('./src/meta');

const PLUGIN_ID = 'nodebb-plugin-flowprompt-bot';

// Cache config after init
let cachedConfig = null;

// Lazy config getters - access config when needed
function getConfig() {
  // If cached from init (preferred), use that
  if (cachedConfig) {
    return cachedConfig;
  }

  // Fallback: read from NodeBB config.json → "flowprompt" block
  const flowpromptConfig = nconf.get('flowprompt') || {};

  return {
    supportCategoryId: parseInt(flowpromptConfig.supportCategoryId || '0', 10),
    webhookUrl: flowpromptConfig.webhookUrl || '',
    webhookSecret: flowpromptConfig.webhookSecret || '',
    botUid: parseInt(flowpromptConfig.botUid || '0', 10),
  };
}

function signPayload(payload, timestamp, secret) {
  const body = JSON.stringify(payload);
  const base = `${timestamp}.${body}`;
  const hmac = crypto
    .createHmac('sha256', secret || '')
    .update(base)
    .digest('hex');

  return `sha256=${hmac}`;
}

async function sendToFlowPrompt(eventType, payload) {
  const config = getConfig();

  winston.warn(
    `[${PLUGIN_ID}] Sending to FlowPrompt: ${eventType} with payload: ${JSON.stringify(payload)}`,
  );

  if (!config.webhookUrl || !config.webhookSecret) {
    winston.warn(`[${PLUGIN_ID}] Webhook not configured. Skipping event.`);
    return;
  }

  try {
    const timestamp = Date.now().toString();
    const signature = signPayload(payload, timestamp, config.webhookSecret);

    // Parse URL to get hostname for SNI
    const webhookUrl = new URL(config.webhookUrl);
    const { hostname } = webhookUrl;

    // Create HTTPS agent with proper SNI configuration
    const httpsAgent = new https.Agent({
      servername: hostname,
      rejectUnauthorized: true,
    });

    await axios.post(config.webhookUrl, payload, {
      headers: {
        'Content-Type': 'application/json',
        'x-flowprompt-signature': signature,
        'x-flowprompt-timestamp': timestamp,
        'x-flowprompt-event-type': eventType,
      },
      timeout: 5000,
      httpsAgent,
    });

    winston.info(
      `[${PLUGIN_ID}] Sent event ${eventType} for tid=${payload.tid}, pid=${payload.pid || 'topic'}`,
    );
  } catch (err) {
    winston.error(
      `[${PLUGIN_ID}] Failed to send event ${eventType}: ${err.message}`,
      err,
    );
  }
}

/**
 * Common guard checks:
 * - Only support category
 * - Skip bot user
 * - Skip edits/deleted
 */
function shouldProcess({ cid, uid, isDeleted }) {
  const config = getConfig();

  if (!config.supportCategoryId || cid !== config.supportCategoryId) {
    return false;
  }

  // Skip posts authored by the bot
  if (config.botUid && uid === config.botUid) {
    return false;
  }

  if (isDeleted) {
    return false;
  }

  // For topic.create we only care about main post (handled by hook)
  // For post.save we can process replies (non-main posts)
  return true;
}

const Plugin = {};

/**
 * Hook: static:app.load
 * Initialize plugin and load settings
 */
Plugin.init = async function () {
  try {
    winston.info(`[${PLUGIN_ID}] Initializing plugin...`);

    // 1) Load plugin settings from ACP (if any)
    const settings = await Meta.settings.get('flowprompt-bot');

    // 2) Load static config from NodeBB config.json ("flowprompt" block)
    const fileConfig = nconf.get('flowprompt') || {};

    // Merge: ACP settings override config.json
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
      `[${PLUGIN_ID}] Plugin initialized with config: ${JSON.stringify({
        supportCategoryId: cachedConfig.supportCategoryId,
        webhookUrl: cachedConfig.webhookUrl,
        webhookSecret: cachedConfig.webhookSecret,
        botUid: cachedConfig.botUid || 'not set',
      })}`,
    );

    if (!cachedConfig.webhookUrl || !cachedConfig.webhookSecret) {
      winston.warn(
        `[${PLUGIN_ID}] Webhook URL or Secret not configured. Plugin will not send events.`,
      );
    }
  } catch (err) {
    winston.error(`[${PLUGIN_ID}] Init error: ${err.message}`, err);
  }
};

/**
 * Hook: filter:topic.create
 * Called when a new topic is created via NodeBB UI.
 *
 * data: {
 *   topic: { tid, cid, uid, title, mainPid, ... },
 *   post: { pid, content, uid, ... }
 * }
 */
Plugin.onTopicCreate = async function (hookData) {
  try {
    // NodeBB hook structure: hookData.data (post data) and hookData.topic (topic data)
    const topic = hookData.topic || {};
    const postData = hookData.data || hookData.post || {};

    const cid = parseInt(topic.cid || postData.cid || '0', 10);
    const uid = parseInt(postData.uid || topic.uid || '0', 10);

    winston.info(`[${PLUGIN_ID}] onTopicCreate hook called`, {
      tid: topic.tid,
      cid,
      uid,
      title: topic.title || postData.title,
    });

    if (
      !shouldProcess({
        cid,
        uid,
        isMain: true,
        isDeleted: !!topic.deleted,
      })
    ) {
      winston.info(`[${PLUGIN_ID}] Topic filtered out by shouldProcess`, {
        tid: topic.tid,
        cid,
        uid,
      });
      return hookData;
    }

    const payload = {
      event: 'topic.create',
      tid: topic.tid,
      pid: postData.pid || topic.mainPid || 0,
      cid,
      uid,
      username:
        postData.handle ||
        postData.username ||
        topic.user?.username ||
        'unknown',
      title: topic.title || postData.title,
      content: postData.content || '',
      timestamp: Date.now(),
      baseUrl: nconf.get('url'),
    };

    // Log when a new support topic is being sent to FlowPrompt backend
    winston.info(`[${PLUGIN_ID}] Preparing to send topic.create webhook`, {
      tid: payload.tid,
      pid: payload.pid,
      cid: payload.cid,
      uid: payload.uid,
      username: payload.username,
      title: payload.title,
    });

    await sendToFlowPrompt('topic.create', payload);

    return hookData;
  } catch (err) {
    winston.error(`[${PLUGIN_ID}] onTopicCreate error: ${err.message}`, err);
    return hookData; // Do not block NodeBB
  }
};

/**
 * Hook: filter:post.save
 * Called when a post is created or edited.
 *
 * data: {
 *   post: { pid, tid, uid, content, isMain, deleted, ... }
 * }
 */
Plugin.onPostSave = async function (hookData) {
  try {
    const post = hookData.post || {};
    const { tid, pid, uid, content, isMain, deleted } = post;

    const cid = post.cid || post.category?.cid || hookData.topic?.cid;

    if (
      !shouldProcess({
        cid,
        uid,
        isMain,
        isDeleted: !!deleted,
      })
    ) {
      return hookData;
    }

    // Ignore edits: NodeBB includes an 'isNew' flag in some versions;
    // if not available, you can infer from existing data. Here we assume
    // filter:post.save is for new posts only; adjust if needed.
    if (post.edited || post.editor || post.isEdited) {
      return hookData;
    }

    const payload = {
      event: 'post.save',
      tid,
      pid,
      cid,
      uid,
      username: post.username || post.user?.username,
      content,
      isMain,
      timestamp: Date.now(),
      baseUrl: nconf.get('url'),
    };

    await sendToFlowPrompt('post.save', payload);

    return hookData;
  } catch (err) {
    winston.error(`[${PLUGIN_ID}] onPostSave error: ${err.message}`, err);
    return hookData;
  }
};

module.exports = Plugin;
