const axios = require('axios');

const routeHelpers = require.main.require('./src/routes/helpers');
const db = require.main.require('./src/database');
const meta = require.main.require('./src/meta');
const winston = require.main.require('./src/logger');

const plugin = {};

plugin.init = async function (params) {
  const { router, middleware } = params;

  winston.info('[FlowPromptBot] Plugin loaded');

  /**
   * GET /api/plugins/nodebb-plugin-flowprompt-bot/flows
   * Returns flows created by the logged-in user
   */
  routeHelpers.setupApiRoute(
    router,
    'get',
    '/flows',
    [middleware.ensureLoggedIn],
    async (req, res) => {
      try {
        const { uid } = req;

        winston.info(`[FlowPromptBot] Fetching flows for uid ${uid}`);

        res.json({
          success: true,
          data: [
            { id: 'flow-1', name: 'Support Automation' },
            { id: 'flow-2', name: 'Billing Assistant' },
          ],
        });

        // 🔁 CALL YOUR EXTERNAL API HERE
        // const response = await axios.get(
        //   `${process.env.FLOWPROMPT_API_URL}/api/internal/flows`,
        //   {
        //     headers: {
        //       Authorization: `Bearer ${process.env.FLOWPROMPT_API_KEY}`,
        //     },
        //     timeout: 5000,
        //   },
        // );

        // res.json({
        //   flows: response.data.flows || [],
        // });
      } catch (err) {
        winston.error('[FlowPromptBot] Failed to fetch flows', err);
        res.status(500).json({ error: 'Failed to fetch flows' });
      }
    },
  );

  /**
   * POST /api/plugins/nodebb-plugin-flowprompt-bot/link
   * Links a flow to a topic
   */
  routeHelpers.setupApiRoute(
    router,
    'post',
    '/link',
    [middleware.ensureLoggedIn],
    async (req, res) => {
      try {
        const { tid, flowId } = req.body;
        const { uid } = req;

        if (!tid || !flowId) {
          return res.status(400).json({ error: 'Missing tid or flowId' });
        }

        winston.info(`[FlowPromptBot] Linking flow ${flowId} to topic ${tid}`);

        await db.setObjectField(`topic:${tid}:flowprompt`, 'flowId', flowId);

        res.json({ success: true });
      } catch (err) {
        winston.error('[FlowPromptBot] Failed to link flow', err);
        res.status(500).json({ error: 'Failed to link flow' });
      }
    },
  );
};

module.exports = plugin;
