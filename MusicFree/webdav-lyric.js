"use strict";
Object.defineProperty(exports, "__esModule", { value: true });

const webdav_1 = require("webdav");

/**
 * 说明
 * - 这是“歌词插件”（supportedSearchType: ['lyric']），不是音源插件
 * - 你的规则：lrc 文件名与音乐文件名完全一致（仅扩展名不同）
 * - 实现思路：
 *   1) 登录/取 client：完全模仿你提供的 webdav插件.js（同样读 env.getUserVariables）
 *   2) search(query)：在指定 searchPath 目录下列出 .lrc 文件并按文件名过滤（模仿你贴的歌词插件 search 结构）
 *   3) getLyric(musicItem)：用 musicItem.title 去匹配 `${title}.lrc`（完全一致匹配），找到了就读文件内容返回 rawLrc
 */

let cachedData = {};

function getClient() {
  var _a, _b, _c;
  const { url, username, password, searchPath } =
    (_b =
      (_a = env === null || env === void 0 ? void 0 : env.getUserVariables) ===
        null || _a === void 0
        ? void 0
        : _a.call(env)) !== null && _b !== void 0
      ? _b
      : {};

  if (!(url && username && password)) {
    return null;
  }

  // 模仿 webdav插件.js：变量变化则清缓存
  if (
    !(
      cachedData.url === url &&
      cachedData.username === username &&
      cachedData.password === password &&
      cachedData.searchPath === searchPath
    )
  ) {
    cachedData.url = url;
    cachedData.username = username;
    cachedData.password = password;
    cachedData.searchPath = searchPath;
    cachedData.searchPathList =
      (_c = searchPath === null || searchPath === void 0 ? void 0 : searchPath.split) ===
        null || _c === void 0
        ? void 0
        : _c.call(searchPath, ",");
    cachedData.cacheFileList = null; // 缓存 lrc 文件列表
  }

  return (0, webdav_1.createClient)(url, {
    authType: webdav_1.AuthType.Password,
    username,
    password,
  });
}

function getSearchPathList() {
  const list = cachedData.searchPathList;
  if (list && list.length) {
    // trim 一下，避免用户写 "/lrc, /lyrics"
    return list.map((s) => String(s || "").trim()).filter((s) => s !== "");
  }
  return ["/"];
}

function isLrcFile(it) {
  if (!it || it.type !== "file") return false;
  const base = String(it.basename || "");
  return base.toLowerCase().endsWith(".lrc");
}

/**
 * 读取/缓存所有 lrc 文件（只读一层目录，不递归；和你 webdav 音乐插件一致）
 */
async function ensureLrcFileList() {
  const client = getClient();
  if (!client) return [];

  if (cachedData.cacheFileList) {
    return cachedData.cacheFileList;
  }

  let result = [];
  const searchPathList = getSearchPathList();

  for (let search of searchPathList) {
    try {
      const fileItems = await client.getDirectoryContents(search);
      const lrcItems = (fileItems || []).filter(isLrcFile);
      result = result.concat(lrcItems);
    } catch (_e) {}
  }

  cachedData.cacheFileList = result;
  return result;
}

/**
 * 歌词搜索：在 webdav 的 lrc 列表中按文件名包含 query 过滤
 * 返回结构模仿你给的“歌词插件”
 */
async function search(query, page, type) {
  if (type !== "lyric") {
    return;
  }

  const client = getClient();
  if (!client) {
    return { isEnd: true, data: [] };
  }

  const list = await ensureLrcFileList();

  const q = String(query || "");
  const data = (list || [])
    .filter((it) => String(it.basename || "").includes(q))
    .map((it) => ({
      title: it.basename, // 展示用
      id: it.filename, // 用 filename 作为唯一 id（后续 getLyric 可直接读）
      artist: "WebDAV",
      album: "LRC",
    }));

  return {
    isEnd: true,
    data,
  };
}

/**
 * 自动取歌词：
 * - 你的规则：lrc 文件名与音乐文件名完全一致
 * - 由于 MusicFree 的 musicItem.title 通常不包含扩展名，所以直接找 `${title}.lrc`
 * - 如果你本地实际是 “xxx.flac” 对应 “xxx.flac.lrc”，那就需要你告诉我，我再改匹配规则
 */
async function getLyric(musicItem) {
  const client = getClient();
  if (!client || !musicItem) {
    return null;
  }

  // 1) 如果是从 search 结果点进来的：musicItem.id 就是 lrc 路径
  if (musicItem.id && String(musicItem.id).toLowerCase().endsWith(".lrc")) {
    try {
      const raw = await client.getFileContents(musicItem.id, {
        format: "text",
      });
      return raw ? { rawLrc: String(raw) } : null;
    } catch (_e) {
      return null;
    }
  }

  // 2) 自动匹配：用 title 精确匹配同名 .lrc
  const title = String(musicItem.title || "").trim();
  if (!title) return null;

  const targetBaseName = `${title}.lrc`;

  const list = await ensureLrcFileList();
  const hit = (list || []).find(
    (it) => String(it.basename || "").toLowerCase() === targetBaseName.toLowerCase()
  );

  if (!hit || !hit.filename) {
    return null;
  }

  try {
    const raw = await client.getFileContents(hit.filename, { format: "text" });
    return raw ? { rawLrc: String(raw) } : null;
  } catch (_e) {
    return null;
  }
}

module.exports = {
  platform: "WebDAV歌词",
  author: "你自己",
  description: "�� WebDAV 中搜索/读取与歌曲文件名完全一致的 .lrc 歌词",
  version: "0.0.1",
  supportedSearchType: ["lyric"],
  cacheControl: "no-cache",

  // 用户变量：这里完全模仿 webdav插件.js 的字段名（url/username/password/searchPath）
  userVariables: [
    { key: "url", name: "WebDAV地址" },
    { key: "username", name: "用户名" },
    { key: "password", name: "密码", type: "password" },
    { key: "searchPath", name: "存放歌词的路径（可多个逗号分隔）" },
  ],

  search,
  getLyric,
};
