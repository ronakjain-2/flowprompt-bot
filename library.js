const axios = require('axios');

const topics = require.main.require('./src/topics');
const slugify = require.main.require('./src/slugify');
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

    const match = topic.title.match(/(?:flow|flowId)\s*[:=]?\s*([\w-]+)/i);

    if (!match) return;

    const flowId = match[1];

    await topics.setTopicField(topic.tid, 'flowId', flowId);
    await topics.setTopicField(topic.tid, 'invitedEmails', []);

    console.log('[FlowPromptBot] flowId stored:', {
      tid: topic.tid,
      flowId,
    });

    const maskedTitle = maskFlowIdInTitle(topic.title, flowId);
    const cleanTitle = topic.title.replace(/\[flowId:[^\]]+\]/gi, '').trim();
    const newSlug = slugify(cleanTitle);

    await topics.setTopicField(topic.tid, 'title', maskedTitle);
    await topics.setTopicField(topic.tid, 'slug', newSlug);

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
Plugin.onPostSave = async ({ post }) => {
  try {
    if (!post || post.isMain) return;

    // Ignore bot
    if (post.uid === BOT_UID) return;

    // Ignore reply-to-reply
    if (post.toPid) {
      console.log('[FlowPromptBot] Ignoring reply-to-reply', {
        pid: post.pid,
        toPid: post.toPid,
      });
      return;
    }

    const flowId = await topics.getTopicField(post.tid, 'flowId');

    if (!flowId) return;

    const topic = await topics.getTopicFields(post.tid, ['uid']);

    if (!topic) return;

    const user = await users.getUserFields(post.uid, [
      'uid',
      'email',
      'username',
    ]);

    // ---------------------------
    // INVITE COMMAND
    // ---------------------------
    if (post.content.startsWith('/invite')) {
      if (post.uid !== topic.uid) {
        console.log('[FlowPromptBot] Non-owner tried to invite');
        return;
      }

      const emails = post.content
        .replace('/invite', '')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);

      if (!emails.length) return;

      const existing =
        (await topics.getTopicField(post.tid, 'invitedEmails')) || [];

      const updated = Array.from(new Set([...existing, ...emails]));

      await topics.setTopicField(post.tid, 'invitedEmails', updated);

      console.log('[FlowPromptBot] Users invited', {
        tid: post.tid,
        emails: updated,
      });

      return;
    }

    // Ignore topic-owner reply
    if (post.uid === topic.uid) {
      console.log('[FlowPromptBot] Ignoring topic-owner reply', {
        tid: post.tid,
        uid: post.uid,
      });
      return;
    }

    // ---------------------------
    // INVITE ENFORCEMENT
    // ---------------------------
    const invitedEmails =
      (await topics.getTopicField(post.tid, 'invitedEmails')) || [];

    if (!invitedEmails.includes(user.email)) {
      console.log('[FlowPromptBot] Uninvited user reply ignored', {
        tid: post.tid,
        uid: post.uid,
        email: user.email,
      });
      return;
    }

    // ---------------------------
    // VALID FLOW EXECUTION
    // ---------------------------
    console.log('[FlowPromptBot] Valid reply detected → running flow', {
      tid: post.tid,
      flowId,
      replyUid: post.uid,
    });

    await runFlow({
      flowId,
      input: post.content,
      tid: post.tid,
      userEmail: user.email,
    });
  } catch (err) {
    console.error('[FlowPromptBot] onPostSave error', err);
  }
};

// ================= HELPERS =================

async function runFlow({ flowId, input, tid, userEmail }) {
  try {
    console.log('[FlowPromptBot] Calling FlowPrompt API', {
      flowId,
      tid,
      userEmail,
    });

    await axios.post(
      `${FLOWPROMPT_API_BASE}/api/forum/run-flow`,
      {
        flowId,
        input,
        tid,
        userEmail,
      },
      { timeout: 15000 },
    );

    console.log('[FlowPromptBot] FlowPrompt API called successfully');
    return true;
  } catch (err) {
    console.error(
      '[FlowPromptBot] Flow API error',
      err.response?.data || err.message,
    );
    return false;
  }
}

module.exports = Plugin;
