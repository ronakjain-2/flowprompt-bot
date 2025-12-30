const Topics = require.main.require('./src/topics');
const winston = require.main.require('winston');

const SUPPORT_CATEGORY_ID = Number(process.env.SUPPORT_CATEGORY_ID);

const Plugin = {};

/* ---------------------------------------------
 * Expose config to browser
 * ------------------------------------------- */
Plugin.exposeConfig = async function (config) {
  config.flowpromptSupportCategoryId = SUPPORT_CATEGORY_ID;
  return config;
};

/* ---------------------------------------------
 * Plugin init – register APIs
 * ------------------------------------------- */
Plugin.init = async function ({ router, middleware }) {
  // Fetch flows for logged-in user
  router.get(
    '/api/plugins/nodebb-plugin-flowprompt-bot/flows',
    middleware.authenticate,
    async (req, res) => {
      // TODO: Replace with real FlowPrompt API
      res.json({
        success: true,
        data: [
          { id: 'flow-1', name: 'Support Automation' },
          { id: 'flow-2', name: 'Billing Assistant' },
        ],
      });
    },
  );

  // Link flow to topic
  router.post(
    '/api/plugins/nodebb-plugin-flowprompt-bot/link-flow',
    middleware.authenticate,
    async (req, res) => {
      const { tid, flowId } = req.body;

      if (!tid || !flowId) {
        return res.status(400).json({ success: false });
      }

      await Topics.setTopicField(tid, 'flowId', flowId);

      winston.info(`[FlowPromptBot] Linked flow ${flowId} to topic ${tid}`);

      res.json({ success: true });
    },
  );

  winston.info('[FlowPromptBot] Plugin initialized');
};

module.exports = Plugin;
