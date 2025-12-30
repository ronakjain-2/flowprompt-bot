const Topics = require.main.require('./src/topics');

const SUPPORT_CATEGORY_ID = Number(process.env.SUPPORT_CATEGORY_ID);

const Plugin = {};

Plugin.exposeConfig = async function (config) {
  config.flowpromptSupportCategoryId = SUPPORT_CATEGORY_ID;
  return config;
};

Plugin.init = async function ({ router, middleware }) {
  router.get(
    '/api/plugins/nodebb-plugin-flowprompt-bot/flows',
    middleware.authenticate,
    async (req, res) => {
      // 🔁 Replace with real FlowPrompt API
      res.json({
        success: true,
        data: [
          { id: 'flow-1', name: 'Support Automation' },
          { id: 'flow-2', name: 'Billing Assistant' },
        ],
      });
    },
  );

  router.post(
    '/api/plugins/nodebb-plugin-flowprompt-bot/link-flow',
    middleware.authenticate,
    async (req, res) => {
      const { tid, flowId } = req.body;

      if (!tid || !flowId) {
        return res.json({ success: false });
      }

      await Topics.setTopicField(tid, 'flowId', flowId);
      res.json({ success: true });
    },
  );
};

module.exports = Plugin;
