// ==UserScript==
// @name        cors-manager
// @namespace   nenw@cors-manager
// @match       https://*/*
// @grant       GM.getValue
// @grant       GM.setValue
// @grant       GM.xmlHttpRequest
// @grant       GM.registerMenuCommand
// @version     1.0
// @author      nenw*
// @description Manage the policy of CORS for allowed origins
// ==/UserScript==

import {
  array as zArray,
  boolean as zBoolean,
  discriminatedUnion as zDiscriminatedUnion,
  literal as zLiteral,
  instanceof as zInstanceOf,
  number as zNumber,
  object as zObject,
  record as zRecord,
  string as zString
} from 'zod';

(async () => {
  // Utils
  const safeJSONParse = (string: string) => {
    try { return JSON.parse(string); }
    catch { return null; }
  };

  const policySchema = zObject({
    enabled: zBoolean().default(false),
    allowedOrigins: zArray(zString()).transform(origins => new Set(origins)).prefault([]),
    lastPromptAt: zNumber().default(0),
  }).prefault({});

  const messageSchema = zDiscriminatedUnion(
    'kind',
    [
      zObject({ kind: zLiteral('init') }),
      zObject({
        kind: zLiteral('fetch'),
        method: zString(),
        url: zString(),
        headers: zRecord(zString(), zString()).optional(),
        body: zInstanceOf(Blob).optional(),
      })
    ]
  ).and(zObject({
    is: zLiteral('cors-manager'),
    messageId: zString()
  }));

  const origin = window.location.origin;
  const policyKey = `cors_policy__:${origin}`;
  const policy = policySchema.parse(safeJSONParse(await GM.getValue<string>(policyKey, '{}')));
  const savePolicy = () => GM.setValue(policyKey, {
    enabled: policy.enabled,
    allowedOrigins: Array.from(policy.allowedOrigins),
  });

  window.addEventListener('message', async event => {
    if (event.origin !== origin) return;

    const dataResult = messageSchema.safeParse(event.data);
    if (!dataResult.success) return;

    const data = dataResult.data;
    const reply = (payload: {}) => window.postMessage(
      JSON.stringify({ messageId: data.messageId, ...payload }),
      origin
    );

    if (data.kind === 'init' && Date.now() - policy.lastPromptAt > 10 * 1000) {
      const allowKeyword = 'trust';
      const userInput = prompt(
        `[cors-manager] If you trust this site, please type "${allowKeyword}" ` +
        `into the input field below.\n` +
        `Current Origin: ${origin}`
      );

      if (userInput?.trim() === allowKeyword) {
        policy.enabled = true;
        await savePolicy();
      }

      policy.lastPromptAt = Date.now();
      return;
    }

    if (data.kind === 'fetch' && policy.enabled) {
      try {
        const url = new URL(data.url, window.location.href);
        const targetOrigin = url.origin;
        if (!policy.allowedOrigins.has(targetOrigin)) {
          const allowKeyword = `allow_${Math.floor(Math.random() * 100).toString().padStart(2, '0')}`;
          const userInput = prompt(
            `[cors-manager] If you want to allow this site to send requests to ${targetOrigin}, ` +
            `please type "${allowKeyword}" into the input field below.\n` +
            `Current Origin: ${origin}`
          );

          if (userInput?.trim() !== allowKeyword) {
            return reply({ success: false, reason: 'DENIED' });
          }

          policy.allowedOrigins.add(targetOrigin);
          await savePolicy();
        }

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
})();
