const axios = require('axios');

const topics = require.main.require('./src/topics');
const posts = require.main.require('./src/posts');
const users = require.main.require('./src/user');
const nconf = require.main.require('nconf');

const Plugin = {};

// ================= CONFIG =================

const FLOWPROMPT_CONFIG = nconf.get('flowprompt') || {};
const FLOWPROMPT_API_BASE = FLOWPROMPT_CONFIG.flowpromptAPIBaseUrl;
const BOT_UID = Number(FLOWPROMPT_CONFIG.botUid) || 66;

// ==========================================

Plugin.init = async () => {
  console.log('[FlowPromptBot] Plugin initialized');
  console.log('[FlowPromptBot] Config:', {
    FLOWPROMPT_API_BASE,
    BOT_UID,
  });
};

function maskFlowIdInTitle(title, flowId) {
  if (!title || !flowId) return title;

  return title.replace(new RegExp(flowId, 'g'), '********');
}

/**
 * On topic creation:
 * - Extract flowId
 * - Store it privately
 * - Mask title
 */
Plugin.onTopicCreate = async ({ topic }) => {
  try {
    if (!topic?.title) return;

    console.log('[FlowPromptBot] onTopicCreate', {
      tid: topic.tid,
      title: topic.title,
    });

    const match = topic.title.match(/(?:flow|flowId)\s*[:=]?\s*([\w-]+)/i);

    if (!match) return;

    const flowId = match[1];

    await topics.setTopicField(topic.tid, 'flowId', flowId);
    await topics.setTopicFields(topic.tid, {
      invitedEmails: [],
      revokedEmails: [],
    });

    console.log('[FlowPromptBot] flowId stored:', {
      tid: topic.tid,
      flowId,
    });

    const maskedTitle = maskFlowIdInTitle(topic.title, flowId);

    await topics.setTopicField(topic.tid, 'title', maskedTitle);

    console.log('[FlowPromptBot] Title masked', {
      tid: topic.tid,
      title: maskedTitle,
    });
  } catch (err) {
    console.error('[FlowPromptBot] onTopicCreate error', err);
  }
};

/**
 * On reply:
 * - Handle /invite command
 * - Enforce invite access
 * - Run flow only for valid invited replies
 */
