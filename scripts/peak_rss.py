#!/usr/bin/env python3
"""Run a command, sample the whole process tree's RSS every 0.25s, print peak."""
import subprocess, sys, time, os

def tree_rss(root_pid):
    total = 0
    seen = set()
    stack = [root_pid]
    while stack:
        pid = str(stack.pop()).strip()
        if not pid or pid in seen:
            continue
        seen.add(pid)
        try:
            with open(f"/proc/{pid}/statm") as f:
                pages = int(f.read().split()[1])
            total += pages * os.sysconf("SC_PAGE_SIZE")
            with open(f"/proc/{pid}/task/{pid}/children") as f:
                stack.extend(f.read().split())
        except (FileNotFoundError, ProcessLookupError, ValueError, IndexError):
            pass
    return total

cmd = sys.argv[1:]
p = subprocess.Popen(cmd)
peak = 0
t0 = time.time()
while p.poll() is None:
    peak = max(peak, tree_rss(p.pid))
    time.sleep(0.25)
peak = max(peak, tree_rss(p.pid))
print(f"exit={p.returncode} duration={time.time()-t0:.1f}s peak_rss={peak/1048576:.0f}MB", file=sys.stderr)
sys.exit(p.returncode or 0)
