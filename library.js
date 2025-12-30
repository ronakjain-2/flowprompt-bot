const topics = require.main.require('./src/topics');
const posts = require.main.require('./src/posts');
const nconf = require.main.require('nconf');

const Plugin = {};

// ✅ Read values from nested config
const FLOWPROMPT_CONFIG = nconf.get('flowprompt') || {};

const SUPPORT_CATEGORY_ID = Number(FLOWPROMPT_CONFIG.supportCategoryId) || null;
const WEBHOOK_URL = FLOWPROMPT_CONFIG.webhookUrl || null;
const WEBHOOK_SECRET = FLOWPROMPT_CONFIG.webhookSecret || null;
const FLOWPROMPT_API_BASE = FLOWPROMPT_CONFIG.flowpromptAPIBaseUrl || null;
const BOT_UID = Number(FLOWPROMPT_CONFIG.botUid) || 66;

Plugin.init = async () => {
  console.log('[FlowPromptBot] Plugin initialized');
  console.log('[FlowPromptBot] Config loaded:', {
    SUPPORT_CATEGORY_ID,
    WEBHOOK_URL: !!WEBHOOK_URL,
    WEBHOOK_SECRET: !!WEBHOOK_SECRET,
    FLOWPROMPT_API_BASE,
    BOT_UID,
  });
};

/**
 * 1️⃣ Extract flowId from topic title and store it
 */
Plugin.onTopicCreate = async (data) => {
  try {
    const { topic } = data;

    if (!topic || !topic.title) return;

    const match = topic.title.match(/(?:flow|flowId)\s*[:=]\s*(\w+)/i);

    if (!match) {
      console.log('[FlowPromptBot] No flowId found in title');
      return;
    }

    const flowId = match[1];

    await topics.setTopicField(topic.tid, 'flowId', flowId);

    console.log('[FlowPromptBot] flowId saved:', flowId);
  } catch (err) {
    console.error('[FlowPromptBot] onTopicCreate error', err);
  }
};

/**
 * 2️⃣ Reply using bot if flowId exists
 */
Plugin.onPostSave = async (data) => {
  try {
    const { post } = data;

    if (!post || post.isMain) return;

    if (post.uid === BOT_UID) return;

    const flowId = await topics.getTopicField(post.tid, 'flowId');

    if (!flowId) return;

    console.log('[FlowPromptBot] Reply detected for flow:', flowId);

    await posts.create({
      tid: post.tid,
      uid: BOT_UID,
      content: `🤖 **FlowPromptSupportBot**\n\nDummy response for flow **${flowId}**.\n\n(FlowPrompt logic will be added later.)`,
    });

    console.log('[FlowPromptBot] Bot reply posted');
  } catch (err) {
    console.error('[FlowPromptBot] onPostSave error', err);
  }
};

module.exports = Plugin;
