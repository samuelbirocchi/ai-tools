#!/usr/bin/env python3
import glob
import json
import os
import subprocess
import sys

HOME = os.path.expanduser("~")
ROLE_ORDER = {"dev": 0, "babysit": 1, "deploy": 2}


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
