const axios = require('axios');

const topics = require.main.require('./src/topics');
const users = require.main.require('./src/user');
const nconf = require.main.require('nconf');

const Plugin = {};

// ================= CONFIG =================

const FLOWPROMPT_CONFIG = nconf.get('flowprompt') || {};

const SUPPORT_CATEGORY_ID = Number(FLOWPROMPT_CONFIG.supportCategoryId) || null;
const FLOWPROMPT_API_BASE = FLOWPROMPT_CONFIG.flowpromptAPIBaseUrl;
const BOT_UID = Number(FLOWPROMPT_CONFIG.botUid) || 66;

// ==========================================

Plugin.init = async () => {
  console.log('[FlowPromptBot] Plugin initialized, Config:', {
    SUPPORT_CATEGORY_ID,
    FLOWPROMPT_API_BASE,
    BOT_UID,
  });
};

/**
 * Mask flowId ONLY in topic title (UI safety)
 */
function maskFlowIdInTitle(title, flowId) {
  if (!title || !flowId) return title;

  return title.replace(new RegExp(flowId, 'g'), '********');
}

/**
 * Extract flowId from topic title, store internally,
 * but mask it in the visible topic title
 *
 * Example input:
 *   "Run billing flow flowId=fp_12345"
 *
 * Stored:
 *   flowId = fp_12345
 *
 * Visible title:
 *   "Run billing flow ********"
 */
Plugin.onTopicCreate = async ({ topic }) => {
  try {
    if (!topic || !topic.title) return;

    const match = topic.title.match(/(?:flow|flowId)\s*[:=]\s*(\w+)/i);

    if (!match) return;

    const flowId = match[1];

    // Store real flowId internally
    await topics.setTopicField(topic.tid, 'flowId', flowId);

    // (future use) invited users list
    await topics.setTopicField(topic.tid, 'allowedUids', JSON.stringify([]));

    // Mask flowId in title for UI
    const maskedTitle = maskFlowIdInTitle(topic.title, flowId);

    if (maskedTitle !== topic.title) {
      await topics.setTopicField(topic.tid, 'title', maskedTitle);
      await topics.setTopicField(
        topic.tid,
        'slug',
        topics.slugify(maskedTitle),
      );
    }

    console.log(
      `[FlowPromptBot] flowId stored & title masked flowId: ${flowId}`,
      {
        tid: topic.tid,
        maskedTitle,
      },
    );
  } catch (err) {
    console.error('[FlowPromptBot] onTopicCreate error', err);
  }
};

/**
 * Trigger flow ONLY when:
 * - Reply is to the topic (not to another reply)
 * - Reply author is NOT topic creator
 * - Reply author is NOT bot
 */
Plugin.onPostSave = async ({ post }) => {
  try {
    if (!post) return;

    // Ignore main topic post
    if (post.isMain) return;

    // Ignore bot replies
    if (post.uid === BOT_UID) return;

    // Ignore replies to replies (nested replies)
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

    // Ignore replies from topic creator
    if (post.uid === topic.uid) {
      console.log('[FlowPromptBot] Ignoring topic-owner reply', {
        tid: post.tid,
        uid: post.uid,
      });
      return;
    }

    console.log('[FlowPromptBot] Valid reply detected → running flow', {
      tid: post.tid,
      flowId,
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
      flowId,
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
