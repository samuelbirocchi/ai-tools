#!/usr/bin/env python3
import json
import os
import subprocess
import sys
import tempfile

SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "herdr-plan-fleet.py")
AGENTS = {"result": {"agents": [
    {"name": "tech-1", "workspace_id": "w1", "agent_status": "working", "tokens": {"role": "dev"}, "terminal_title_stripped": "TECH-1 build"},
    {"name": "deploy-5-api", "workspace_id": "w1", "agent_status": "idle", "tokens": {"role": "deploy", "helper": "deploy #5"}},
    {"name": "babysit-5-api", "workspace_id": "w1", "agent_status": "blocked", "tokens": {"role": "babysit", "helper": "babysit #5"}},
    {"name": "tech-2", "workspace_id": "w2", "agent_status": "done", "tokens": {"role": "dev"}},
    {"name": "tech-9", "workspace_id": "w9", "agent_status": "idle", "tokens": {"role": "dev"}},
    {"workspace_id": "w1", "agent_status": "idle"},
]}}
failed = 0


def check(name, ok, detail=""):
    global failed
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f": {detail}"))
    failed += not ok


def run(home, *args, herdr_ok=True):
    bin_dir = os.path.join(home, "bin")
    os.makedirs(bin_dir, exist_ok=True)
    with open(os.path.join(bin_dir, "herdr"), "w") as f:
        f.write("#!/bin/sh\n" + (f"cat <<'EOF'\n{json.dumps(AGENTS)}\nEOF\n" if herdr_ok else "exit 1\n"))
    os.chmod(os.path.join(bin_dir, "herdr"), 0o755)
    env = {**os.environ, "HOME": home, "PATH": f"{bin_dir}:{os.environ['PATH']}"}
    out = subprocess.run([sys.executable, SCRIPT, *args], capture_output=True, text=True, env=env)
    return json.loads(out.stdout) if out.returncode == 0 else out


def write(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f)


home = tempfile.mkdtemp()
state = os.path.join(home, ".claude/state/herdr-story")
write(f"{state}/w1_p1.json", {"workspace": "w1", "key": "TECH-1", "report_to": "Ads Plan"})
write(f"{state}/w1_p5.json", {"workspace": "w1", "key": "TECH-1", "report_to": "Ads Plan"})
write(f"{state}/w2_p1.json", {"workspace": "w2", "key": "TECH-2", "report_to": "Ads Plan"})
write(f"{state}/w9_p1.json", {"workspace": "w9", "key": "TECH-9", "report_to": "Other Plan"})
write(f"{home}/.claude/sessions/123.json", {"sessionId": "sid-1", "name": "Ads Plan"})

out = run(home, "sid-1")
check("session id resolves name", out["name"] == "Ads Plan", out)
check("only this plan's stories, sorted by key", [s["key"] for s in out["stories"]] == ["TECH-1", "TECH-2"], out)
check("story lists dev then babysit then deploy", [a["name"] for a in out["stories"][0]["agents"]] == ["tech-1", "babysit-5-api", "deploy-5-api"], out)
check("agent carries status, role and title", out["stories"][0]["agents"][0] == {"name": "tech-1", "role": "dev", "status": "working", "title": "TECH-1 build"}, out)
check("unnamed agents skipped", all(a["name"] for s in out["stories"] for a in s["agents"]), out)
check("by name", [s["key"] for s in run(home, "--name", "Other Plan")["stories"]] == ["TECH-9"])
out = run(home, "sid-unknown")
check("unknown session is empty", out == {"name": None, "herdr": True, "stories": []}, out)
out = run(home, "sid-1", herdr_ok=False)
check("herdr down keeps stories without agents", out["herdr"] is False and [s["agents"] for s in out["stories"]] == [[], []], out)
check("usage", run(home).returncode != 0)

subprocess.run(["trash", home])
print(f"{'ok' if not failed else 'FAILED'}: {failed} failed")
sys.exit(1 if failed else 0)
