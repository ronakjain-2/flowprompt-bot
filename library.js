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
 * Inject HTML into composer template
 * ------------------------------------------- */
Plugin.injectComposerUI = async function (data) {
  data.templateData.flowpromptFlowSelector = `
    <div class="form-group flowprompt-flow-wrapper d-none">
      <label>Flow (optional)</label>
      <select class="form-control" id="flowprompt-flow-select">
        <option value="">No Flow</option>
      </select>
    </div>
  `;
  return data;
};

/* ---------------------------------------------
 * Topic create hook
 * ------------------------------------------- */
Plugin.onTopicCreate = async function (hookData) {
  const flowId = hookData.req?.body?.flowId || hookData.data?.flowId || null;

  if (flowId) {
    winston.info('[FlowPromptBot] Flow selected:', flowId);
  }

  return hookData;
};

module.exports = Plugin;
