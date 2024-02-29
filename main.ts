// deno-lint-ignore-file no-empty require-await
import * as Dotenv from "https://deno.land/std@0.217.0/dotenv/mod.ts";
import { Future } from "npm:@hazae41/future@1.0.3";
import { RpcErr, RpcError, RpcInvalidParamsError, RpcOk, RpcRequestInit } from "npm:@hazae41/jsonrpc@1.0.5";
import { Mutex } from "npm:@hazae41/mutex@1.2.12";
import { Memory, NetworkMixin, base16_decode_mixed, base16_encode_lower, initBundledOnce } from "npm:@hazae41/network-bundle@1.2.1";
import { None, Some } from "npm:@hazae41/option@1.0.27";
import * as Ethers from "npm:ethers";
import { RpcRequest } from "./deps.ts";
import Abi from "./token.abi.json" with { type: "json" };

await Dotenv.load({ envPath: "./.env", export: true })
await Dotenv.load({ envPath: "./.env.local", export: true })

await initBundledOnce()

const chainIdString = "100"
const contractZeroHex = "0x0a4d5EFEa910Ea5E39be428A3d57B80BFAbA52f4"
const privateKeyZeroHex = Deno.env.get("PRIVATE_KEY_ZERO_HEX")!

const provider = new Ethers.JsonRpcProvider("https://gnosis-rpc.publicnode.com")
const wallet = new Ethers.Wallet(privateKeyZeroHex).connect(provider)
const contract = new Ethers.Contract(contractZeroHex, Abi, wallet)

const chainIdNumber = Number(chainIdString)
const chainIdBase16 = chainIdNumber.toString(16).padStart(64, "0")
const chainIdMemory = base16_decode_mixed(chainIdBase16)

const contractBase16 = contractZeroHex.slice(2).padStart(64, "0")
const contractMemory = base16_decode_mixed(contractBase16)

const receiverZeroHex = wallet.address
const receiverBase16 = receiverZeroHex.slice(2).padStart(64, "0")
const receiverMemory = base16_decode_mixed(receiverBase16)

const nonceBytes = crypto.getRandomValues(new Uint8Array(32))
const nonceMemory = new Memory(nonceBytes)
const nonceBase16 = base16_encode_lower(nonceMemory)
const nonceZeroHex = `0x${nonceBase16}`

const mixinStruct = new NetworkMixin(chainIdMemory, contractMemory, receiverMemory, nonceMemory)

const allSecretZeroHexSet = new Set<string>()

let pendingSecretZeroHexArray = new Array<string>()
let pendingTotalValueBigInt = 0n

const mutex = new Mutex(undefined)

let minimumBigInt = 2n ** 16n
let minimumBase16 = minimumBigInt.toString(16).padStart(64, "0")
let minimumZeroHex = `0x${minimumBase16}`

const balanceByUuid = new Map<string, bigint>()

