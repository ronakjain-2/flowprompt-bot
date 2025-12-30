(function () {
  const API_URL = '/api/plugins/nodebb-plugin-flowprompt-bot/flows';

  async function loadFlows() {
    const res = await fetch(API_URL, { credentials: 'include' });
    const json = await res.json();

    return json?.data || [];
  }

  $(window).on('action:composer.rendered', async (e, data) => {
    const { composer } = data;

    if (!composer) return;

    const supportCid = Number(window.flowpromptSupportCategoryId);
    const currentCid = Number(composer.category?.cid);

    const wrapper = $('.flowprompt-flow-wrapper');

    if (!wrapper.length) return;

    if (currentCid !== supportCid) {
      wrapper.addClass('d-none');
      return;
    }

    wrapper.removeClass('d-none');

    const select = $('#flowprompt-flow-select');

    if (select.data('loaded')) return;

    const flows = await loadFlows();

    flows.forEach((flow) => {
      select.append(`<option value="${flow.id}">${flow.name}</option>`);
    });

    select.on('change', function () {
      composer.setData('flowId', this.value || null);
    });

    select.data('loaded', true);
    console.log('[FlowPromptBot] Flow dropdown ready');
  });
})();
