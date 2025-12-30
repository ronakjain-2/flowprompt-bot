console.log('[FlowPromptBot] client.js LOADED');

$(window).on('action:topic.loaded', (e, data) => {
  console.log('[FlowPromptBot] topic.loaded fired', data?.topic?.tid);
});

$(window).on('action:composer.loaded', () => {
  console.log('[FlowPromptBot] composer.loaded fired');
});
