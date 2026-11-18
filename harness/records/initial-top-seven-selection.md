# Initial harness source selection

The Project coordinator selected the seven highest-starred eligible repositories
in the union of four GitHub repository searches on 2026-11-18. Each search sorted
by stars descending. The counts below are GitHub-reported matches at the time of
recording, before de-duplication and eligibility screening.

| Query | Reported matches |
| --- | ---: |
| `"coding agent" archived:false stars:>1000` | 304 |
| `"agent skills" archived:false stars:>1000` | 227 |
| `topic:ai-agents archived:false stars:>10000` | 150 |
| `"agent harness" archived:false stars:>1000` | 58 |

Eligible sources contain reusable general-purpose agent harness implementation
or software-delivery workflows/skills. Exclude forks, archived repositories,
link or app collections, general application/data infrastructure and unrelated
narrow specializations. This is a scoped, time-bound ranking, not an exhaustive
global popularity ranking. Repository-level license metadata is only a lead:
scanners must check the applicable terms and notices for each candidate file.

| Repository | Stars | Pinned ref | GitHub license metadata | Why inspect it |
| --- | ---: | --- | --- | --- |
| `obra/superpowers` | 319,865 | `main@22f0b463e7a5e579904dd6211a520321035526f7` | MIT | General coding lifecycle skills |
| `affaan-m/ECC` | 306,298 | `main@3f14a103a8694e51c1df9a806217a6d0b5f7a6f7` | MIT | Broad reusable agent configuration and workflows |
| `deepseek-ai/deepseek-harness` | 283,551 | `master@2e39e70496aa02986ca6a820c5d497e816b69d7e` | MIT | Coding-agent harness implementation |
| `NousResearch/hermes-agent` | 264,459 | `main@5d88f6eaad65f8916600d569b6f2df335dd51eab` | MIT | General-purpose agent harness implementation |
| `anomalyco/opencode` | 227,786 | `dev@ae88eb6a7a239d1220612a6331afc3b00487638b` | MIT | Coding-agent runtime and configuration patterns |
| `anthropics/skills` | 197,092 | `main@e4bb5d960d87126ff3b3a8af1a104b7db67560ba` | Not reported | Reusable skill packages and structure; verify file-level terms |
| `DietrichGebert/ponytail` | 193,868 | `main@96608e078b2d5ea607c5c3b8b5a54d1c1fba6846` | MIT | Lightweight coding-agent workflow |

The [pinned batch](batches/initial-top-seven/1.json) is the authoritative input
for scanner dispatch. Selection does not imply adoption or compatibility.