// =====================================================
// POST SAVE
// =====================================================
Plugin.onPostSave = async ({ post }) => {
  try {
    if (!post) return;

    // Ignore bot
    if (post.uid === BOT_UID) return;

    const topic = await topics.getTopicFields(post.tid, ['uid']);

    if (!topic) return;

    const user = await users.getUserFields(post.uid, [
      'uid',
      'email',
      'username',
    ]);

    // =================================================
    // 🟢 MAIN POST → extract flowId
    // =================================================
    if (post.isMain) {
      if (post.uid !== topic.uid) return;

      const match = post.content.match(/(?:flow|flowId)\s*[:=]?\s*([\w-]+)/i);

      if (!match) return;

      const flowId = match[1];

      await topics.setTopicField(post.tid, 'flowId', flowId);

      console.log('[FlowPromptBot] flowId set from main post', {
        tid: post.tid,
        flowId,
      });

      const maskedContent = post.content.replace(
        new RegExp(flowId, 'g'),
        '********',
      );

      // Mask flowId in main post
      await posts.setPostField(post.pid, 'content', maskedContent);
      await posts.setPostField(post.pid, 'contentRaw', maskedContent);
      await posts.setPostField(post.pid, 'edited', Date.now());

      console.log('[FlowPromptBot] flowId stored & masked in main post', {
        tid: post.tid,
        flowId,
        content: maskedContent,
      });
      return;
    }

    // =================================================
    // 🔵 NORMAL REPLIES
    // =================================================

    // Ignore reply-to-reply
    if (post.toPid) return;

    const flowId = await topics.getTopicField(post.tid, 'flowId');

    if (!flowId) return;

    const invitedEmails =
      (await topics.getTopicField(post.tid, 'invitedEmails')) || [];

    const revokedEmails =
      (await topics.getTopicField(post.tid, 'revokedEmails')) || [];

    console.log('[FlowPromptBot] invitedEmails', invitedEmails);
    console.log('[FlowPromptBot] revokedEmails', revokedEmails);

    // ---------------------------
    // INVITE COMMAND
    // ---------------------------
    if (post.content.startsWith('/invite')) {
      if (post.uid !== topic.uid) return;

      const emails = extractEmails(post.content, '/invite');

      if (!emails.length) return;

      const updatedInvites = Array.from(new Set([...invitedEmails, ...emails]));

      const updatedRevoked = revokedEmails.filter((e) => !emails.includes(e));

      await topics.setTopicFields(post.tid, {
        invitedEmails: updatedInvites,
        revokedEmails: updatedRevoked,
      });

      console.log('[FlowPromptBot] Users invited', updatedInvites);
      return;
    }

    // ---------------------------
    // REVOKE COMMAND
    // ---------------------------
    if (post.content.startsWith('/revoke')) {
      if (post.uid !== topic.uid) return;

      const emails = extractEmails(post.content, '/revoke');

      if (!emails.length) return;

      const updatedInvites = invitedEmails.filter((e) => !emails.includes(e));

      const updatedRevoked = Array.from(new Set([...revokedEmails, ...emails]));

      await topics.setTopicFields(post.tid, {
        invitedEmails: updatedInvites,
        revokedEmails: updatedRevoked,
      });

      console.log('[FlowPromptBot] Users revoked', updatedRevoked);
      return;
    }

    // Ignore topic owner replies
    if (post.uid === topic.uid) return;

    // ---------------------------
    // ACCESS CONTROL
    // ---------------------------

    // ❌ Explicit revoke always blocks
    if (revokedEmails.includes(user.email)) {
      console.log('[FlowPromptBot] Revoked user blocked', user.email);
      return;
    }

    // 🔐 Private topic (invite list exists)
    if (invitedEmails.length > 0) {
      if (!invitedEmails.includes(user.email)) {
        console.log('[FlowPromptBot] Uninvited user blocked', user.email);
        return;
      }
    }
    // 🔓 Public topic → anyone allowed

    // ---------------------------
    // VALID FLOW EXECUTION
    // ---------------------------
    console.log('[FlowPromptBot] Running flow', {
      tid: post.tid,
      pid: post.pid,
      flowId,
      user: user.email,
    });

    await runFlow({
      flowId,
      input: post.content,
      tid: post.tid,
      pid: post.pid,
      userEmail: user.email,
    });
  } catch (err) {
    console.error('[FlowPromptBot] onPostSave error', err);
  }
};

// Plugin.filterPostSave = async (data) => {
//   const { post } = data;

//   console.log('[FlowPromptBot] filterPostSave', post);

//   if (!post || !post.isMain) return data;

//   const topic = await topics.getTopicFields(post.tid, ['uid']);

//   if (!topic || post.uid !== topic.uid) return data;

//   const match = post.content.match(/(?:flow|flowId)\s*[:=]?\s*([\w-]+)/i);

//   if (!match) return data;

//   const flowId = match[1];

//   // Store flowId ONCE
//   await topics.setTopicField(post.tid, 'flowId', flowId);

//   // Mask BEFORE save
//   post.content = post.content.replace(new RegExp(flowId, 'g'), '********');
//   post.contentRaw = post.content;

//   console.log('[FlowPromptBot] flowId captured & masked', {
//     tid: post.tid,
//   });

//   return data;
// };

// =====================================================
// HELPERS
// =====================================================
function extractEmails(content, command) {
  return content
    .replace(command, '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

async function runFlow({ flowId, input, tid, pid, userEmail }) {
  try {
    await axios.post(
      `${FLOWPROMPT_API_BASE}/api/forum/run-flow`,
      {
        flowId,
        input,
        tid,
        pid,
        userEmail,
      },
      { timeout: 15000 },
    );

    console.log('[FlowPromptBot] Flow executed successfully');
  } catch (err) {
    console.error(
      '[FlowPromptBot] Flow API error',
      err.response?.data || err.message,
    );
  }
}

module.exports = Plugin;
