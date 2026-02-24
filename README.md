# cors-manager
`cors-manager` is a permission manager for requesting with force-CORS.

It consists of:
* a userscript runtime that performs privileged requests via `GM.xmlHttpRequest`
* a typescript library with `fetch()`-like API, by talking to the userscript through `window.postMessage`

## Getting Started

```sh
npm add cors-manager
```

```ts
import { initialize, isInitialized, checkStatus, fetchCors } from 'cors-manager';

// initialize(): Promise<boolean>
window.addEventListener('load', () => initialize(), { once: true });

// When the user needs request
if (isInitialized()) {
  const response = await fetchCors('https://api.example.com/data', {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  const json = await response.json();
  console.log(json);
}
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

Returns the in-memory initialization flag set by `initialize()`.

### `fetchCors(input, init?): Promise<Response>`

Sends a request through the userscript channel.

- Throws if no response is received in time
- Throws if the userscript rejects the request (for example: denied origin)
- Returns a normal `Response` object on success

## Acknowledgements
[rxliuli/cors-unblock](https://github.com/rxliuli/cors-unblock)
