const axios = require('axios');

const topics = require.main.require('./src/topics');
const posts = require.main.require('./src/posts');
const users = require.main.require('./src/user');
const utils = require.main.require('./src/utils');
const nconf = require.main.require('nconf');

const Plugin = {};

// ================= CONFIG =================

const FLOWPROMPT_CONFIG = nconf.get('flowprompt') || {};

const SUPPORT_CATEGORY_ID = Number(FLOWPROMPT_CONFIG.supportCategoryId) || null;
const FLOWPROMPT_API_BASE = FLOWPROMPT_CONFIG.flowpromptAPIBaseUrl;
const BOT_UID = Number(FLOWPROMPT_CONFIG.botUid) || 66;

// ==========================================

Plugin.init = async () => {
  console.log('[FlowPromptBot] Plugin initialized');
  console.log('[FlowPromptBot] Config:', {
    SUPPORT_CATEGORY_ID,
    FLOWPROMPT_API_BASE,
    BOT_UID,
  });
};

/**
 * Extract flowId from topic title
 * Store real flowId internally
 * Mask flowId in visible title
 */
Plugin.onTopicCreate = async ({ topic }) => {
  try {
    if (!topic || !topic.title) return;

    const match = topic.title.match(/(?:flow|flowId)\s*[:=]\s*(\w+)/i);

    if (!match) return;

    const flowId = match[1];

    // Store real flowId internally
    await topics.setTopicField(topic.tid, 'flowId', flowId);

    // Mask flowId in title
    const maskedTitle = topic.title.replace(
      new RegExp(flowId, 'g'),
      '********',
    );

    if (maskedTitle !== topic.title) {
      // Explicitly generate slug (requested)
      const slug = utils.slugify(maskedTitle);

      await topics.updateTopic(topic.tid, {
        title: maskedTitle,
        slug,
      });
    }

    console.log('[FlowPromptBot] flowId stored & title masked', {
      tid: topic.tid,
      flowId: '********',
    });
  } catch (err) {
    console.error('[FlowPromptBot] onTopicCreate error', err);
  }
};

/**
 * Trigger flow ONLY when:
 * - Not main post
 * - Not bot
 * - Not reply-to-reply
 * - Not topic owner
 */
Plugin.onPostSave = async ({ post }) => {
  try {
    if (!post) return;

    // Ignore main topic post
    if (post.isMain) return;

    // Ignore bot replies
    if (post.uid === BOT_UID) return;

    // Ignore replies to replies
    if (post.toPid) {
      console.log('[FlowPromptBot] Ignoring reply-to-reply', {
        pid: post.pid,
        toPid: post.toPid,
      });
      return;
    }

    const flowId = await topics.getTopicField(post.tid, 'flowId');

    if (!flowId) return;

    const topic = await topics.getTopicFields(post.tid, ['uid']);

    if (!topic) return;

    // Ignore topic owner replies
    if (post.uid === topic.uid) {
      console.log('[FlowPromptBot] Ignoring topic-owner reply', {
        tid: post.tid,
        uid: post.uid,
      });
      return;
    }

    console.log('[FlowPromptBot] Valid reply detected → running flow', {
      tid: post.tid,
      flowId: '********',
      replyUid: post.uid,
    });

    const userData = await users.getUserFields(post.uid, [
      'uid',
      'username',
      'email',
    ]);

    await runFlow({
      flowId,
      input: post.content,
      tid: post.tid,
      userEmail: userData?.email,
    });
  } catch (err) {
    console.error('[FlowPromptBot] onPostSave error', err);
  }
};

// ================= HELPERS =================

async function runFlow({ flowId, input, tid, userEmail }) {
  try {
    console.log('[FlowPromptBot] Calling FlowPrompt API', {
      flowId: '********',
      tid,
      userEmail,
    });

    await axios.post(
      `${FLOWPROMPT_API_BASE}/api/forum/run-flow`,
      {
        flowId,
        input,
        tid,
        userEmail,
      },
      { timeout: 15000 },
    );

    console.log('[FlowPromptBot] FlowPrompt API called successfully');
    return true;
  } catch (err) {
    console.error(
      '[FlowPromptBot] Flow API error',
      err.response?.data || err.message,
    );
    return false;
  }
}

module.exports = Plugin;
