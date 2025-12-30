const meta = require.main.require('./src/meta');

const Plugin = {};

Plugin.init = async () => {
  console.log('[FlowPromptBot] Plugin initialized');
};

/**
 * Hook: fires AFTER topic is created
 */
Plugin.onTopicCreate = async (data) => {
  try {
    const { topic } = data;

    if (!topic || !topic.title) return;

    console.log('[FlowPromptBot] Topic created:', topic.tid);
    console.log('[FlowPromptBot] Topic title:', topic.title);

    // Extract flowId from title
    const match = topic.title.match(/(?:flow|flowId)\s*[:=]\s*(\w+)/i);

    if (!match) {
      console.log('[FlowPromptBot] No flowId found in title');
      return;
    }

    const flowId = match[1];

    console.log('[FlowPromptBot] ✅ flowId extracted:', flowId);

    /**
     * 🔜 Future:
     * - Store mapping tid -> flowId
     * - Call FlowPrompt API
     * - Auto reply
     */
  } catch (err) {
    console.error('[FlowPromptBot] onTopicCreate error', err);
  }
};

module.exports = Plugin;
