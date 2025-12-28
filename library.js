const axios = require('axios');
const crypto = require('crypto');
const https = require('https');

const winston = require.main.require('winston');

const FLOWPROMPT_URL = process.env.FLOWPROMPT_WEBHOOK_URL;
const { FLOWPROMPT_SECRET } = process.env;

/**
 * 🔐 HTTPS Agent with proper TLS + SNI
 */
const httpsAgent = new https.Agent({
  keepAlive: true,
  minVersion: 'TLSv1.2',
  servername: 'api.flowprompt.com', // 🔥 THIS FIXES THE ERROR
  rejectUnauthorized: true,
});

/**
 * 🔐 Sign payload
 */
function generateSignature(payload, timestamp) {
  return crypto
    .createHmac('sha256', FLOWPROMPT_SECRET)
    .update(`${timestamp}.${JSON.stringify(payload)}`)
    .digest('hex');
}

/**
 * 🚀 Send event to FlowPrompt
 */
async function sendToFlowPrompt(eventType, payload) {
  if (!FLOWPROMPT_URL || !FLOWPROMPT_SECRET) {
    winston.error('[nodebb-plugin-flowprompt-bot] Missing FlowPrompt env vars');
    return;
  }

  const timestamp = Date.now();
  const signature = generateSignature(payload, timestamp);

  try {
    winston.info(
      `[nodebb-plugin-flowprompt-bot] Sending ${eventType} → ${FLOWPROMPT_URL}`,
    );

    await axios.post(FLOWPROMPT_URL, payload, {
      timeout: 5000,
      httpsAgent, // ✅ FIX APPLIED HERE
      headers: {
        'Content-Type': 'application/json',
        'x-flowprompt-event-type': eventType,
        'x-flowprompt-timestamp': timestamp,
        'x-flowprompt-signature': `sha256=${signature}`,
      },
    });

    winston.info('[nodebb-plugin-flowprompt-bot] Event delivered successfully');
  } catch (err) {
    winston.error('[nodebb-plugin-flowprompt-bot] FlowPrompt API error', {
      message: err.message,
      code: err.code,
    });
  }
}

/**
 * 🎯 Hook: topic.create
 */
async function onTopicCreate(hookData) {
  try {
    const { topic, post } = hookData;

    if (!topic || topic.cid !== 6) {
      return hookData;
    }

    const payload = {
      event: 'topic.create',
      tid: topic.tid,
      pid: post.pid,
      cid: topic.cid,
      uid: topic.uid,
      username: topic.user?.username || 'unknown',
      title: topic.title,
      content: post.content || '',
      timestamp: Date.now(),
      baseUrl: process.env.NODEBB_URL,
    };

    await sendToFlowPrompt('topic.create', payload);
  } catch (err) {
    winston.error('[nodebb-plugin-flowprompt-bot] Hook error', err);
  }

  return hookData;
}

module.exports = {
  onTopicCreate,
};
