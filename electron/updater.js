// Hệ thống Kiểm tra & Cập nhật Online trực tiếp từ GitHub (Namhi86/md-motion-control)
import { app, ipcMain } from 'electron';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(here, '..');

export const GITHUB_REPO = 'Namhi86/md-motion-control';
export const GITHUB_BRANCH = 'main';
export const FEED_URL = `https://github.com/${GITHUB_REPO}`;

/**
 * Thực thi lệnh git trong thư mục ứng dụng (trả về stdout hoặc ném lỗi)
 */
function runGit(args, timeout = 15000) {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      { cwd: APP_ROOT, timeout, windowsHide: true },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error((stderr || err.message || '').trim()));
          return;
        }
        resolve(String(stdout || '').trim());
      }
    );
  });
}

/**
 * Thực hiện HTTP GET trả về Buffer (tự động theo dõi redirect)
 */
function fetchBuffer(url, headers = {}, redirects = 4) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent': 'MD-Motion-Control-Updater/2.5.2',
          Accept: 'application/vnd.github.v3+json, */*',
          'Cache-Control': 'no-cache',
          ...headers,
        },
        timeout: 20000,
      },
      (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location &&
          redirects > 0
        ) {
          res.resume();
          const nextUrl = new URL(res.headers.location, url).toString();
          fetchBuffer(nextUrl, headers, redirects - 1).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            const body = Buffer.concat(chunks).toString('utf8').slice(0, 300);
            reject(
              new Error(`HTTP ${res.statusCode} từ ${url}: ${body || 'Lỗi mạng'}`)
            );
          });
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      }
    );
    req.on('timeout', () => {
      req.destroy(new Error(`Quá thời gian kết nối tới ${url}`));
    });
    req.on('error', reject);
  });
}

async function fetchJson(url) {
  const buf = await fetchBuffer(url);
  return JSON.parse(buf.toString('utf8'));
}

/**
 * Kiểm tra xem file trên máy có khớp mã băm Git Blob SHA-1 trên GitHub Tree không
 * (Hỗ trợ cả LF và CRLF trên Windows để không báo sai do khác ký tự xuống dòng)
 */
