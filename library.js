const axios = require('axios');

const topics = require.main.require('./src/topics');
const posts = require.main.require('./src/posts');
const users = require.main.require('./src/user');
const nconf = require.main.require('nconf');

const Plugin = {};

// ================= CONFIG =================

const FLOWPROMPT_CONFIG = nconf.get('flowprompt') || {};

const SUPPORT_CATEGORY_ID = Number(FLOWPROMPT_CONFIG.supportCategoryId) || null;
const FLOWPROMPT_API_BASE = FLOWPROMPT_CONFIG.flowpromptAPIBaseUrl;
const BOT_UID = Number(FLOWPROMPT_CONFIG.botUid) || 66;

// ==========================================

Plugin.init = async () => {
  console.log('[FlowPromptBot] Plugin initialized');
  console.log('[FlowPromptBot] Config:', {
    SUPPORT_CATEGORY_ID,
    FLOWPROMPT_API_BASE,
    BOT_UID,
  });
};

/**
 * Extract flowId from topic title and store it
 */
Plugin.onTopicCreate = async ({ topic }) => {
  try {
    if (!topic || !topic.title) return;

    const match = topic.title.match(/(?:flow|flowId)\s*[:=]\s*(\w+)/i);

    if (!match) return;

    const flowId = match[1];

    await topics.setTopicField(topic.tid, 'flowId', flowId);
    await topics.setTopicField(topic.tid, 'allowedUids', JSON.stringify([]));

    console.log('[FlowPromptBot] flowId stored:', {
      tid: topic.tid,
      flowId,
    });
  } catch (err) {
    console.error('[FlowPromptBot] onTopicCreate error', err);
  }
};

/**
 * Trigger flow ONLY when valid invited reply
 */
Plugin.onPostSave = async ({ post }) => {
  try {
    if (!post) return;

    // Ignore main topic post
    if (post.isMain) return;

    // Ignore bot replies
    if (post.uid === BOT_UID) return;

    // Ignore replies to replies
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

    const topicOwnerUid = topic.uid;

    // Handle invite command
    if (post.content.startsWith('/invite')) {
      if (post.uid !== topicOwnerUid) {
        await posts.delete(post.pid);
        console.log('[FlowPromptBot] Invite rejected: not topic owner');
        return;
      }

      await handleInvite(post);
      return;
    }

    // Ignore replies from topic owner
    if (post.uid === topicOwnerUid) {
      console.log('[FlowPromptBot] Ignoring topic-owner reply', {
        tid: post.tid,
        uid: post.uid,
      });
      return;
    }

    // Check invite permission
    const isAllowed = await isUserAllowed(post.tid, post.uid);

    if (!isAllowed) {
      await posts.delete(post.pid);
      console.log('[FlowPromptBot] Reply blocked: user not invited', {
        uid: post.uid,
        tid: post.tid,
      });
      return;
    }

    console.log('[FlowPromptBot] Valid reply detected → running flow', {
      tid: post.tid,
      flowId,
      replyUid: post.uid,
    });

    const userData = await users.getUserFields(post.uid, [
      'uid',
      'username',
      'email',
    ]);

    await runFlow({
      flowId,
      input: post.content,
      tid: post.tid,
      userEmail: userData?.email,
    });
  } catch (err) {
    console.error('[FlowPromptBot] onPostSave error', err);
  }
};

// ================= INVITES =================

async function handleInvite(post) {
  const usernames =
    post.content.match(/@([\w-]+)/g)?.map((u) => u.slice(1)) || [];

  if (!usernames.length) return;

  const allowedUids = JSON.parse(
    (await topics.getTopicField(post.tid, 'allowedUids')) || '[]',
  );

  for (const username of usernames) {
    const uid = await users.getUidByUsername(username);

    if (uid && !allowedUids.includes(uid)) {
      allowedUids.push(uid);
    }
  }

  await topics.setTopicField(
    post.tid,
    'allowedUids',
    JSON.stringify(allowedUids),
  );

  console.log('[FlowPromptBot] Users invited:', allowedUids);
}

async function isUserAllowed(tid, uid) {
  const topic = await topics.getTopicFields(tid, ['uid']);

  if (uid === topic.uid) return true;

  const allowedUids = JSON.parse(
    (await topics.getTopicField(tid, 'allowedUids')) || '[]',
  );

  return allowedUids.includes(uid);
}

// ================= FLOW =================

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
