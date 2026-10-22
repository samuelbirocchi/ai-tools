#!/usr/bin/env python3
import glob
import json
import os
import subprocess
import sys

HOME = os.path.expanduser("~")
ROLE_ORDER = {"dev": 0, "babysit": 1, "deploy": 2}
TAIL_BYTES = 262144
WAITING_CHARS = 160
WAITING_MARK = "Waiting on:"
WAITING_STATUSES = {"idle", "done"}


def session_name(session_id):
    for path in glob.glob(os.path.join(HOME, ".claude", "sessions", "*.json")):
        try:
            with open(path) as f:
                info = json.load(f)
        except (OSError, ValueError):
            continue
        if info.get("sessionId") == session_id and info.get("name"):
            return info["name"]
    return None


def stories_for(name):
    stories = {}
    for path in glob.glob(os.path.join(HOME, ".claude", "state", "herdr-story", "*.json")):
        try:
            with open(path) as f:
                state = json.load(f)
        except (OSError, ValueError):
            continue
        if state.get("report_to") == name and state.get("workspace"):
            stories.setdefault(state["workspace"], state.get("key") or "?")
    return stories


def waiting_on(session_id):
    if not session_id:
        return ""
    paths = glob.glob(os.path.join(HOME, ".claude", "projects", "*", f"{session_id}.jsonl"))
    if not paths:
        return ""
    with open(paths[0], "rb") as f:
        f.seek(0, os.SEEK_END)
        f.seek(max(0, f.tell() - TAIL_BYTES))
        lines = f.read().decode("utf-8", "replace").splitlines()
    for line in reversed(lines):
        try:
            entry = json.loads(line)
        except ValueError:
            continue
        if entry.get("type") != "assistant" or entry.get("isSidechain"):
            continue
        texts = [c.get("text", "") for c in (entry.get("message") or {}).get("content") or [] if isinstance(c, dict) and c.get("type") == "text"]
        if not texts:
            continue
        text = "\n".join(texts)
        at = text.rfind(WAITING_MARK)
        return text[at + len(WAITING_MARK):].strip().splitlines()[0][:WAITING_CHARS] if at >= 0 else ""
    return ""


def herdr_agents():
    try:
        out = subprocess.run(["herdr", "agent", "list"], capture_output=True, text=True, timeout=10).stdout
        return json.loads(out)["result"]["agents"]
    except Exception:
        return None


def fleet(name, agents):
    stories = stories_for(name)
    rows = []
    for workspace, key in sorted(stories.items(), key=lambda item: item[1]):
        members = [a for a in agents if a.get("workspace_id") == workspace and a.get("name")]
        members.sort(key=lambda a: (ROLE_ORDER.get((a.get("tokens") or {}).get("role"), 9), a["name"]))
        rows.append({
            "key": key,
            "workspace": workspace,
            "agents": [{
                "name": a["name"],
                "role": (a.get("tokens") or {}).get("role") or "?",
                "status": a.get("agent_status") or "?",
                "title": (a.get("terminal_title_stripped") or "").strip(),
                "waiting": waiting_on((a.get("agent_session") or {}).get("value")) if a.get("agent_status") in WAITING_STATUSES else "",
            } for a in members],
        })
    return rows


def main():
    args = sys.argv[1:]
    if len(args) == 2 and args[0] == "--name":
        name = args[1]
    elif len(args) == 1:
        name = session_name(args[0])
    else:
        sys.exit("usage: herdr-plan-fleet.py <session-id> | --name <session name>")
    agents = herdr_agents()
    print(json.dumps({
        "name": name,
        "herdr": agents is not None,
        "stories": fleet(name, agents or []) if name else [],
    }))


if __name__ == "__main__":
    main()
