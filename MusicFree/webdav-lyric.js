"use strict";
Object.defineProperty(exports, "__esModule", { value: true });

const webdav_1 = require("webdav");

let cachedData = {};

function stripExt(name) {
  // 只去掉最后一个扩展名：music.mp3 -> music
  // 如果本来就是 "musicName"（无扩展名）则不变
  const s = String(name || "").trim();
  const idx = s.lastIndexOf(".");
  if (idx <= 0) return s;
  return s.slice(0, idx);
}

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
      (_c =
        searchPath === null || searchPath === void 0
          ? void 0
          : searchPath.split) === null || _c === void 0
        ? void 0
        : _c.call(searchPath, ",");
    cachedData.cacheFileList = null;
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
    return list
      .map((s) => String(s || "").trim())
      .filter((s) => s !== "");
  }
  return ["/"];
}

function isLrcFile(it) {
  if (!it || it.type !== "file") return false;
  const base = String(it.basename || "");
  return base.toLowerCase().endsWith(".lrc");
}

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

async function search(query, page, type) {
  if (type !== "lyric") {
    return;
  }

  const client = getClient();
  if (!client) {
    return { isEnd: true, data: [] };
  }

  const list = await ensureLrcFileList();

  // 把 musicName.mp3 -> musicName
  const qNoExt = stripExt(query);

  const data = (list || [])
    .filter((it) => String(it.basename || "").includes(qNoExt))
    .map((it) => ({
      title: it.basename,
      id: it.filename,
      artist: "WebDAV",
      album: "LRC",
    }));

  return {
    isEnd: true,
    data,
  };
}

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
  const title = stripExt(musicItem.title || "");
  if (!title) return null;

  const targetBaseName = `${title}.lrc`;

  const list = await ensureLrcFileList();
  const hit = (list || []).find(
    (it) =>
      String(it.basename || "").toLowerCase() ===
      targetBaseName.toLowerCase()
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
  author: "Cyan",
  description: "从 WebDAV 中搜索/读取与歌曲文件名完全一致的 .lrc 歌词",
  version: "0.1.0",

  // “更新插件”依赖 srcUrl；“分享插件”通常也会用到 srcUrl（让别人一键安装同源插件）
  // 这里先留空字符串，你填上你实际托管的直链 .js 地址即可（例如 gitee raw / github raw）。
  // 如果你不填，更新按钮一般会不可用或无法更新。
  srcUrl: "",

  supportedSearchType: ["lyric"],
  cacheControl: "no-cache",
  userVariables: [
    { key: "url", name: "WebDAV地址" },
    { key: "username", name: "用户名" },
    { key: "password", name: "密码", type: "password" },
    { key: "searchPath", name: "存放歌词的路径（可多个逗号分隔）" },
  ],
  search,
  getLyric,
};
