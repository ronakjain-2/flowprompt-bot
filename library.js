const winston = require.main.require('winston');
const Topics = require.main.require('./src/topics');

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
 * API: fetch user flows
 * ------------------------------------------- */
Plugin.init = async function ({ router, middleware }) {
  router.get(
    '/api/plugins/nodebb-plugin-flowprompt-bot/flows',
    middleware.authenticate,
    async (req, res) => {
      // 🔁 Replace with real FlowPrompt API
      const flows = [
        { id: 'flow-1', name: 'Support Automation' },
        { id: 'flow-2', name: 'Billing Assistant' },
      ];

      res.json({ success: true, data: flows });
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
      winston.info('[FlowPromptBot] Flow linked to topic', tid, flowId);

      res.json({ success: true });
    },
  );

  winston.info('[FlowPromptBot] Plugin initialized');
};

/* ---------------------------------------------
 * Topic create hook (just detect support topic)
 * ------------------------------------------- */
Plugin.onTopicCreate = async function (hookData) {
  const cid = Number(hookData.topic.cid);

  if (cid !== SUPPORT_CATEGORY_ID) return hookData;

  // Pass tid to client via socket event
  process.nextTick(() => {
    const sockets = require.main.require('./src/socket.io');

    sockets.server.emit('flowprompt:topicCreated', {
      tid: hookData.topic.tid,
      cid,
    });
  });

  return hookData;
};

module.exports = Plugin;
