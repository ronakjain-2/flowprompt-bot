/* global $, app */

(function () {
  const PLUGIN_ID = 'nodebb-plugin-flowprompt-bot';
  const SUPPORT_CATEGORY_ID = 6;

  let selectedFlowId = null;
  let modalOpened = false;
  let poller = null;

  console.log('[FlowPromptBot] client.js LOADED');

  // Fired when composer opens
  $(window).on('action:composer.loaded', () => {
    console.log('[FlowPromptBot] composer.loaded fired');

    modalOpened = false;
    selectedFlowId = null;

    startCategoryWatcher();
  });

  // After topic creation → link flow
  $(window).on('action:ajaxify.end', async (ev, data) => {
    if (!data?.tid || !selectedFlowId) return;

    console.log('[FlowPromptBot] Linking flow', selectedFlowId);

    await $.ajax({
      method: 'POST',
      url: `/api/plugins/${PLUGIN_ID}/link`,
      data: {
        tid: data.tid,
        flowId: selectedFlowId,
      },
    });

    selectedFlowId = null;
  });

  /**
   * Poll composer category (NodeBB v4 safe)
   */
  function startCategoryWatcher() {
    if (poller) clearInterval(poller);

    poller = setInterval(() => {
      const composer = app?.composer;
      const cid = parseInt(composer?.cid, 10);

      if (!cid || modalOpened) return;

      if (cid === SUPPORT_CATEGORY_ID) {
        console.log('[FlowPromptBot] Support category detected');

        modalOpened = true;
        clearInterval(poller);

        openFlowModal();
      }
    }, 300);
  }

  async function openFlowModal() {
    console.log('[FlowPromptBot] Opening Flow modal');

    let flows = [];

    try {
      console.log('[FlowPromptBot] Fetching flows');

      const res = await $.get(`/api/plugins/${PLUGIN_ID}/flows`);

      flows = res.flows || [];

      console.log('[FlowPromptBot] Flows loaded:', flows.length);
    } catch (err) {
      console.error('[FlowPromptBot] Failed to fetch flows', err);
    }

    let options = '<option value="">Skip (no flow)</option>';

    flows.forEach((flow) => {
      options += `<option value="${flow.id}">${flow.name}</option>`;
    });

    const modal = $(`
        <div class="modal fade" tabindex="-1">
          <div class="modal-dialog">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title">Select Flow (optional)</h5>
              </div>
              <div class="modal-body">
                <select class="form-control js-flow-select">
                  ${options}
                </select>
              </div>
              <div class="modal-footer">
                <button class="btn btn-primary js-continue">Continue</button>
              </div>
            </div>
          </div>
        </div>
      `);

    modal.find('.js-continue').on('click', () => {
      selectedFlowId = modal.find('.js-flow-select').val() || null;
      modal.modal('hide');
    });

    $('body').append(modal);
    modal.modal('show');
  }
})();
