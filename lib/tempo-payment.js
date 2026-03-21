/**
 * Tempo TIP-20 決済検証（EVM）と Buildy アクセストークン（HMAC）
 * @see https://docs.tempo.xyz/
 * @see https://docs.chainstack.com/docs/tempo-tutorial-first-payment-app
 */
import crypto from "crypto";
import { ethers } from "ethers";

const PATH_USD_MAINNET_TESTNET = "0x20c0000000000000000000000000000000000000";

const TIP20_ABI = [
  "event TransferWithMemo(address indexed from, address indexed to, uint256 value, bytes32 indexed memo)",
];

export function getTempoDefaults() {
  const chainId = parseInt(process.env.TEMPO_CHAIN_ID || "42431", 10);
  const rpcUrl =
    process.env.TEMPO_RPC_URL ||
    (chainId === 4217 ? "https://rpc.tempo.xyz" : "https://rpc.moderato.tempo.xyz");
  const tokenAddress = (process.env.TEMPO_TIP20_ADDRESS || PATH_USD_MAINNET_TESTNET).toLowerCase();
  const receiver = (process.env.BUILDY_TEMPO_RECEIVER || "").trim().toLowerCase();
  const jpyPerUsd = parseFloat(process.env.BUILDY_JPY_PER_USD || "150") || 150;
  const explorerBase =
    chainId === 4217
      ? "https://explore.mainnet.tempo.xyz"
      : "https://explore.tempo.xyz";
  return { chainId, rpcUrl, tokenAddress, receiver, jpyPerUsd, explorerBase };
}

export function yenToUsdAtomic(yen) {
  const y = Math.max(0, Number(yen) || 0);
  const { jpyPerUsd } = getTempoDefaults();
  const usd = y <= 0 ? 0 : Math.max(0.01, Math.round((y / jpyPerUsd) * 100) / 100);
  const atomic = ethers.parseUnits(usd.toFixed(2), 6);
  return { usd, atomic: atomic.toString(), atomicBn: atomic };
}

function timingSafeEqual(a, b) {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export function signAccessToken({ grantId, agentId, expSec }, secret) {
  if (!secret) throw new Error("BUILDY_ACCESS_TOKEN_SECRET is not set");
  const payload = JSON.stringify({ gid: grantId, aid: agentId, exp: expSec });
  const data = Buffer.from(payload, "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function parseAccessToken(token, secret) {
  if (!token || !secret) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [data, sig] = parts;
  const expected = crypto.createHmac("sha256", secret).update(data).digest("base64url");
  if (!timingSafeEqual(sig, expected)) return null;
  try {
    const json = Buffer.from(data, "base64url").toString("utf8");
    const o = JSON.parse(json);
    if (!o.gid || !o.aid || !o.exp) return null;
    return { grantId: o.gid, agentId: o.aid, exp: o.exp };
  } catch {
    return null;
  }
}

/**
 * トランザクションレシートから TransferWithMemo を検証
 * @param {string} txHash
 * @param {{ recipient: string, tokenAddress: string, minAtomic: string, memoLabel: string, rpcUrl: string }} opts
 */
export async function verifyTip20TransferWithMemo(txHash, opts) {
  const { recipient, tokenAddress, minAtomic, memoLabel, rpcUrl } = opts;
  if (!recipient) return { ok: false, error: "BUILDY_TEMPO_RECEIVER is not configured" };
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt || receipt.status !== 1) return { ok: false, error: "transaction not found or failed" };

  const iface = new ethers.Interface(TIP20_ABI);
  const expectedMemo = ethers.encodeBytes32String(memoLabel.slice(0, 31));
  const min = BigInt(minAtomic);
  const rec = recipient.toLowerCase();
  const token = tokenAddress.toLowerCase();

  let from = null;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== token) continue;
    let parsed;
    try {
      parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
    } catch {
      continue;
    }
    if (!parsed || parsed.name !== "TransferWithMemo") continue;
    const to = parsed.args.to.toLowerCase();
    const value = parsed.args.value;
    const memo = parsed.args.memo;
    if (to !== rec) continue;
    if (value < min) continue;
    if (memo !== expectedMemo) continue;
    from = parsed.args.from.toLowerCase();
    return { ok: true, from, value: value.toString() };
  }

  return { ok: false, error: "no matching TransferWithMemo to Buildy receiver with this memo and amount" };
}

export function randomOrderId() {
  return crypto.randomBytes(6).toString("hex");
}
