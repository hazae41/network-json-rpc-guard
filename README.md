# Network JSON-RPC guard

Free JSON-RPC using [Network](https://github.com/stars/hazae41/lists/network)

This acts as a payment guard and proxies requests to a JSON-RPC endpoint using both WebSocket and HTTP.

## Getting started

### Hosting

You can easily deploy a proxy to cloud hosting such as [render.com](https://render.com) as a web service using Docker

Fork this repository on your GitHub account and select it on your cloud hosting platform

<img src="https://github.com/hazae41/network-ws-to-tcp-proxy/assets/4405263/57eb5e56-7475-4bbf-9ba0-548f1444d6ff" width="500" />

### Environment variables

Setup environment variables

<img src="https://github.com/hazae41/network-ws-to-tcp-proxy/assets/4405263/19c3c3a4-7833-4bf5-bd6c-3dac1e7f6e49" width="500" />

You can also create a `.env` or `.env.local` file if you're self-hosting

#### `PRIVATE_KEY_ZERO_HEX` (required)

Your Ethereum private key as a 0x-prefixed base16 string

e.g. `0x35609a4c7e0334d76e15d107c52ee4e9beab1199556cef78fd8624351c0e2c8c`

#### `RPC_URL_HTTP` (optional)

Your JSON-RPC endpoint for HTTP requests

You can include a private token in the url

e.g. `https://mainnet.infura.io/v3/b6bf7d3508c941499b10025c0776eaf8`

#### `RPC_URL_WS` (optional)

Your JSON-RPC endpoint for WebSocket requests

You can include a private token in the url

e.g. `wss://mainnet.infura.io/ws/v3/b6bf7d3508c941499b10025c0776eaf8`

## Protocol

### HTTP

Connect to the proxy via HTTP with the following URL query parametes
- `session` -> A unique private random unguessable string for your session (e.g. `crypto.randomUUID()`)

e.g. `http://localhost:8000/?session=22deac58-7e01-4ddb-b9c4-07c73a32d1b5`

## WebSocket

Connect to the proxy via WebSocket with the following URL query parameters
- `session` -> A unique private random unguessable string for your session (e.g. `crypto.randomUUID()`)

e.g. `ws://localhost:8000/?session=22deac58-7e01-4ddb-b9c4-07c73a32d1b5`

### Price

The price is 1 wei = 1 char of communication (`balance -= message.length`)
- Your balance is withdrawn when you send messages to the JSON-RPC target
- Your balance is withdrawn when the JSON-RPC target sends you messages

**You MUST PAY BEFORE talking with the JSON-RPC target**

All connections are closed (ws) or errored (http) when your balance is negative

So you must count how many bytes you sent/received and pay when your balance is low

### JSON-RPC

The proxy accepts the following JSON-RPC methods

All unknown methods will be forwarded to the target

#### net_get

```tsx
{
  jsonrpc: "2.0",
  id: 123,
  method: "net_get"
}
```

Returns the Network parameters as `{ chainIdString, contractZeroHex, receiverZeroHex, nonceZeroHex, minimumZeroHex }`

#### net_tip

```tsx
{
  jsonrpc: "2.0",
  id: 123,
  method: "net_tip",
  params: [string]
}
```

Params contains a Network secret as a 0x-prefixed base16 string of length 64

e.g.

```tsx
{
  jsonrpc: "2.0",
  id: 123,
  method: "net_tip",
  params: ["0xe353e28d6b6a21a8188ef68643e4b93d41bca5baa853965a6a0c9ab7427138b0"]
}
```

It will return the value added to your balance as a decimal bigint string

```tsx
{
  jsonrpc: "2.0",
  id: 123,
  result: "123456789123456789"
}
```
