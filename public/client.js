/* global $, app, ajaxify */

(function () {
  const PLUGIN_ID = 'nodebb-plugin-flowprompt-bot';
  const SUPPORT_CATEGORY_ID = 6;

  let selectedFlowId = null;

  console.log('[FlowPromptBot] client.js LOADED');

  $(window).on('action:composer.loaded', () => {
    console.log('[FlowPromptBot] composer.loaded fired');
  });

  $(window).on('action:composer.categorySelected', (ev, data) => {
    if (parseInt(data.cid, 10) !== SUPPORT_CATEGORY_ID) return;

    openFlowModal();
  });

  $(window).on('action:composer.submit', () => {
    console.log('[FlowPromptBot] composer.submit detected');
  });

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

  async function openFlowModal() {
    console.log('[FlowPromptBot] Opening Flow modal');

    let flows = [];

    try {
      console.log('[FlowPromptBot] Fetching flows');
      const res = await $.get(`/api/plugins/${PLUGIN_ID}/flows`);

      flows = res.flows || [];
    } catch (err) {
      console.error('[FlowPromptBot] Modal error', err);
    }

    let options = '<option value="">Skip (no flow)</option>';

    flows.forEach((f) => {
      options += `<option value="${f.id}">${f.name}</option>`;
    });

    const modal = $(`
        <div class="modal fade">
          <div class="modal-dialog">
            <div class="modal-content">
              <div class="modal-header">
                <h5>Select Flow (optional)</h5>
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