async function onHttpRequest(request: Request) {
  const url = new URL(request.url)

  const session = url.searchParams.get("session")

  if (session == null)
    return new Response("Bad Request", { status: 400 })

  const onRequestOrNoneOrSomeErr = async (request: RpcRequestInit) => {
    try {
      const option = await routeOrNone(request)

      if (option.isNone())
        return option

      return new Some(new RpcOk(request.id, option.get()))
    } catch (e: unknown) {
      return new Some(new RpcErr(request.id, RpcError.rewrap(e)))
    }
  }

  const routeOrNone = async (request: RpcRequestInit) => {
    if (request.method === "net_get")
      return new Some(await onNetGet(request))
    if (request.method === "net_tip")
      return new Some(await onNetTip(request))
    return new None()
  }

  const onNetGet = async (_: RpcRequestInit) => {
    return { chainIdString, contractZeroHex, receiverZeroHex, nonceZeroHex, minimumZeroHex }
  }

  const onNetTip = async (request: RpcRequestInit) => {
    const [secretZeroHex] = request.params as [string]

    if (typeof secretZeroHex !== "string")
      throw new RpcInvalidParamsError()
    if (secretZeroHex.length !== 66)
      throw new RpcInvalidParamsError()
    if (allSecretZeroHexSet.has(secretZeroHex))
      throw new RpcInvalidParamsError()

    allSecretZeroHexSet.add(secretZeroHex)

    const secretBase16 = secretZeroHex.slice(2).padStart(64, "0")
    const secretMemory = base16_decode_mixed(secretBase16)

    const valueMemory = mixinStruct.verify_secret(secretMemory)
    const valueBase16 = base16_encode_lower(valueMemory)
    const valueZeroHex = `0x${valueBase16}`
    const valueBigInt = BigInt(valueZeroHex)

    if (valueBigInt < minimumBigInt)
      throw new RpcInvalidParamsError()

    const [balanceBigInt = 0n] = [balanceByUuid.get(session)]
    balanceByUuid.set(session, balanceBigInt + valueBigInt)

    console.log(`Received ${valueBigInt.toString()} wei`)

    pendingSecretZeroHexArray.push(secretZeroHex)
    pendingTotalValueBigInt += valueBigInt

    const claim = async (pendingTotalValueBigInt: bigint, pendingSecretZeroHexArray: string[]) => {
      const backpressure = mutex.locked

      if (backpressure) {
        minimumBigInt = minimumBigInt * 2n
        minimumBase16 = minimumBigInt.toString(16).padStart(64, "0")
        minimumZeroHex = `0x${minimumBase16}`

        console.log(`Increasing minimum to ${minimumBigInt.toString()} wei`)
      }

      await mutex.lock(async () => {
        if (backpressure) {
          minimumBigInt = minimumBigInt / 2n
          minimumBase16 = minimumBigInt.toString(16).padStart(64, "0")
          minimumZeroHex = `0x${minimumBase16}`

          console.log(`Decreasing minimum to ${minimumBigInt.toString()} wei`)
        }

        const nonce = await wallet.getNonce("latest")

        while (true) {
          const signal = AbortSignal.timeout(15000)
          const future = new Future<never>()

          const onAbort = () => future.reject(new Error("Aborted"))

          try {
            signal.addEventListener("abort", onAbort, { passive: true })

            console.log(`Claiming ${pendingTotalValueBigInt.toString()} wei`)
            const responsePromise = contract.claim(nonceZeroHex, pendingSecretZeroHexArray, { nonce })
            const response = await Promise.race([responsePromise, future.promise])

            console.log(`Waiting for ${response.hash} on ${response.nonce}`)
            const receipt = await Promise.race([response.wait(), future.promise])

            return receipt
          } catch (e: unknown) {
            if (signal.aborted)
              continue
            throw e
          } finally {
            signal.removeEventListener("abort", onAbort)
          }
        }
      })
    }

    const warn = (e: unknown) => {
      if (e == null) {
        console.error("ERROR", e)
        return
      }

      if (typeof e !== "object") {
        console.error("ERROR", e)
        return
      }

      if ("info" in e) {
        warn(e.info)
        return
      }

      if ("error" in e) {
        warn(e.error)
        return
      }

      if ("message" in e) {
        console.error("ERROR", e.message)
        return
      }

      console.error("ERROR", e)
    }

    if (pendingSecretZeroHexArray.length > 640) {
      claim(pendingTotalValueBigInt, pendingSecretZeroHexArray).catch(warn)

      pendingSecretZeroHexArray = new Array<string>()
      pendingTotalValueBigInt = 0n
    }

    return valueBigInt.toString()
  }

  if (request.headers.get("upgrade") !== "websocket") {
    const target = Deno.env.get("RPC_URL_HTTP")

    if (target == null)
      return new Response("Bad Gateway", { status: 502 })

    if (request.method !== "POST")
      return new Response("Method Not Allowed", { status: 405 })

    const contentType = request.headers.get("content-type")

    if (contentType !== "application/json")
      return new Response("Unsupported Media Type", { status: 415 })

    const data = RpcRequest.from(await request.json())

    const option = await onRequestOrNoneOrSomeErr(data)

    if (option.isSome()) {
      const headers = { "content-type": "application/json" }
      const body = JSON.stringify(option.get())

      return new Response(body, { status: 200, headers })
    }

    const headers = { "content-type": "application/json" }
    const body = JSON.stringify(data)

    let [balanceBigInt = 0n] = [balanceByUuid.get(session)]
    balanceBigInt = balanceBigInt - BigInt(body.length)
    balanceByUuid.set(session, balanceBigInt)

    if (balanceBigInt < 0n)
      return new Response("Payment Required", { status: 402 })

    const response = await fetch(target, { method: "POST", headers, body })

    const contentLength = response.headers.get("content-length")

    if (contentLength == null)
      return new Response("Bad Gateway", { status: 502 })

    balanceBigInt = balanceBigInt - BigInt(contentLength)
    balanceByUuid.set(session, balanceBigInt)

    if (balanceBigInt < 0n)
      return new Response("Payment Required", { status: 402 })

    return response
  }

  const target = Deno.env.get("RPC_URL_WS")

  if (target == null)
    return new Response("Bad Gateway", { status: 502 })

  const upgrade = Deno.upgradeWebSocket(request)

  const client = upgrade.socket
  const server = new WebSocket(target)

  const open = new Promise<unknown>((ok, err) => {
    server.addEventListener("open", ok)
    server.addEventListener("error", err)
  }).catch(console.warn)

  const closeOrIgnore = () => {
    try {
      client.close()
    } catch { }

    try {
      server.close()
    } catch { }
  }

  const onClientMessageOrClose = async (message: string) => {
    try {
      await open

      const request = JSON.parse(message) as RpcRequestInit
      const option = await onRequestOrNoneOrSomeErr(request)

      if (option.isSome()) {
        client.send(JSON.stringify(option.get()))
        return
      }

      let [balanceBigInt = 0n] = [balanceByUuid.get(session)]
      balanceBigInt = balanceBigInt - BigInt(message.length)
      balanceByUuid.set(session, balanceBigInt)

      if (balanceBigInt < 0n) {
        closeOrIgnore()
        return
      }

      server.send(message)
    } catch {
      closeOrIgnore()
    }
  }

  const onServerMessageOrClose = async (message: string) => {
    try {
      let [balanceBigInt = 0n] = [balanceByUuid.get(session)]
      balanceBigInt = balanceBigInt - BigInt(message.length)
      balanceByUuid.set(session, balanceBigInt)

      if (balanceBigInt < 0n) {
        closeOrIgnore()
        return
      }

      client.send(message)
    } catch {
      closeOrIgnore()
    }
  }

  client.addEventListener("message", async (event) => {
    if (typeof event.data !== "string")
      return
    return await onClientMessageOrClose(event.data)
  })

  server.addEventListener("message", async (event) => {
    if (typeof event.data !== "string")
      return
    return await onServerMessageOrClose(event.data)
  })

  client.addEventListener("close", () => closeOrIgnore())
  server.addEventListener("close", (e) => {
    console.error(e)
    closeOrIgnore()
  })

  return upgrade.response
}

Deno.serve({ hostname: "0.0.0.0", port: 8080 }, onHttpRequest);