function matchesGitBlobSha(filePath, expectedSha) {
  try {
    if (!existsSync(filePath) || !expectedSha) return false;
    const content = readFileSync(filePath);
    const shaOf = (buf) =>
      crypto
        .createHash('sha1')
        .update(Buffer.from(`blob ${buf.length}\0`, 'utf8'))
        .update(buf)
        .digest('hex');

    if (shaOf(content) === expectedSha) return true;
    // Kiểm tra bản chuẩn hóa CRLF -> LF trên Windows
    if (content.includes(13)) {
      const lfBuf = Buffer.from(
        content.toString('utf8').replace(/\r\n/g, '\n'),
        'utf8'
      );
      if (shaOf(lfBuf) === expectedSha) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Đọc phiên bản và commit SHA hiện tại đang chạy trên máy
 */
function getLocalMeta(userDataDir) {
  let localVersion = '2.5.2';
  try {
    const pkg = JSON.parse(
      readFileSync(path.join(APP_ROOT, 'package.json'), 'utf8')
    );
    if (pkg?.version) localVersion = String(pkg.version);
  } catch {}

  let localSha = '';
  try {
    const metaPath = path.join(userDataDir, 'update-meta.json');
    if (existsSync(metaPath)) {
      const m = JSON.parse(readFileSync(metaPath, 'utf8'));
      if (m?.sha) localSha = String(m.sha).trim();
    }
  } catch {}

  try {
    const gitRefPath = path.join(
      APP_ROOT,
      '.git',
      'refs',
      'heads',
      GITHUB_BRANCH
    );
    if (existsSync(gitRefPath)) {
      const refSha = readFileSync(gitRefPath, 'utf8').trim();
      if (refSha && refSha.length >= 7) {
        localSha = refSha;
      }
    }
  } catch {}

  return { localVersion, localSha };
}

function saveLocalMeta(userDataDir, { sha, version }) {
  try {
    mkdirSync(userDataDir, { recursive: true });
    writeFileSync(
      path.join(userDataDir, 'update-meta.json'),
      JSON.stringify(
        {
          sha: sha || '',
          version: version || '',
          updatedAt: Date.now(),
        },
        null,
        2
      ),
      'utf8'
    );
  } catch {}
}

/**
 * Kiểm tra xem một đường dẫn file trong repo có thuộc diện cập nhật Online không
 */
function isUpdatableRepoPath(relPath) {
  if (!relPath || relPath.includes('..')) return false;
  if (
    relPath === 'package.json' ||
    relPath === 'CHAY-MD-MOTION-CONTROL.bat'
  ) {
    return true;
  }
  return (
    relPath.startsWith('electron/') ||
    relPath.startsWith('src/') ||
    relPath.startsWith('web-ui/')
  );
}

/**
 * Kiểm tra cập nhật bằng Git CLI (nếu có .git và git trên máy)
 */
async function checkUpdateViaGitCli(userDataDir) {
  const { localVersion, localSha: fallbackSha } = getLocalMeta(userDataDir);
  await runGit(['fetch', 'origin', GITHUB_BRANCH], 15000);
  const localHead = await runGit(['rev-parse', 'HEAD']).catch(() => fallbackSha);
  const remoteHead = await runGit(['rev-parse', `origin/${GITHUB_BRANCH}`]);
  const diffRaw = await runGit([
    'diff',
    '--name-only',
    'HEAD',
    `origin/${GITHUB_BRANCH}`,
  ]).catch(() => '');
  const changedFiles = diffRaw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s && isUpdatableRepoPath(s));

  let remoteVersion = localVersion;
  try {
    const remotePkgRaw = await runGit([
      'show',
      `origin/${GITHUB_BRANCH}:package.json`,
    ]);
    const remotePkg = JSON.parse(remotePkgRaw);
    if (remotePkg?.version) remoteVersion = String(remotePkg.version);
  } catch {}

  const logRaw = await runGit([
    'log',
    `origin/${GITHUB_BRANCH}`,
    '-n',
    '5',
    '--pretty=format:%h|%s|%cI',
  ]).catch(() => '');
  const recentCommits = logRaw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [sha, message, date] = line.split('|');
      return { sha: sha || '', message: message || '', date: date || '' };
    });

  const hasUpdate =
    remoteVersion !== localVersion ||
    localHead.slice(0, 7) !== remoteHead.slice(0, 7) ||
    changedFiles.length > 0;

  if (!hasUpdate && remoteHead) {
    saveLocalMeta(userDataDir, { sha: remoteHead, version: remoteVersion });
  }

  return {
    ok: true,
    hasUpdate,
    changedFilesCount: changedFiles.length,
    localVersion,
    remoteVersion,
    localSha: localHead.slice(0, 7),
    remoteSha: remoteHead.slice(0, 7),
    fullRemoteSha: remoteHead,
    latestMessage:
      recentCommits[0]?.message || 'Đồng bộ bản mới nhất từ GitHub',
    latestDate: recentCommits[0]?.date || '',
    recentCommits,
    repoUrl: FEED_URL,
  };
}

/**
 * Kiểm tra phiên bản mới nhất trên GitHub (kết hợp GitHub Cloud API & Git CLI)
 */
