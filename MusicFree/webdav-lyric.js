"use strict";

const { createClient, AuthType } = require("webdav");

/**
 * 用户变量缓存
 */
let cached = {};

function getVars() {
  const vars =
    (env && env.getUserVariables && env.getUserVariables.call(env)) || {};
  return vars || {};
}

function normalizePath(p) {
  if (!p) return "/";
  if (!p.startsWith("/")) p = "/" + p;
  // 去掉末尾多余 /
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p;
}

function splitPaths(pathsStr) {
  if (!pathsStr) return ["/"];
  const arr = String(pathsStr)
    .split(",")
    .map((s) => normalizePath(s.trim()))
    .filter(Boolean);
  return arr.length ? arr : ["/"];
}

function getClient() {
  const { url, username, password, lrcSearchPath } = getVars();
  if (!(url && username && password)) return null;

  // 变量变化时清缓存
  const key = `${url}@@${username}@@${password}@@${lrcSearchPath || ""}`;
  if (cached.key !== key) {
    cached.key = key;
    cached.url = url;
    cached.username = username;
    cached.password = password;
    cached.lrcSearchPathList = splitPaths(lrcSearchPath);
    cached.dirCache = {}; // path -> contents
  }

  return createClient(url, {
    authType: AuthType.Password,
    username,
    password,
  });
}

function isLrcFile(item) {
  // webdav getDirectoryContents 返回项通常有 basename/filename/type
  if (!item || item.type !== "file") return false;
  const name = (item.basename || item.filename || "").toLowerCase();
  return name.endsWith(".lrc");
}

function normalizeName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\.(lrc)$/i, "")
    .replace(/[\s\-\_\.\(\)\[\]【】（）「」'"]/g, "")
    .trim();
}

async function listLrcFilesInPath(client, p) {
  if (cached.dirCache[p]) return cached.dirCache[p];

  try {
    const items = await client.getDirectoryContents(p);
    const files = (items || []).filter(isLrcFile);
    cached.dirCache[p] = files;
    return files;
  } catch {
    cached.dirCache[p] = [];
    return [];
  }
}

async function findBestLrcFile(client, title, artist) {
  const { matchMode } = getVars(); // "exact" | "includes" | "smart"
  const mode = matchMode || "smart";

  const t = normalizeName(title);
  const ta = normalizeName(`${title}${artist ? artist : ""}`);
  const a = normalizeName(artist);

  let all = [];
  for (const p of cached.lrcSearchPathList || ["/"]) {
    const files = await listLrcFilesInPath(client, p);
    all = all.concat(files);
  }

  if (!all.length) return null;

  // 预计算候选名
  const scored = all.map((f) => {
    const base = f.basename || f.filename || "";
    const n = normalizeName(base);

    let score = 0;
    if (mode === "exact") {
      score = n === t || n === ta ? 100 : 0;
    } else if (mode === "includes") {
      if (n.includes(t) && t) score += 80;
      if (a && n.includes(a)) score += 10;
    } else {
      // smart：优先同名，其次包含，再次 title+artist
      if ((t && n === t) || (ta && n === ta)) score += 100;
      if (t && n.includes(t)) score += 60;
      if (a && n.includes(a)) score += 10;
      // 文件名更短更像“同名”
      score -= Math.min(n.length, 200) / 50;
    }

    return { file: f, score };
  });

  scored.sort((x, y) => y.score - x.score);

  // 分数太低就认为找不到
  if (!scored[0] || scored[0].score < 30) return null;
  return scored[0].file;
}

async function search(query, page, type) {
  if (type !== "lyric") return;

  const client = getClient();
  if (!client) {
    return { isEnd: true, data: [] };
  }

  // 简化：不做分页（因为 WebDAV 目录一般不太大；也可以后续加 page）
  const q = normalizeName(query);

  let all = [];
  for (const p of cached.lrcSearchPathList || ["/"]) {
    const files = await listLrcFilesInPath(client, p);
    all = all.concat(files);
  }

  const data = all
    .filter((f) => normalizeName(f.basename || f.filename || "").includes(q))
    .slice(0, 50)
    .map((f) => ({
      title: f.basename || f.filename,
      id: f.filename, // 直接用 webdav 的 filename 路径做 id
      artist: "WebDAV",
      album: "Lyrics",
    }));

  return { isEnd: true, data };
}

async function getLyric(musicItem) {
  const client = getClient();
  if (!client || !musicItem) return null;

  // 1) 如果是 search() 点进来的结果：musicItem.id 就是 lrc 路径
  // （兼容“手动搜索选择歌词文件”的用法）
  if (musicItem.id && String(musicItem.id).toLowerCase().endsWith(".lrc")) {
    try {
      const raw = await client.getFileContents(musicItem.id, {
        format: "text",
      });
      return raw ? { rawLrc: String(raw) } : null;
    } catch {
      return null;
    }
  }

  // 2) 自动匹配：按 title/artist 在 WebDAV 歌词库里找同名
  const title = musicItem.title || "";
  const artist = musicItem.artist || "";

  if (!title) return null;

  const file = await findBestLrcFile(client, title, artist);
  if (!file || !file.filename) return null;

  try {
    const raw = await client.getFileContents(file.filename, { format: "text" });
    return raw ? { rawLrc: String(raw) } : null;
  } catch {
    return null;
  }
}

module.exports = {
  platform: "WebDAV歌词库",
  version: "0.0.1",
  author: "Cyan",
  description: "在 WebDAV 指定目录中搜索/自动匹配同名 .lrc 文件",
  cacheControl: "no-cache",
  supportedSearchType: ["lyric"],
  userVariables: [
    { key: "url", name: "WebDAV地址" },
    { key: "username", name: "用户名" },
    { key: "password", name: "密码", type: "password" },
    {
      key: "lrcSearchPath",
      name: "歌词目录（可多个，逗号分隔）",
      hint: "例如：/Lyrics,/Music/LRC",
    },
    {
      key: "matchMode",
      name: "匹配模式：smart / exact / includes",
      hint: "默认 smart",
    },
  ],
  search,
  getLyric,
};
