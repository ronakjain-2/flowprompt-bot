const axios = require('axios');

const topics = require.main.require('./src/topics');
const posts = require.main.require('./src/posts');
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
  console.log('[FlowPromptBot] Plugin initialized');
  console.log('[FlowPromptBot] Config:', {
    SUPPORT_CATEGORY_ID,
    FLOWPROMPT_API_BASE,
    BOT_UID,
  });
};

/**
 * Extract flowId from topic title and store it
 * Example: "Issue with webhook flow:fp_12345"
 */
Plugin.onTopicCreate = async ({ topic }) => {
  try {
    if (!topic || !topic.title) return;

    const match = topic.title.match(/(?:flow|flowId)\s*[:=]\s*(\w+)/i);

    if (!match) return;

    const flowId = match[1];

    await topics.setTopicField(topic.tid, 'flowId', flowId);

    console.log('[FlowPromptBot] flowId stored:', flowId);
  } catch (err) {
    console.error('[FlowPromptBot] onTopicCreate error', err);
  }
};

/**
 * On reply → run flow → bot replies
 */
Plugin.onPostSave = async ({ post }) => {
  try {
    if (!post || post.isMain) return;

    if (post.uid === BOT_UID) return;

    const flowId = await topics.getTopicField(post.tid, 'flowId');

    if (!flowId) return;

    console.log('[FlowPromptBot] Reply detected for flow:', flowId);

    // Get user token (example: uid-based or custom field)
    const userData = await users.getUserFields(post.uid, [
      'uid',
      'username',
      'email',
    ]);

    await posts.create({
      tid: post.tid,
      uid: BOT_UID,
      content: '🤖 **FlowPromptSupportBot** is running the flow...',
    });

    // Call FlowPrompt API which will execute flow and post reply to NodeBB
    const apiResponse = await runFlow({
      flowId,
      input: post.content,
      tid: post.tid,
      userEmail: userData?.email,
    });

    // Backend service already posts the reply via NodeBB API, so we don't need to post again
    // The API response contains the output for logging/verification
    if (apiResponse) {
      console.log('[FlowPromptBot] Flow executed successfully', {
        tid: post.tid,
        outputLength: apiResponse.length,
      });
    } else {
      console.log(
        '[FlowPromptBot] Flow execution completed but no output returned',
      );
    }
  } catch (err) {
    console.error('[FlowPromptBot] onPostSave error', err);
  }
};

// ================= HELPERS =================

async function runFlow({ flowId, input, tid, userEmail }) {
  try {
    console.log('[FlowPromptBot] Calling FlowPrompt API', flowId);

    const res = await axios.post(
      `${FLOWPROMPT_API_BASE}/api/forum/run-flow`,
      {
        flowId,
        input,
        tid,
        userEmail,
      },
      {
        timeout: 15000,
      },
    );

    console.log('[FlowPromptBot] FlowPrompt API response', res);

    if (res.data && res.data.output) {
      return `🤖 **FlowPromptSupportBot**\n\n${res.data.output}`;
    }

    return null;
  } catch (err) {
    console.error(
      '[FlowPromptBot] Flow API error',
      err.response?.data || err.message,
    );
    return '❌ Failed to run the flow. Please try again later.';
  }
}

module.exports = Plugin;
