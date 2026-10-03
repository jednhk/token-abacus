const MAX_LENGTH = 300;

const PATTERNS: [RegExp, string][] = [
  [/\bsk-[A-Za-z0-9_-]{16,}/g, "[key]"],                              // Anthropic / OpenAI keys
  [/\b(ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{16,}/g, "[key]"],     // GitHub tokens
  [/\bAKIA[0-9A-Z]{16}\b/g, "[key]"],                                 // AWS access keys
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[token]"], // JWTs
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]"],
  [/https?:\/\/[^\s?]+\?\S*/g, "[url]"],                              // URLs with query strings
  [/(?:~|\/(?:Users|home|var|tmp|opt|etc|private))\/[^\s,;:'"]+/g, "[path]"],
  [/\b[A-Za-z]:\\[^\s,;:'"]+/g, "[path]"],                            // Windows paths
];

/** Strip secrets, emails and paths from text before it leaves the machine. */
export function scrub(text: string): string {
  let out = text;
  for (const [pattern, replacement] of PATTERNS) out = out.replace(pattern, replacement);
  out = out.replace(/\s+/g, " ").trim();
  return out.length > MAX_LENGTH ? `${out.slice(0, MAX_LENGTH - 1)}…` : out;
}
