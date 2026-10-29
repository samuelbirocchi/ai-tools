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


def story_members(name):
    plan_spaces = {}
    members = {}
    for path in glob.glob(os.path.join(HOME, ".claude", "state", "herdr-story", "*.json")):
        try:
            with open(path) as f:
                state = json.load(f)
        except (OSError, ValueError):
            continue
        if not state.get("space") or not state.get("terminal"):
            continue
        members.setdefault(state["space"], []).append(state)
        if state.get("report_to") == name:
            plan_spaces.setdefault(state["space"], state.get("key") or "?")
    return {space: (key, members[space]) for space, key in plan_spaces.items()}


def session_of(pid):
    try:
        with open(os.path.join(HOME, ".claude", "sessions", f"{pid}.json")) as f:
            return json.load(f).get("sessionId")
    except (OSError, ValueError):
        return None


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


def hc_json(*args):
    try:
        out = subprocess.run(["hc", *args], capture_output=True, text=True, timeout=10)
        return json.loads(out.stdout) if out.returncode == 0 else None
    except Exception:
        return None


def live_terminals():
    listing = hc_json("ls", "--json")
    return None if listing is None else {t["address"]: t for t in listing.get("terminals", [])}


def agent_row(member, live):
    terminal = live.get(member["terminal"])
    if terminal is None:
        return {"name": member.get("agent") or member["terminal"], "terminal": member["terminal"], "role": member.get("role") or "?", "status": "gone", "title": "", "waiting": ""}
    status = (terminal.get("status") or {}).get("state") or "?"
    detail = hc_json("get", member["terminal"]) or {}
    pid = (detail.get("foreground") or {}).get("pid")
    return {
        "name": member.get("agent") or member["terminal"],
        "terminal": member["terminal"],
        "role": member.get("role") or "?",
        "status": status,
        "title": (detail.get("title") or "").strip(),
        "waiting": waiting_on(session_of(pid)) if status in WAITING_STATUSES and pid else "",
    }


def fleet(name, live):
    rows = []
    for space, (key, members) in sorted(story_members(name).items(), key=lambda item: item[1][0]):
        agents = [agent_row(m, live) for m in members]
        agents.sort(key=lambda a: (ROLE_ORDER.get(a["role"], 9), a["name"]))
        rows.append({"key": key, "space": space, "agents": agents})
    return rows


def main():
    args = sys.argv[1:]
    if len(args) == 2 and args[0] == "--name":
        name = args[1]
    elif len(args) == 1:
        name = session_name(args[0])
    else:
        sys.exit("usage: herdr-plan-fleet.py <session-id> | --name <session name>")
    live = live_terminals()
    print(json.dumps({
        "name": name,
        "hc": live is not None,
        "stories": fleet(name, live or {}) if name else [],
    }))


if __name__ == "__main__":
    main()
