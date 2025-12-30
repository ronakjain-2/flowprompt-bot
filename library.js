const winston = require.main.require('winston');
const axios = require('axios');

const PLUGIN_ID = 'nodebb-plugin-flowprompt-bot';

const { FLOWPROMPT_API_URL } = process.env;
const { FLOWPROMPT_API_KEY } = process.env;

const Plugin = {};

Plugin.init = async ({ router, middleware }) => {
  winston.info(
    '[FlowPromptBot] Plugin loaded',
    FLOWPROMPT_API_URL,
    FLOWPROMPT_API_KEY,
  );

  /**
   * GET flows for logged-in user
   * URL: /api/plugins/nodebb-plugin-flowprompt-bot/flows
   */
  router.get(
    `/api/plugins/${PLUGIN_ID}/flows`,
    middleware.ensureLoggedIn,
    async (req, res) => {
      try {
        winston.info('[FlowPromptBot] /flows API called');

        res.json({
          success: true,
          data: [
            { id: 'flow-1', name: 'Support Automation' },
            { id: 'flow-2', name: 'Billing Assistant' },
          ],
        });
        // const response = await axios.get(`${FLOWPROMPT_API_URL}/flows`, {
        //   headers: {
        //     Authorization: `Bearer ${FLOWPROMPT_API_KEY}`,
        //     'x-user-id': req.user.uid,
        //   },
        //   timeout: 5000,
        // });

        // res.json({
        //   success: true,
        //   flows: response.data || [],
        // });
      } catch (err) {
        winston.error('[FlowPromptBot] Failed to fetch flows', err.message);
        res.status(500).json({
          success: false,
          message: 'Failed to fetch flows',
        });
      }
    },
  );

  /**
   * POST link flow to topic
   */
  router.post(
    `/api/plugins/${PLUGIN_ID}/link`,
    middleware.ensureLoggedIn,
    async (req, res) => {
      const { tid, flowId } = req.body;

      if (!flowId) {
        return res.json({ success: true });
      }

      try {
        await axios.post(
          `${FLOWPROMPT_API_URL}/link-topic`,
          { tid, flowId },
          {
            headers: {
              Authorization: `Bearer ${FLOWPROMPT_API_KEY}`,
            },
          },
        );

        res.json({ success: true });
      } catch (err) {
        winston.error('[FlowPromptBot] Failed to link flow', err.message);
        res.status(500).json({ success: false });
      }
    },
  );
};

module.exports = Plugin;
