import { execFile } from "node:child_process";

// GIT_OPTIONAL_LOCKS=0 stops `git diff` from refreshing the index, so stats
// collection never writes into another session's worktree.
const GIT_ENV = { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0" };

export function parseShortstat(text) {
    const out = { files: 0, added: 0, removed: 0 };
    if (typeof text !== "string") return out;
    const files = text.match(/(\d+) files? changed/);
    const added = text.match(/(\d+) insertions?\(\+\)/);
    const removed = text.match(/(\d+) deletions?\(-\)/);
    if (files) out.files = Number(files[1]);
    if (added) out.added = Number(added[1]);
    if (removed) out.removed = Number(removed[1]);
    return out;
}

export function parseCommitLog(text) {
    if (typeof text !== "string" || !text) return [];
    return text
        .split("\n")
        .map((line) => {
            const [at, parents = "", ...subject] = line.split("\t");
            return { at, merge: parents.trim().split(/\s+/).filter(Boolean).length > 1, subject: subject.join("\t").slice(0, 100) };
        })
        .filter((c) => c.at)
        .reverse();
}

function git(cwd, args, timeout = 8000) {
    return new Promise((resolve, reject) => {
        execFile("git", ["-C", cwd, ...args], { env: GIT_ENV, timeout, maxBuffer: 4 << 20 }, (err, stdout) =>
            err ? reject(err) : resolve(stdout.trim()),
        );
    });
}

async function firstOk(cwd, candidates) {
    for (const ref of candidates) {
        try {
            await git(cwd, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
            return ref;
        } catch {
            // try next candidate
        }
    }
    return null;
}

/**
 * Lines of work for a worktree relative to its default branch:
 * committed = merge-base..HEAD, uncommitted = HEAD..working tree (tracked files),
 * total = merge-base..working tree. Untracked files are counted, not line-diffed.
 */
export async function collectGitStats(cwd) {
    try {
        if ((await git(cwd, ["rev-parse", "--is-inside-work-tree"])) !== "true") return null;
    } catch {
        return null;
    }
    const branch = await git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]).catch(() => null);
    const baseRef = await firstOk(cwd, ["origin/main", "main", "origin/master", "master"]);
    let mergeBase = null;
    if (baseRef) mergeBase = await git(cwd, ["merge-base", "HEAD", baseRef]).catch(() => null);

    const [total, uncommitted, commits, untracked, lastCommit] = await Promise.all([
        mergeBase ? git(cwd, ["diff", "--shortstat", mergeBase]).then(parseShortstat) : null,
        git(cwd, ["diff", "--shortstat", "HEAD"]).then(parseShortstat).catch(() => parseShortstat("")),
        mergeBase ? git(cwd, ["rev-list", "--count", `${mergeBase}..HEAD`]).then(Number) : null,
        git(cwd, ["ls-files", "--others", "--exclude-standard"])
            .then((s) => (s ? s.split("\n").length : 0))
            .catch(() => null),
        git(cwd, ["log", "-1", "--format=%cI%x09%s"]).catch(() => ""),
    ]);
    // Commits on this branch since it left the default branch; merges are commits with 2+ parents.
    const log = mergeBase ? await git(cwd, ["log", "-n", "60", "--format=%cI%x09%P%x09%s", `${mergeBase}..HEAD`]).catch(() => "") : "";
    const history = parseCommitLog(log);
    const [lastCommitAt, ...subject] = lastCommit.split("\t");
    return {
        branch,
        baseRef,
        total,
        uncommitted,
        commits,
        untracked,
        history,
        lastCommit: lastCommitAt ? { at: lastCommitAt, subject: subject.join("\t").slice(0, 120) } : null,
        collectedAt: new Date().toISOString(),
    };
}
