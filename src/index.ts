// ==UserScript==
// @name        cors-manager
// @namespace   nenw@cors-manager
// @version     %%VERSION%%
// @author      nenw*
// @description Manage the policy of CORS for allowed origins
// @match       https://*/*
// @grant       GM.getValue
// @grant       GM.setValue
// @grant       GM.deleteValue
// @grant       GM.xmlHttpRequest
// @grant       GM.registerMenuCommand
// @homepage    https://github.com/HelloWorld017/cors-manager
// @updateURL   https://cdn.jsdelivr.net/npm/cors-manager/dist/cors-manager.meta.js
// @downloadURL https://cdn.jsdelivr.net/npm/cors-manager/dist/cors-manager.user.js
// ==/UserScript==

import {
  safeParse as safeParse,
  array as vArray,
  boolean as vBoolean,
  literal as vLiteral,
  instance as vInstance,
  intersect as vIntersect,
  object as vObject,
  optional as vOptional,
  pipe as vPipe,
  record as vRecord,
  string as vString,
  transform as vTransform,
  variant as vVariant
} from 'valibot';

const policySchema = vObject({
  enabled: vBoolean(),
  allowedOrigins: vPipe(vArray(vString()), vTransform(value => new Set(value))),
});

const messageSchema = vIntersect([
  vVariant(
    'kind',
    [
      vObject({ kind: vLiteral('init') }),
      vObject({
        kind: vLiteral('fetch'),
        method: vString(),
        url: vString(),
        headers: vOptional(vRecord(vString(), vString())),
        body: vOptional(vInstance(Blob)),
      }),
      vObject({
        kind: vLiteral('checkStatus'),
        url: vString(),
      }),
      vObject({
        kind: vLiteral('requestPermission'),
        url: vString(),
      }),
    ]
  ),
  vObject({
    is: vLiteral('cors-manager'),
    messageId: vString()
  })
]);

export type { policySchema, messageSchema };

(async () => {
  const safeJSONParse = (string: string) => {
    try { return JSON.parse(string); }
    catch { return null; }
  };

  const safeURLParse = (url: string) => {
    try { return new URL(url, window.location.href); }
    catch { return null; }
  };

  const createMessageId = () => {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }

    return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  };

  const origin = window.location.origin;
  const policyKey = `cors_policy__:${origin}`;
  const policyResult = safeParse(policySchema, safeJSONParse(await GM.getValue<string>(policyKey, '{}')));
  const policy = {
    ...(policyResult.success ? policyResult.output : { enabled: false, allowedOrigins: new Set() }),
    deniedOrigins: new Set(),
    lastPromptAt: 0,
  };

  const savePolicy = () => !policy.enabled
    ? GM.deleteValue(policyKey)
    : GM.setValue(policyKey, {
      enabled: policy.enabled,
      allowedOrigins: Array.from(policy.allowedOrigins),
    });

  const notifyInitialized = () => {
    document.documentElement.dataset.corsManager = 'true';
    window.postMessage({
      is: 'cors-manager',
      messageId: createMessageId(),
      kind: 'initialized',
      isInitialized: true
    });
  };

  if (policy.enabled) {
    notifyInitialized();
  }

  window.addEventListener('message', async event => {
    if (event.origin !== origin) return;

    const dataResult = safeParse(messageSchema, event.data);
    if (!dataResult.success) return;

    const data = dataResult.output;
    const reply = (payload: Record<string, unknown>) => window.postMessage(
      { is: 'cors-manager', messageId: data.messageId, kind: `reply/${data.kind}`, ...payload },
      origin
    );

    if (data.kind === 'init') {
      if (policy.enabled) {
        reply({ success: true });
        notifyInitialized();
        return;
      }

      if (Date.now() - policy.lastPromptAt > 10 * 1000) {
        const allowKeyword = 'trust';
        const userInput = prompt(
          `[cors-manager]\n\nIf you trust this site, please type "${allowKeyword}" ` +
          `into the input field below.\n` +
          `Current Origin: ${origin}`
        );

        if (userInput?.trim() === allowKeyword) {
          policy.enabled = true;
          await savePolicy();
          reply({ success: true });
          notifyInitialized();
        }

        policy.lastPromptAt = Date.now();
      }

      return;
    }

    if (!policy.enabled) {
      return;
    }

    const url = safeURLParse(data.url);
    const targetOrigin = url?.origin;
    if (!targetOrigin) {
      return;
    }

    if (data.kind === 'checkStatus') {
      return reply({
        success: true,
        isAllowed: !policy.deniedOrigins.has(targetOrigin) && policy.allowedOrigins.has(targetOrigin)
      });
    }

    if (policy.deniedOrigins.has(targetOrigin)) {
      return reply({ success: false, reason: 'DENIED' });
    }

    if (!policy.allowedOrigins.has(targetOrigin)) {
      const allowKeyword = `allow_${Math.floor(Math.random() * 100).toString().padStart(2, '0')}`;
      const userInput = prompt(
        `[cors-manager]\n\nIf you want to allow this site to send requests to ${targetOrigin}, ` +
        `please type "${allowKeyword}" into the input field below.\n` +
        `Current Origin: ${origin}`
      );

      if (userInput?.trim() !== allowKeyword) {
        return reply({ success: false, reason: 'DENIED' });
      }

      policy.allowedOrigins.add(targetOrigin);
      await savePolicy();
    }

    if (data.kind === 'requestPermission') {
      return reply({ success: true });
    }

    if (data.kind === 'fetch') {
      try {
        type Method = Parameters<typeof GM.xmlHttpRequest>[0]['method'];
        GM.xmlHttpRequest({
          method: data.method as Method,
          url: url.href,
          headers: data.headers,
          data: data.body,
          responseType: 'blob',
          binary: !!data.body,
          onload: res => reply({
            success: true,
            status: res.status,
            statusText: res.statusText,
            headers: res.responseHeaders
              .split('\n')
              .map(row => row.split(':'))
              .map(row => [row[0]?.trim() ?? '', row.slice(1).join(':').trim()]),
            body: res.response as Blob,
          }),
          onerror: res => reply({
            success: false,
            reason: res.error
          }),
        });
      } catch {
        reply({
          success: false,
          reason: 'unknown'
        });
      }
    }
  });

  GM.registerMenuCommand('Revoke Permissions', async () => {
    policy.enabled = false;
    policy.allowedOrigins.clear();
    await savePolicy();
    alert('[cors-manager]\n\nSuccessfully revoked permissions.\nPlease refresh page!');
  });
})();
