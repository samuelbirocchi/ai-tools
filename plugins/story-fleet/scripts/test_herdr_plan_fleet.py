#!/usr/bin/env python3
import json
import os
import shutil
import subprocess
import sys
import tempfile

SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "herdr-plan-fleet.py")
LIVE = {"terminals": [
    {"address": "t1", "state": "live", "status": {"state": "working", "app": "claude-code"}},
    {"address": "t3", "state": "live", "status": {"state": "idle", "app": "claude-code"}},
    {"address": "t4", "state": "live", "status": {"state": "blocked", "app": "claude-code"}},
    {"address": "t5", "state": "live", "status": {"state": "done", "app": "claude-code"}},
    {"address": "t6", "state": "live", "status": {"state": "working", "app": "claude-code"}},
    {"address": "t7", "state": "live"},
    {"address": "t9", "state": "live", "status": {"state": "idle", "app": "claude-code"}},
]}
DETAIL = {
    "t1": {"title": "TECH-1 build", "foreground": {"pid": 111}},
    "t5": {"title": "", "foreground": {"pid": 555}},
    "t6": {"title": "", "foreground": {"pid": 666}},
}
failed = 0


def check(name, ok, detail=""):
    global failed
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f": {detail}"))
    failed += not ok


def run(home, *args, hc_ok=True):
    bin_dir = os.path.join(home, "bin")
    os.makedirs(bin_dir, exist_ok=True)
    body = "#!/usr/bin/env python3\nimport json, sys\n"
    if hc_ok:
        body += f"LIVE = {json.dumps(LIVE)}\nDETAIL = {json.dumps(DETAIL)}\n"
        body += "if sys.argv[1] == 'ls':\n    print(json.dumps(LIVE))\nelse:\n    print(json.dumps(DETAIL.get(sys.argv[2], {})))\n"
    else:
        body += "sys.exit(1)\n"
    with open(os.path.join(bin_dir, "hc"), "w") as f:
        f.write(body)
    os.chmod(os.path.join(bin_dir, "hc"), 0o755)
    env = {**os.environ, "HOME": home, "PATH": f"{bin_dir}:{os.environ['PATH']}"}
    out = subprocess.run([sys.executable, SCRIPT, *args], capture_output=True, text=True, env=env)
    return json.loads(out.stdout) if out.returncode == 0 else out


def write(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f)


home = tempfile.mkdtemp()
state = os.path.join(home, ".claude/state/herdr-story")
write(f"{state}/t1.json", {"terminal": "t1", "space": "sp1", "agent": "tech-1", "role": "dev", "key": "TECH-1", "report_to": "Ads Plan"})
write(f"{state}/t3.json", {"terminal": "t3", "space": "sp1", "agent": "deploy-5-api", "role": "deploy", "key": "TECH-1", "report_to": "Ads Plan"})
write(f"{state}/t4.json", {"terminal": "t4", "space": "sp1", "agent": "babysit-5-api", "role": "babysit", "key": "TECH-1", "report_to": "Ads Plan"})
write(f"{state}/t5.json", {"terminal": "t5", "space": "sp2", "agent": "tech-2", "role": "dev", "key": "TECH-2", "report_to": "Ads Plan"})
write(f"{state}/t6.json", {"terminal": "t6", "space": "sp2", "agent": "tech-3", "role": "babysit", "key": "TECH-2", "report_to": "Ads Plan"})
write(f"{state}/t9.json", {"terminal": "t9", "space": "sp9", "agent": "tech-9", "role": "dev", "key": "TECH-9", "report_to": "Other Plan"})
write(f"{state}/t8.json", {"terminal": "t8", "space": "sp3", "agent": "tech-8", "role": "dev", "key": "TECH-8", "report_to": "Ads Plan"})
write(f"{state}/w1_p1.json", {"workspace": "w1", "key": "TECH-0", "report_to": "Ads Plan"})
write(f"{home}/.claude/sessions/123.json", {"sessionId": "sid-1", "name": "Ads Plan"})
write(f"{home}/.claude/sessions/555.json", {"sessionId": "s-2"})
write(f"{home}/.claude/sessions/666.json", {"sessionId": "s-3"})


def assistant(text, sidechain=False):
    return json.dumps({"type": "assistant", "isSidechain": sidechain, "message": {"content": [{"type": "text", "text": text}]}})


os.makedirs(f"{home}/.claude/projects/-repo")
with open(f"{home}/.claude/projects/-repo/s-2.jsonl", "w") as f:
    f.write("\n".join([
        assistant("Waiting on: an old thing"),
        assistant("PR #201 is open. Waiting on: human review on go-libre#201, next wake: pr-wait-event exit\nMore text."),
        assistant("Waiting on: a subagent line", sidechain=True),
        json.dumps({"type": "user", "message": {"content": "hi"}}),
    ]) + "\n")
with open(f"{home}/.claude/projects/-repo/s-3.jsonl", "w") as f:
    f.write(assistant("Waiting on: should not show while working") + "\n")

out = run(home, "sid-1")
check("session id resolves name", out["name"] == "Ads Plan", out)
check("only this plan's stories, sorted by key", [s["key"] for s in out["stories"]] == ["TECH-1", "TECH-2", "TECH-8"], out)
check("story carries its space", [s["space"] for s in out["stories"]] == ["sp1", "sp2", "sp3"], out)
check("state files from the old herdr are ignored", all(s["key"] != "TECH-0" for s in out["stories"]), out)
check("story lists dev then babysit then deploy", [a["name"] for a in out["stories"][0]["agents"]] == ["tech-1", "babysit-5-api", "deploy-5-api"], out)
check("agent carries status, role and title", out["stories"][0]["agents"][0] == {"name": "tech-1", "terminal": "t1", "role": "dev", "status": "working", "title": "TECH-1 build", "waiting": ""}, out)
story2 = {a["name"]: a for a in out["stories"][1]["agents"]}
check("idle agent shows its last main-loop Waiting on line", story2["tech-2"]["waiting"] == "human review on go-libre#201, next wake: pr-wait-event exit", story2)
check("working agent shows no waiting line", story2["tech-3"]["waiting"] == "", story2)
check("a terminal hc no longer lists is gone", out["stories"][2]["agents"][0]["status"] == "gone", out)
check("by name", [s["key"] for s in run(home, "--name", "Other Plan")["stories"]] == ["TECH-9"])
out = run(home, "sid-unknown")
check("unknown session is empty", out == {"name": None, "hc": True, "stories": []}, out)
out = run(home, "sid-1", hc_ok=False)
check("hc down marks every agent gone", out["hc"] is False and {a["status"] for s in out["stories"] for a in s["agents"]} == {"gone"}, out)
check("usage", run(home).returncode != 0)

shutil.rmtree(home, ignore_errors=True)
print(f"{'ok' if not failed else 'FAILED'}: {failed} failed")
sys.exit(1 if failed else 0)