export async function checkGithubUpdate(userDataDir) {
  const { localVersion, localSha } = getLocalMeta(userDataDir);
  const ts = Date.now();

  try {
    const [commits, remotePkg] = await Promise.all([
      fetchJson(
        `https://api.github.com/repos/${GITHUB_REPO}/commits?sha=${GITHUB_BRANCH}&per_page=6&_t=${ts}`
      ),
      fetchJson(
        `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/package.json?_t=${ts}`
      ).catch(() => ({ version: localVersion })),
    ]);

    const latest = Array.isArray(commits) && commits[0] ? commits[0] : null;
    const remoteSha = latest?.sha || '';
    const remoteVersion = String(remotePkg?.version || localVersion);

    let changedFilesCount = 0;
    try {
      const treeData = await fetchJson(
        `https://api.github.com/repos/${GITHUB_REPO}/git/trees/${GITHUB_BRANCH}?recursive=1&_t=${ts}`
      );
      if (Array.isArray(treeData?.tree)) {
        for (const item of treeData.tree) {
          if (item.type !== 'blob' || !isUpdatableRepoPath(item.path)) continue;
          const localFile = path.join(APP_ROOT, ...item.path.split('/'));
          if (!matchesGitBlobSha(localFile, item.sha)) {
            changedFilesCount++;
          }
        }
      }
    } catch {}

    const shaDiff = Boolean(
      localSha && remoteSha && localSha.slice(0, 7) !== remoteSha.slice(0, 7)
    );
    const verDiff = remoteVersion !== localVersion;
    const hasUpdate = verDiff || shaDiff || changedFilesCount > 0;

    const recentCommits = (Array.isArray(commits) ? commits.slice(0, 5) : []).map(
      (c) => ({
        sha: String(c?.sha || '').slice(0, 7),
        message: String(c?.commit?.message || '').split('\n')[0],
        date: c?.commit?.committer?.date || c?.commit?.author?.date || '',
      })
    );

    if (!hasUpdate && remoteSha) {
      saveLocalMeta(userDataDir, { sha: remoteSha, version: remoteVersion });
    }

    return {
      ok: true,
      hasUpdate,
      changedFilesCount,
      localVersion,
      remoteVersion,
      localSha: localSha ? localSha.slice(0, 7) : remoteSha.slice(0, 7),
      remoteSha: remoteSha ? remoteSha.slice(0, 7) : '',
      fullRemoteSha: remoteSha,
      latestMessage:
        latest?.commit?.message?.split('\n')[0] ||
        'Đồng bộ bản mới nhất từ GitHub',
      latestDate:
        latest?.commit?.committer?.date || latest?.commit?.author?.date || '',
      recentCommits,
      repoUrl: FEED_URL,
    };
  } catch (apiErr) {
    if (existsSync(path.join(APP_ROOT, '.git'))) {
      return await checkUpdateViaGitCli(userDataDir);
    }
    throw apiErr;
  }
}

/**
 * Tải và cập nhật trực tiếp các tệp mã nguồn mới nhất từ GitHub về máy
 */
