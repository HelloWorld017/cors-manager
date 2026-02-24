# cors-manager
`cors-manager` is a permission manager for requesting with force-CORS.

It consists of:
- a userscript runtime that performs privileged requests via `GM.xmlHttpRequest`
- a typescript library with `fetch()`-like API, by talking to the userscript through `window.postMessage`

[Install Userscript](https://cdn.jsdelivr.net/npm/cors-manager/dist/cors-manager.user.js)

## Getting Started

```sh
npm install cors-manager
```

```ts
import {
  initialize,
  isInitialized,
  checkStatus,
  requestPermission,
  fetchCors,
} from 'cors-manager';

// initialize(): Promise<boolean>
window.addEventListener('load', () => initialize(), { once: true });

// When the initialize() is finished
if (isInitialized()) {
  const targetUrl = 'https://api.example.com/data';

  // requestPermission(url): Promise<boolean>
  const granted = await requestPermission(targetUrl);
  if (!granted) {
    throw new Error('Permission denied by user.');
  }
}

// When the request is needed
const response = await fetchCors(targetUrl, {
  method: 'GET',
  headers: {
    Accept: 'application/json',
  },
});

const json = await response.json();
console.log(json);
```

## Requirements

- A userscript manager such as Tampermonkey/Violentmonkey
- The cors-manager userscript should be installed and active

## Permission Model

1. First-time site trust: The user must allow to enable the manager.
2. First request to a target origin: The user must allow that target.
3. Allowed target origins are persisted per current site origin.

The user can revoke everything from the "Revoke Permissions" menu in userscript.

## API

### `initialize(): Promise<boolean>`

Starts the handshake with the userscript.

- Returns `true` when the current site is trusted and CORS manager is active
- Returns `false` if the handshake fails, times out, or the site is not approved

### `isInitialized(): boolean`

Returns whether the site is approved by `initialize()`.

### `checkStatus(url: RequestInfo | URL): Promise<boolean>`

Checks whether the target origin is currently allowed.

- Returns `true` when the target origin is already allowed
- Returns `false` when not allowed, denied, or when no reply is received in time

### `requestPermission(url: RequestInfo | URL): Promise<boolean>`

Requests permission for the target origin.

- Returns `true` when the origin is approved
- Returns `false` when denied or when no reply is received in time

### `fetchCors(url: RequestInfo | URL, init?: RequestInit): Promise<Response>`

Sends a request through the userscript channel.

- Throws if no response is received in time
- Throws if the userscript rejects the request (for example: denied origin)
- Returns a normal `Response` object on success

## Acknowledgements
- [rxliuli/cors-unblock](https://github.com/rxliuli/cors-unblock)
