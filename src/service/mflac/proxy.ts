import Mp3Util from "@/native/mp3Util";
import { normalizeEkey, isMflacUrl } from "@/utils/mflac";
import { devLog } from "@/utils/log";

let proxyStarted = false;

async function ensureProxyStarted() {
  if (!proxyStarted) {
    try {
      devLog('info', '🚀[mflac] 启动mflac代理服务');
      await (Mp3Util as any).startMflacProxy?.();
      proxyStarted = true;
      devLog('info', '✅[mflac] 代理服务启动成功');
    } catch (error: any) {
      devLog('error', '❌[mflac] 代理服务启动失败', error);
      // ignore; will retry lazily
    }
  }
}

export async function getLocalStreamUrlIfNeeded(
  url?: string,
  ekey?: string,
  headers?: Record<string, string>,
): Promise<string | undefined> {
  devLog('info', '🔍[mflac] getLocalStreamUrlIfNeeded调用', {
    hasUrl: !!url,
    hasEkey: !!ekey,
    ekeyLength: ekey?.length,
    urlEnding: url?.split('?')[0]?.slice(-10)
  });

  if (!url) return undefined;
  const hasEkey = !!ekey;
  // 没有 ekey 则不尝试代理（上游仍是加密流，播放会失败）；此时返回 undefined 让播放器继续走原URL（用于非mflac）
  if (!hasEkey) {
    devLog('warn', '⚠️[mflac] 没有ekey，跳过代理');
    return undefined;
  }

  await ensureProxyStarted();
  const cleaned = normalizeEkey(ekey);
  devLog('info', '📝[mflac] ekey处理', {
    originalLength: ekey.length,
    cleanedLength: cleaned.length
  });

  const localUrl = await (Mp3Util as any).registerMflacStream?.(url, cleaned, headers || null);
  devLog('info', '🔗[mflac] 代理URL生成', {
    success: !!localUrl,
    localUrl: typeof localUrl === "string" ? localUrl : 'undefined'
  });

  return typeof localUrl === "string" ? localUrl : undefined;
}