export async function performGithubOnlineUpdate({ userDataDir, onProgress }) {
  const emit = (pct, stage, extra = {}) => {
    try {
      onProgress?.({ pct, stage, ...extra });
    } catch {}
  };

  emit(10, 'Đang kết nối máy chủ MD MEDIA & lấy danh sách tệp mới nhất...');
  const ts = Date.now();

  try {
    const treeData = await fetchJson(
      `https://api.github.com/repos/${GITHUB_REPO}/git/trees/${GITHUB_BRANCH}?recursive=1&_t=${ts}`
    );

    if (!Array.isArray(treeData?.tree)) {
      throw new Error('Không đọc được cấu trúc dữ liệu từ máy chủ cập nhật.');
    }

    const remoteSha = String(treeData.sha || '');
    const blobs = treeData.tree.filter(
      (item) => item.type === 'blob' && isUpdatableRepoPath(item.path)
    );

    emit(22, `Đang kiểm tra ${blobs.length} tệp hệ thống...`);
    const toDownload = [];
    for (const item of blobs) {
      const destPath = path.join(APP_ROOT, ...item.path.split('/'));
      if (!matchesGitBlobSha(destPath, item.sha)) {
        toDownload.push({ ...item, destPath });
      }
    }

    let updatedCount = 0;
    if (toDownload.length === 0) {
      emit(85, 'Tất cả các tệp hệ thống đã đồng bộ 100% với bản mới nhất.');
    } else {
      for (let i = 0; i < toDownload.length; i++) {
        const fileItem = toDownload[i];
        const pct = Math.min(
          92,
          Math.round(25 + ((i + 1) / toDownload.length) * 67)
        );
        emit(
          pct,
          `Đang tải gói cập nhật (${i + 1}/${toDownload.length})...`,
          { currentFile: fileItem.path }
        );
        const rawUrl = `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/${encodeURI(fileItem.path)}?_t=${Date.now()}`;
        const buf = await fetchBuffer(rawUrl);
        mkdirSync(path.dirname(fileItem.destPath), { recursive: true });
        writeFileSync(fileItem.destPath, buf);
        updatedCount++;
      }
    }

    if (existsSync(path.join(APP_ROOT, '.git'))) {
      await runGit(['fetch', 'origin', GITHUB_BRANCH], 10000).catch(() => {});
      await runGit(['reset', '--soft', `origin/${GITHUB_BRANCH}`], 5000).catch(
        () => {}
      );
    }

    let remoteVersion = '2.5.2';
    try {
      const pkg = JSON.parse(
        readFileSync(path.join(APP_ROOT, 'package.json'), 'utf8')
      );
      if (pkg?.version) remoteVersion = String(pkg.version);
    } catch {}

    saveLocalMeta(userDataDir, { sha: remoteSha, version: remoteVersion });
    emit(
      100,
      updatedCount > 0
        ? `Đã cập nhật thành công ${updatedCount} tệp mới nhất!`
        : 'Hệ thống đã được đồng bộ với bản mới nhất!'
    );

    return {
      ok: true,
      updatedCount,
      remoteVersion,
      remoteSha: remoteSha.slice(0, 7),
    };
  } catch (apiErr) {
    if (existsSync(path.join(APP_ROOT, '.git'))) {
      emit(35, 'Đang đồng bộ trực tiếp từ máy chủ MD MEDIA...');
      await runGit(['fetch', 'origin', GITHUB_BRANCH], 15000);
      const diffRaw = await runGit([
        'diff',
        '--name-only',
        'HEAD',
        `origin/${GITHUB_BRANCH}`,
      ]).catch(() => '');
      const changedCount = diffRaw.split(/\r?\n/).filter(Boolean).length;
      emit(75, 'Đang áp dụng các tệp cập nhật mới nhất...');
      await runGit(['reset', '--hard', `origin/${GITHUB_BRANCH}`], 15000);
      const remoteHead = await runGit(['rev-parse', 'HEAD']);
      let remoteVersion = '2.5.1';
      try {
        const pkg = JSON.parse(
          readFileSync(path.join(APP_ROOT, 'package.json'), 'utf8')
        );
        if (pkg?.version) remoteVersion = String(pkg.version);
      } catch {}
      saveLocalMeta(userDataDir, { sha: remoteHead, version: remoteVersion });
      emit(100, 'Đã đồng bộ hoàn tất phiên bản mới nhất!');
      return {
        ok: true,
        updatedCount: changedCount,
        remoteVersion,
        remoteSha: remoteHead.slice(0, 7),
      };
    }
    throw apiErr;
  }
}

/**
 * Khởi tạo các kênh IPC cho Trung tâm Cập nhật Online
 */
export function startUpdater({ log, win }) {
  const userDataDir = app.getPath('userData');
  const sendProgress = (payload) => {
    try {
      const w = typeof win === 'function' ? win() : win;
      if (w && !w.isDestroyed()) {
        w.webContents.send('updater:progress', payload);
      }
    } catch {}
  };

  try {
    ipcMain.removeHandler('updater:check');
    ipcMain.removeHandler('updater:install');
  } catch {}

  ipcMain.handle('updater:check', async () => {
    try {
      const res = await checkGithubUpdate(userDataDir);
      log?.(
        `Kiểm tra cập nhật Online: local=${res.localVersion} · remote=${res.remoteVersion}`
      );
      return res;
    } catch (err) {
      log?.('Lỗi khi kiểm tra cập nhật: ' + err.message);
      const { localVersion, localSha } = getLocalMeta(userDataDir);
      return {
        ok: false,
        error: 'Không kết nối được tới máy chủ cập nhật MD MEDIA.',
        localVersion,
        localSha: localSha.slice(0, 7),
      };
    }
  });

  ipcMain.handle('updater:install', async () => {
    try {
      const res = await performGithubOnlineUpdate({
        userDataDir,
        onProgress: sendProgress,
      });
      log?.(`Đã cập nhật Online: ${res.updatedCount} tệp`);
      return res;
    } catch (err) {
      log?.('Lỗi khi tải bản cập nhật: ' + err.message);
      return {
        ok: false,
        error: 'Không tải được bản cập nhật từ máy chủ MD MEDIA.',
      };
    }
  });

  return {
    check: () => checkGithubUpdate(userDataDir),
  };
}
