const winston = require.main.require('winston');

const SUPPORT_CATEGORY_ID = Number(process.env.SUPPORT_CATEGORY_ID);

const Plugin = {};

/* -----------------------------------------
 * Expose config to browser
 * --------------------------------------- */
Plugin.exposeConfig = async function (config) {
  config.flowpromptSupportCategoryId = SUPPORT_CATEGORY_ID;
  return config;
};

/* -----------------------------------------
 * ADD COMPOSER CONTROL (THIS IS THE KEY)
 * --------------------------------------- */
Plugin.addComposerControl = async function (controls) {
  controls.push({
    name: 'flowprompt-flow',
    label: 'Flow (optional)',
    className: 'flowprompt-flow-control',
    type: 'select',
    options: [], // populated client-side
  });

  winston.info('[FlowPromptBot] Composer control registered');
  return controls;
};

/* -----------------------------------------
 * Topic create hook
 * --------------------------------------- */
Plugin.onTopicCreate = async function (hookData) {
  const flowId =
    hookData.req?.body?.flowpromptFlow || hookData.data?.flowpromptFlow || null;

  if (flowId) {
    winston.info('[FlowPromptBot] Topic created with flow:', flowId);
  }

  return hookData;
};

module.exports = Plugin;
