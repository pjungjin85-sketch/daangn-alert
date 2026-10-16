// 저장소 파일 읽기·쓰기와 Actions 실행. 토큰은 서버 환경변수(GITHUB_TOKEN)에만 있다.
const REPO = process.env.GITHUB_REPO || 'pjungjin85-sketch/daangn-alert';
const WORKFLOW = 'check.yml';
const CONFIG_PATH = 'config/keywords.json';

async function gh(path, opts = {}) {
  const res = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    ...opts,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'daangn-alert',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.message || `GitHub ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

export async function readConfig() {
  const file = await gh(`/contents/${CONFIG_PATH}?ref=main`);
  return { config: JSON.parse(Buffer.from(file.content, 'base64').toString('utf8')), sha: file.sha };
}

export async function writeConfig(config, sha, message) {
  const content = Buffer.from(JSON.stringify(config, null, 2) + '\n').toString('base64');
  const res = await gh(`/contents/${CONFIG_PATH}`, {
    method: 'PUT',
    body: JSON.stringify({ message, content, sha, branch: 'main' }),
  });
  return res.content.sha;
}

export const runWorkflow = (inputs = {}) =>
  gh(`/actions/workflows/${WORKFLOW}/dispatches`, { method: 'POST', body: JSON.stringify({ ref: 'main', inputs }) });

export async function lastRun() {
  const { workflow_runs: [run] } = await gh(`/actions/workflows/${WORKFLOW}/runs?per_page=1&exclude_pull_requests=true`);
  return run ? { status: run.status, conclusion: run.conclusion, updatedAt: run.updated_at, url: run.html_url, event: run.event } : null;
}
