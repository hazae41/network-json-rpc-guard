import * as Dotenv from "https://deno.land/std@0.217.0/dotenv/mod.ts";
import { serve } from "./mod.ts";

const envPath = new URL(import.meta.resolve("./.env.local")).pathname

const {
  PORT = Deno.env.get("PORT") || "8080",
  PRIVATE_KEY_ZERO_HEX = Deno.env.get("PRIVATE_KEY_ZERO_HEX"),
  RPC_URL_HTTP = Deno.env.get("RPC_URL_HTTP"),
  RPC_URL_WS = Deno.env.get("RPC_URL_WS"),
} = await Dotenv.load({ envPath, examplePath: null })

if (PRIVATE_KEY_ZERO_HEX == null)
  throw new Error("PRIVATE_KEY_ZERO_HEX is not set")

const port = Number(PORT)
const rpcUrlHttp = RPC_URL_HTTP
const rpcUrlWs = RPC_URL_WS
const privateKeyZeroHex = PRIVATE_KEY_ZERO_HEX

const { onHttpRequest } = await serve({ privateKeyZeroHex, rpcUrlHttp, rpcUrlWs })

Deno.serve({ hostname: "0.0.0.0", port }, onHttpRequest)