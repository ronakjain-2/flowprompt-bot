(function () {
  const API_URL = '/api/plugins/nodebb-plugin-flowprompt-bot/flows';

  async function fetchFlows() {
    const res = await fetch(API_URL, { credentials: 'include' });
    const json = await res.json();

    return json?.data || [];
  }

  $(window).on('action:composer.loaded', async (e, data) => {
    const { composer } = data;

    if (!composer) return;

    const supportCid = Number(window.flowpromptSupportCategoryId);
    const cid = Number(composer.category?.cid);

    const control = composer.controls?.['flowprompt-flow'];

    if (!control) return;

    if (cid !== supportCid) {
      control.hide();
      return;
    }

    control.show();

    if (control._loaded) return;

    const flows = await fetchFlows();

    control.setOptions([
      { value: '', label: 'No Flow' },
      ...flows.map((f) => ({ value: f.id, label: f.name })),
    ]);

    control.onChange((value) => {
      composer.setData('flowpromptFlow', value || null);
    });

    control._loaded = true;
    console.log('[FlowPromptBot] Flow dropdown ready');
  });
})();
